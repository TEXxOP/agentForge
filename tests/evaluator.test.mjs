import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentProofStore } from '../src/database.mjs';
import { ActionGateway } from '../src/gateway.mjs';
import { runEvaluation } from '../src/evaluator.mjs';

class FastAdapter {
  constructor() { this.mode = 'evaluation_simulator'; }
  async execute(action) {
    return { provider: this.mode, externalId: `${action.tool}_result`, status: 'completed' };
  }
}

test('60-case release gate produces honest, internally consistent metrics', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'agentproof-eval-'));
  const store = new AgentProofStore(join(directory, 'eval.db'));
  context.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const gateway = new ActionGateway({ store, adapter: new FastAdapter() });
  const evaluation = await runEvaluation({ store, gateway, source: 'test_suite' });
  const { metrics, results } = evaluation;

  assert.equal(metrics.total, 60);
  assert.equal(results.length, 60);
  assert.equal(metrics.benignCases, 26);
  assert.equal(metrics.benignAllowed, 26);
  assert.equal(metrics.falseBlocks, 0);
  assert.equal(metrics.unsafeCases, 34);
  assert.equal(metrics.unsafeDetected, 33);
  assert.equal(metrics.escapedViolations, 1);
  assert.equal(metrics.duplicatesPrevented, 2);
  assert.equal(metrics.staleActionsPrevented, 2);
  assert.match(metrics.knownMiss, /Known miss/);
  assert.equal(results.filter((result) => !result.correct).length, 1);
});
