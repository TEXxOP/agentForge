import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicies, revalidateFreshState } from '../src/policy-engine.mjs';

const baseCase = {
  id: 'case_test',
  customer_id: 'cust_test',
  customer_name: 'Test Customer',
  payment_id: 'pay_test',
  order_id: 'order_test',
  amount: 499,
  currency: 'INR',
  status: 'failed',
  payment_method: 'upi',
  original_recipient: 'customer@upi',
  contact_count: 0,
  refunds_today: 0
};

const lowRisk = { level: 'low', score: 0.05, signal: 'none' };

test('allows a correctly bounded expiring payment link', () => {
  const result = evaluatePolicies({
    action: {
      caseId: baseCase.id,
      tool: 'create_payment_link',
      arguments: { amount: 499, expires_at: new Date(Date.now() + 60_000).toISOString() }
    },
    caseState: baseCase,
    sourceRisk: lowRisk
  });
  assert.equal(result.decision, 'allowed');
  assert.equal(result.matches.length, 0);
});

test('blocks a refund to any recipient other than the original recipient', () => {
  const result = evaluatePolicies({
    action: { caseId: baseCase.id, tool: 'issue_refund', arguments: { amount: 400, recipient: 'attacker@upi' } },
    caseState: { ...baseCase, status: 'paid' },
    sourceRisk: lowRisk
  });
  assert.equal(result.decision, 'blocked');
  assert.ok(result.matches.some((match) => match.ruleId === 'AP-001'));
});

test('requires approval for a valid refund above ₹1,000', () => {
  const caseState = { ...baseCase, status: 'paid', amount: 5000, original_recipient: 'cust_test' };
  const result = evaluatePolicies({
    action: { caseId: caseState.id, tool: 'issue_refund', arguments: { amount: 5000, recipient: 'cust_test' }, preauthorized: true },
    caseState,
    sourceRisk: lowRisk
  });
  assert.equal(result.decision, 'approval');
  assert.ok(result.matches.some((match) => match.ruleId === 'AP-003'));
});

test('blocks consequential actions derived from high-risk untrusted input', () => {
  const result = evaluatePolicies({
    action: { caseId: baseCase.id, tool: 'issue_refund', arguments: { amount: 499, recipient: 'customer@upi' } },
    caseState: { ...baseCase, status: 'paid' },
    sourceRisk: { level: 'high', score: 0.99, signal: 'prompt_injection_pattern' }
  });
  assert.equal(result.decision, 'blocked');
  assert.ok(result.matches.some((match) => match.ruleId === 'AP-008'));
});

test('stopping rule blocks recovery after payment success', () => {
  const result = evaluatePolicies({
    action: {
      caseId: baseCase.id,
      tool: 'create_payment_link',
      arguments: { amount: 499, expires_at: new Date(Date.now() + 60_000).toISOString() }
    },
    caseState: { ...baseCase, status: 'paid' },
    sourceRisk: lowRisk
  });
  assert.equal(result.decision, 'blocked');
  assert.ok(result.matches.some((match) => match.ruleId === 'AP-007'));
});

test('fresh-state revalidation cancels a recovery race', () => {
  const result = revalidateFreshState({
    action: { tool: 'create_payment_link' },
    before: { ...baseCase, status: 'failed' },
    after: { ...baseCase, status: 'paid' }
  });
  assert.equal(result.safe, false);
  assert.equal(result.ruleId, 'AP-010');
});
