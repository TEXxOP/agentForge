import { analyzeUntrustedInput } from './risk-analyzer.mjs';
import { evaluatePolicies, revalidateFreshState } from './policy-engine.mjs';
import { makeId, sha256, stableStringify } from './utils.mjs';

export class ActionGateway {
  constructor({ store, adapter }) {
    this.store = store;
    this.adapter = adapter;
  }

  fingerprint(intent) {
    return sha256(stableStringify({
      caseId: intent.caseId,
      sourceEventId: intent.sourceEventId,
      tool: intent.tool,
      arguments: intent.arguments
    }));
  }

  async execute(intent, options = {}) {
    const traceId = options.traceId || makeId('trace');
    const started = performance.now();
    const disabledRuleIds = options.disabledRuleIds || [];
    const disabledRules = new Set(disabledRuleIds);
    const action = {
      ...intent,
      traceId,
      sourceType: intent.sourceType || 'agent_proposal'
    };
    const idempotencyKey = intent.idempotencyKey || this.fingerprint(action);
    const existing = disabledRules.has('AP-009') ? null : this.store.getIdempotency(idempotencyKey);

    if (existing && existing.status !== 'pending') {
      this.store.appendAudit({
        traceId, caseId: action.caseId, eventType: 'duplicate_prevented', decision: 'duplicate',
        title: 'Duplicate action prevented',
        payload: { idempotencyKey, originalTraceId: existing.trace_id, originalStatus: existing.status, ruleId: 'AP-009' }
      });
      return this.result({
        traceId, decision: 'duplicate', summary: 'This business action was already handled.',
        reasonCode: 'duplicate_action', started, idempotencyKey, externalResult: existing.result
      });
    }

    const caseState = this.store.getCase(action.caseId);
    this.store.appendAudit({
      traceId, caseId: action.caseId, eventType: 'action_proposed', title: `Agent proposed ${action.tool}`,
      payload: {
        actor: action.actor || 'demo_payment_agent', tool: action.tool,
        arguments: action.arguments, sourceEventId: action.sourceEventId || null,
        idempotencyKey, stateVersion: caseState?.updated_at || null
      }
    });

    const sourceRisk = analyzeUntrustedInput(action.sourceText || '');
    this.store.appendAudit({
      traceId, caseId: action.caseId, eventType: 'input_analyzed', title: 'Untrusted input isolated',
      payload: sourceRisk
    });

    const policyResult = evaluatePolicies({
      action,
      caseState,
      sourceRisk,
      approvedRuleIds: options.approvedRuleIds || [],
      disabledRuleIds
    });
    this.store.appendAudit({
      traceId, caseId: action.caseId, eventType: 'policy_evaluated', decision: policyResult.decision,
      title: policyResult.decision === 'allowed' ? 'Policy checks passed' : 'Policy matched',
      payload: policyResult
    });

    if (policyResult.decision === 'blocked') {
      const blocked = {
        traceId, decision: 'blocked', summary: policyResult.summary,
        reasonCode: policyResult.matches.find((item) => item.outcome === 'block')?.ruleId || 'policy_block',
        matches: policyResult.matches, started, idempotencyKey
      };
      this.store.putIdempotency(idempotencyKey, traceId, 'blocked', blocked);
      this.store.appendAudit({
        traceId, caseId: action.caseId, eventType: 'action_blocked', decision: 'blocked',
        title: 'Unsafe action blocked before execution',
        payload: { summary: policyResult.summary, matches: policyResult.matches }
      });
      return this.result(blocked);
    }

    if (policyResult.decision === 'approval') {
      const approvalRule = policyResult.matches.find((item) => item.outcome === 'require_approval');
      const approval = this.store.createApproval({
        traceId, caseId: action.caseId, tool: action.tool, arguments: action.arguments,
        idempotencyKey, reason: approvalRule.message, ruleId: approvalRule.ruleId
      });
      this.store.putIdempotency(idempotencyKey, traceId, 'pending', { approvalId: approval.id });
      this.store.appendAudit({
        traceId, caseId: action.caseId, eventType: 'approval_requested', decision: 'approval',
        title: 'Action paused for human approval',
        payload: { approvalId: approval.id, rule: approvalRule, binding: this.fingerprint(action) }
      });
      return this.result({
        traceId, decision: 'approval', summary: approvalRule.message,
        reasonCode: approvalRule.ruleId, approval, matches: policyResult.matches,
        started, idempotencyKey
      });
    }

    return this.executeAllowed({ action, caseState, traceId, idempotencyKey, started, beforeExecute: options.beforeExecute, disabledRuleIds });
  }

