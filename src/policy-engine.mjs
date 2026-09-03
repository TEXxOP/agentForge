import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const policyPath = resolve('policies/merchant-policies.json');
export const policyConfig = JSON.parse(readFileSync(policyPath, 'utf8'));
export const policies = policyConfig.policies;

function match(ruleId, outcome, message, evidence) {
  const policy = policies.find((item) => item.id === ruleId);
  return {
    ruleId,
    name: policy?.name || ruleId,
    severity: policy?.severity || 'medium',
    outcome,
    message,
    evidence
  };
}

function numericAmount(args) {
  const amount = Number(args.amount);
  return Number.isFinite(amount) ? amount : NaN;
}

export function evaluatePolicies({ action, caseState, sourceRisk, approvedRuleIds = [], disabledRuleIds = [] }) {
  const { tool, arguments: args = {} } = action;
  const matches = [];
  const approved = new Set(approvedRuleIds);
  const disabled = new Set(disabledRuleIds);
  const amount = numericAmount(args);
  const add = (ruleId, outcome, message, evidence) => {
    if (disabled.has(ruleId)) return;
    matches.push(match(ruleId, outcome, message, evidence));
  };

  if (!['create_payment_link', 'issue_refund', 'send_customer_message'].includes(tool)) {
    add('AP-SCHEMA', 'block', `Unknown tool “${tool}” is not registered.`, { tool });
  }

  if (!caseState) {
    add('AP-STATE', 'block', 'The action is not bound to a known payment case.', { caseId: action.caseId });
  }

  if (caseState && tool === 'issue_refund') {
    if (caseState.status !== 'paid') {
      add('AP-002', 'block', 'Only a captured, paid transaction can be refunded.', {
        expectedStatus: 'paid', actualStatus: caseState.status
      });
    }

    if (!args.recipient || args.recipient !== caseState.original_recipient) {
      add('AP-001', 'block', 'Refund recipient does not match the original payment.', {
        expected: caseState.original_recipient,
        proposed: args.recipient || null
      });
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > caseState.amount) {
      add('AP-002', 'block', 'Refund amount is outside the captured payment boundary.', {
        capturedAmount: caseState.amount,
        proposedAmount: Number.isFinite(amount) ? amount : args.amount
      });
    }

    if (caseState.refunds_today >= 1) {
      add('AP-004', 'block', 'Daily refund limit for this customer has already been reached.', {
        limit: 1,
        observed: caseState.refunds_today
      });
    }

    if (Number.isFinite(amount) && amount > 1000 && !approved.has('AP-003')) {
      add('AP-003', 'require_approval', 'High-value refund requires a human approval.', {
        threshold: 1000,
        proposedAmount: amount
      });
    }
  }

  if (caseState && tool === 'create_payment_link') {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) {
      add('AP-005', 'block', 'Payment link amount must be between ₹1 and ₹5,000.', {
        maximum: 5000,
        proposedAmount: Number.isFinite(amount) ? amount : args.amount
      });
    }

    if (Number.isFinite(amount) && amount !== caseState.amount) {
      add('AP-005', 'block', 'Payment link amount does not match the trusted case amount.', {
        trustedAmount: caseState.amount,
        proposedAmount: amount
      });
    }

    const expiry = Date.parse(args.expires_at || '');
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      add('AP-005', 'block', 'Payment link needs a future expiry.', {
        proposedExpiry: args.expires_at || null
      });
    }
  }

  if (caseState && tool === 'send_customer_message') {
    if (caseState.contact_count >= 2) {
      add('AP-006', 'block', 'Contact limit has been reached for this recovery case.', {
        limit: 2,
        observed: caseState.contact_count
      });
    }
    if (!String(args.message || '').trim()) {
      add('AP-SCHEMA', 'block', 'Customer message cannot be empty.', { field: 'message' });
    }
  }

  if (caseState && caseState.status === 'paid' && ['create_payment_link', 'send_customer_message'].includes(tool)) {
    add('AP-007', 'block', 'Recovery must stop because the payment is already successful.', {
      paymentId: caseState.payment_id,
      currentStatus: caseState.status
    });
  }

  if (sourceRisk?.level === 'high' && ['issue_refund', 'create_payment_link'].includes(tool) && !action.preauthorized) {
    add('AP-008', 'block', 'Consequential action is derived from an untrusted instruction.', {
      signal: sourceRisk.signal,
      sourceType: action.sourceType || 'external_text'
    });
  }

  const blocks = matches.filter((item) => item.outcome === 'block');
  const approvals = matches.filter((item) => item.outcome === 'require_approval');
  const decision = blocks.length ? 'blocked' : approvals.length ? 'approval' : 'allowed';

  return {
    decision,
    summary: decision === 'allowed'
      ? 'All active policies passed.'
      : decision === 'approval'
        ? approvals[0].message
        : blocks[0].message,
    matches,
    checkedPolicyCount: policies.length
  };
}

export function revalidateFreshState({ action, before, after }) {
  if (!after) {
    return { safe: false, ruleId: 'AP-010', reason: 'Case disappeared before execution.', evidence: { before: before?.status, after: null } };
  }
  if (before?.status !== after.status && after.status === 'paid' && ['create_payment_link', 'send_customer_message'].includes(action.tool)) {
    return {
      safe: false,
      ruleId: 'AP-010',
      reason: 'Payment succeeded after planning; the recovery action was cancelled.',
      evidence: { plannedState: before.status, freshState: after.status, paymentId: after.payment_id }
    };
  }
  if (action.tool === 'issue_refund' && after.refunds_today > (before?.refunds_today || 0)) {
    return {
      safe: false,
      ruleId: 'AP-010',
      reason: 'Another refund completed before execution; this action was cancelled.',
      evidence: { plannedRefunds: before.refunds_today, freshRefunds: after.refunds_today }
    };
  }
  return { safe: true, ruleId: 'AP-010', reason: 'Fresh state still permits execution.', evidence: { status: after.status } };
}
