import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentProofStore } from '../src/database.mjs';
import { ActionGateway } from '../src/gateway.mjs';

class CountingAdapter {
  constructor() {
    this.mode = 'test_adapter';
    this.calls = [];
  }

  async execute(action) {
    this.calls.push(action);
    return { provider: this.mode, externalId: `external_${this.calls.length}`, status: 'created' };
  }
}

function createHarness() {
  const directory = mkdtempSync(join(tmpdir(), 'agentproof-test-'));
  const store = new AgentProofStore(join(directory, 'test.db'));
  const adapter = new CountingAdapter();
  const gateway = new ActionGateway({ store, adapter });
  const caseState = store.upsertCase({
    id: 'case_gateway', customer_id: 'cust_gateway', customer_name: 'Gateway Test',
    payment_id: 'pay_gateway', order_id: 'order_gateway', amount: 499,
    status: 'failed', payment_method: 'upi', original_recipient: 'gateway@upi',
    failure_reason: 'synthetic', contact_count: 0, refunds_today: 0, metadata: {}
  });
  return {
    store, adapter, gateway, caseState,
    close() { store.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}

function linkIntent(overrides = {}) {
  return {
    caseId: 'case_gateway',
    tool: 'create_payment_link',
    arguments: { amount: 499, expires_at: new Date(Date.now() + 60_000).toISOString() },
    sourceEventId: 'evt_gateway',
    sourceText: 'Please create a fresh recovery link.',
    ...overrides
  };
}

test('all permitted tool calls pass through policy, revalidation, adapter, and audit', async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());
  const result = await harness.gateway.execute(linkIntent());
  assert.equal(result.decision, 'allowed');
  assert.equal(harness.adapter.calls.length, 1);
  const trace = harness.store.getTrace(result.traceId);
  assert.deepEqual(trace.map((event) => event.event_type), [
    'action_proposed', 'input_analyzed', 'policy_evaluated', 'state_revalidated', 'action_executed'
  ]);
  assert.equal(harness.store.verifyTrace(result.traceId).valid, true);
});

test('idempotency prevents the same external action from executing twice', async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());
  const intent = linkIntent({ idempotencyKey: 'same_business_action' });
  const first = await harness.gateway.execute(intent);
  const second = await harness.gateway.execute(intent);
  assert.equal(first.decision, 'allowed');
  assert.equal(second.decision, 'duplicate');
  assert.equal(harness.adapter.calls.length, 1);
  assert.equal(harness.store.getTrace(second.traceId).at(-1).event_type, 'duplicate_prevented');
});

test('just-in-time state revalidation cancels an action when payment succeeds', async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());
  const result = await harness.gateway.execute(linkIntent({ sourceEventId: 'evt_stale' }), {
    beforeExecute: async () => harness.store.updateCase('case_gateway', { status: 'paid' })
  });
  assert.equal(result.decision, 'stale');
  assert.equal(harness.adapter.calls.length, 0);
  assert.equal(harness.store.getTrace(result.traceId).at(-1).event_type, 'stale_state_prevented');
});

test('high-value approval is exact, single-use, and revalidated', async (context) => {
  const harness = createHarness();
  context.after(() => harness.close());
  harness.store.updateCase('case_gateway', { status: 'paid', amount: 5000, original_recipient: 'cust_gateway' });
  const proposed = await harness.gateway.execute({
    caseId: 'case_gateway', tool: 'issue_refund', sourceEventId: 'evt_refund', preauthorized: true,
    sourceText: 'Authorized return.', arguments: { amount: 5000, recipient: 'cust_gateway', reason: 'return' }
  });
  assert.equal(proposed.decision, 'approval');
  assert.equal(harness.adapter.calls.length, 0);
  const executed = await harness.gateway.resolveApproval(proposed.approval.id, 'approved', 'test_reviewer');
  assert.equal(executed.decision, 'allowed');
  assert.equal(harness.adapter.calls.length, 1);
  await assert.rejects(
    () => harness.gateway.resolveApproval(proposed.approval.id, 'approved', 'test_reviewer'),
    /already been resolved/
  );
});