  async executeAllowed({ action, caseState, traceId, idempotencyKey, started, beforeExecute, disabledRuleIds = [] }) {
    if (beforeExecute) await beforeExecute({ action, caseState, store: this.store });

    const freshState = this.store.getCase(action.caseId);
    const revalidation = revalidateFreshState({ action, before: caseState, after: freshState });
    this.store.appendAudit({
      traceId, caseId: action.caseId, eventType: 'state_revalidated',
      decision: revalidation.safe ? 'allowed' : 'stale',
      title: revalidation.safe ? 'Fresh state confirmed' : 'State changed before execution',
      payload: revalidation
    });

    if (!revalidation.safe && !disabledRuleIds.includes('AP-010')) {
      const stale = {
        traceId, decision: 'stale', summary: revalidation.reason,
        reasonCode: revalidation.ruleId, matches: [revalidation], started, idempotencyKey
      };
      this.store.putIdempotency(idempotencyKey, traceId, 'stale', stale);
      this.store.appendAudit({
        traceId, caseId: action.caseId, eventType: 'stale_state_prevented', decision: 'stale',
        title: 'Stale action cancelled', payload: revalidation
      });
      return this.result(stale);
    }

    if (!revalidation.safe) {
      this.store.appendAudit({
        traceId, caseId: action.caseId, eventType: 'counterfactual_bypass', decision: 'allowed',
        title: 'Counterfactual control bypassed',
        payload: { ...revalidation, bypassedRuleId: 'AP-010', testOnly: true }
      });
    }

    try {
      const externalResult = await this.adapter.execute(action, freshState);
      this.applyStateChange(action, freshState, externalResult);
      const allowed = {
        traceId, decision: 'allowed', summary: 'Action passed policy and executed.',
        reasonCode: 'all_policies_passed', externalResult, started, idempotencyKey
      };
      this.store.putIdempotency(idempotencyKey, traceId, 'executed', externalResult);
      this.store.appendAudit({
        traceId, caseId: action.caseId, eventType: 'action_executed', decision: 'allowed',
        title: `${action.tool} executed`,
        payload: { provider: this.adapter.mode, result: externalResult }
      });
      return this.result(allowed);
    } catch (error) {
      const failed = {
        traceId, decision: 'failed', summary: error.message,
        reasonCode: 'adapter_failure', started, idempotencyKey
      };
      this.store.putIdempotency(idempotencyKey, traceId, 'unknown_failure', { message: error.message });
      this.store.appendAudit({
        traceId, caseId: action.caseId, eventType: 'action_failed', decision: 'failed',
        title: 'External action failed safely',
        payload: { message: error.message, retryPolicy: 'reconcile_before_retry' }
      });
      return this.result(failed);
    }
  }

  applyStateChange(action, caseState, externalResult) {
    if (action.tool === 'issue_refund') {
      this.store.updateCase(caseState.id, {
        status: 'refunded',
        refunds_today: caseState.refunds_today + 1,
        metadata: { lastRefundId: externalResult.externalId }
      });
    }
    if (action.tool === 'send_customer_message') {
      this.store.updateCase(caseState.id, {
        contact_count: caseState.contact_count + 1,
        metadata: { lastMessageId: externalResult.externalId }
      });
    }
    if (action.tool === 'create_payment_link') {
      this.store.updateCase(caseState.id, {
        metadata: { lastPaymentLinkId: externalResult.externalId, lastPaymentLinkUrl: externalResult.url }
      });
    }
  }

  async resolveApproval(approvalId, resolution, reviewer = 'demo_reviewer') {
    const approval = this.store.getApproval(approvalId);
    if (!approval) throw new Error('Approval not found.');
    if (approval.status !== 'pending') throw new Error('Approval has already been resolved.');

    const accepted = resolution === 'approved';
    this.store.resolveApproval(approvalId, accepted ? 'approved' : 'rejected', reviewer);
    this.store.appendAudit({
      traceId: approval.trace_id, caseId: approval.case_id, eventType: 'approval_resolved',
      decision: accepted ? 'allowed' : 'blocked',
      title: accepted ? 'Human approved the bounded action' : 'Human rejected the action',
      payload: { approvalId, reviewer, resolution: accepted ? 'approved' : 'rejected' }
    });

    if (!accepted) {
      this.store.putIdempotency(approval.idempotency_key, approval.trace_id, 'rejected', { approvalId });
      return { traceId: approval.trace_id, decision: 'blocked', summary: 'Human reviewer rejected the action.', approvalId };
    }

    const action = {
      caseId: approval.case_id,
      traceId: approval.trace_id,
      tool: approval.tool,
      arguments: approval.arguments,
      actor: 'demo_payment_agent',
      sourceType: 'approved_action'
    };
    const caseState = this.store.getCase(action.caseId);
    const sourceRisk = analyzeUntrustedInput('');
    const recheck = evaluatePolicies({ action, caseState, sourceRisk, approvedRuleIds: [approval.rule_id] });
    if (recheck.decision !== 'allowed') {
      this.store.putIdempotency(approval.idempotency_key, approval.trace_id, 'blocked_after_approval', recheck);
      this.store.appendAudit({
        traceId: approval.trace_id, caseId: approval.case_id, eventType: 'action_blocked', decision: 'blocked',
        title: 'Action no longer safe after approval', payload: recheck
      });
      return { traceId: approval.trace_id, decision: 'blocked', summary: recheck.summary, matches: recheck.matches };
    }
    return this.executeAllowed({
      action, caseState, traceId: approval.trace_id,
      idempotencyKey: approval.idempotency_key, started: performance.now()
    });
  }

  result({ started, ...result }) {
    return {
      ...result,
      latencyMs: started === undefined ? 0 : Math.round((performance.now() - started) * 100) / 100,
      auditIntegrity: this.store.verifyTrace(result.traceId)
    };
  }
}
