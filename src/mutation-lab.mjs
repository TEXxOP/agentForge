import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimulatorAdapter } from './adapters.mjs';
import { AgentProofStore } from './database.mjs';
import { runEvaluation } from './evaluator.mjs';
import { ActionGateway } from './gateway.mjs';
import { policies } from './policy-engine.mjs';

function escapeKeys(evaluation) {
  return new Set(
    evaluation.results
      .filter((result) => result.unsafe && result.actual === 'allowed')
      .map((result) => result.scenario_name || result.scenarioName)
  );
}

export async function proveControlBlastRadius(ruleId) {
  const policy = policies.find((item) => item.id === ruleId);
  if (!policy) throw new Error(`Unknown policy: ${ruleId}`);

  const directory = mkdtempSync(join(tmpdir(), 'agentproof-mutation-'));
  const store = new AgentProofStore(join(directory, 'mutation.db'));
  const gateway = new ActionGateway({ store, adapter: new SimulatorAdapter() });

  try {
    const baseline = await runEvaluation({
      store,
      gateway,
      source: 'counterfactual_baseline'
    });
    const mutated = await runEvaluation({
      store,
      gateway,
      source: `counterfactual_${ruleId}_removed`,
      gatewayOptions: { disabledRuleIds: [ruleId] }
    });
    const baselineEscapes = escapeKeys(baseline);
    const newlyEscaped = mutated.results.filter((result) => (
      result.unsafe && result.actual === 'allowed' && !baselineEscapes.has(result.scenario_name || result.scenarioName)
    ));
    const newFalseBlocks = mutated.results.filter((result) => {
      const resultName = result.scenario_name || result.scenarioName;
      const baselineResult = baseline.results.find((item) => (item.scenario_name || item.scenarioName) === resultName);
      return !result.unsafe && baselineResult?.actual === 'allowed' && result.actual !== 'allowed';
    });

    return {
      ruleId,
      policy: { id: policy.id, name: policy.name, effect: policy.effect, severity: policy.severity },
      baseline: {
        unsafeEscapes: baseline.metrics.escapedViolations,
        falseBlocks: baseline.metrics.falseBlocks,
        unsafeGated: baseline.metrics.unsafeDetected
      },
      counterfactual: {
        unsafeEscapes: mutated.metrics.escapedViolations,
        falseBlocks: mutated.metrics.falseBlocks,
        unsafeGated: mutated.metrics.unsafeDetected
      },
      delta: {
        newlyEscaped: newlyEscaped.length,
        newFalseBlocks: newFalseBlocks.length,
        unsafeDetectionPoints: Number((mutated.metrics.unsafeDetectionRate - baseline.metrics.unsafeDetectionRate).toFixed(1))
      },
      escapedExamples: newlyEscaped.slice(0, 4).map((result) => ({
        name: result.scenario_name || result.scenarioName,
        category: result.category,
        expected: result.expected,
        actual: result.actual
      })),
      methodology: 'Two 60-case suites run in an ephemeral SQLite database with the simulator. The only counterfactual is this one control removed; no production state, credentials, or provider call is used.'
    };
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
