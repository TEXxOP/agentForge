import { buildEvaluationSuite, runScenario } from './scenarios.mjs';
import { makeId, median, round } from './utils.mjs';

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

export async function runEvaluation({ store, gateway, source = 'golden_and_seeded_mutations', gatewayOptions = {} }) {
  const runId = makeId('eval');
  const scenarios = buildEvaluationSuite(runId);
  store.createEvaluationRun({
    id: runId,
    name: 'AgentProof 60-case release gate',
    source,
    scenarioCount: scenarios.length
  });

  const results = [];
  for (const scenario of scenarios) {
    const outcome = await runScenario({ scenario, store, gateway, gatewayOptions });
    const correct = outcome.decision === scenario.expectedDecision;
    const result = {
      id: makeId('result'),
      runId,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      category: scenario.category,
      expected: scenario.expectedDecision,
      actual: outcome.decision,
      unsafe: scenario.unsafe,
      correct,
      latencyMs: outcome.latencyMs || 0,
      traceId: outcome.traceId,
      details: {
        summary: outcome.summary,
        reasonCode: outcome.reasonCode,
        approvalId: outcome.approval?.id || null
      }
    };
    store.addEvaluationResult(result);
    if (outcome.approval?.id) store.resolveApproval(outcome.approval.id, 'evaluation_only', 'evaluation_runner');
    results.push(result);
  }

  const unsafe = results.filter((result) => result.unsafe);
  const benign = results.filter((result) => !result.unsafe);
  const unsafeDetected = unsafe.filter((result) => result.actual !== 'allowed').length;
  const benignAllowed = benign.filter((result) => result.actual === 'allowed').length;
  const falseBlocks = benign.filter((result) => result.actual !== 'allowed').length;
  const escapes = unsafe.filter((result) => result.actual === 'allowed').length;
  const latencies = results.map((result) => result.latencyMs);
  const coverage = {};
  for (const result of results) {
    const code = result.details.reasonCode || 'all_policies_passed';
    coverage[code] = (coverage[code] || 0) + 1;
  }

  const metrics = {
    total: results.length,
    exactOutcomes: results.filter((result) => result.correct).length,
    exactOutcomeRate: round((results.filter((result) => result.correct).length / results.length) * 100),
    unsafeCases: unsafe.length,
    unsafeDetected,
    unsafeDetectionRate: round((unsafeDetected / unsafe.length) * 100),
    benignCases: benign.length,
    benignAllowed,
    benignPassRate: round((benignAllowed / benign.length) * 100),
    falseBlocks,
    falseBlockRate: round((falseBlocks / benign.length) * 100),
    escapedViolations: escapes,
    duplicatesPrevented: results.filter((result) => result.actual === 'duplicate').length,
    staleActionsPrevented: results.filter((result) => result.actual === 'stale').length,
    approvalsRequired: results.filter((result) => result.actual === 'approval').length,
    medianLatencyMs: round(median(latencies), 2),
    p95LatencyMs: round(percentile(latencies, 95), 2),
    coverage,
    knownMiss: results.find((result) => !result.correct)?.scenarioName || null,
    methodology: 'Fixed, reviewable fixtures plus deterministic expected outcomes. Synthetic results are not production guarantees.'
  };

  return store.completeEvaluationRun(runId, metrics);
}
