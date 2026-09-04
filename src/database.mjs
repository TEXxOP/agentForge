import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeId, nowIso, parseJson, sha256, stableStringify } from './utils.mjs';

function hydrateCase(row) {
  if (!row) return null;
  return {
    ...row,
    amount: Number(row.amount),
    contact_count: Number(row.contact_count),
    refunds_today: Number(row.refunds_today),
    metadata: parseJson(row.metadata_json, {})
  };
}

function hydrateAudit(row) {
  if (!row) return null;
  return { ...row, payload: parseJson(row.payload_json, {}) };
}

function hydrateApproval(row) {
  if (!row) return null;
  return { ...row, arguments: parseJson(row.arguments_json, {}) };
}

export class AgentProofStore {
  constructor(path = process.env.AGENTPROOF_DB_PATH || './data/agentproof.db') {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        original_recipient TEXT NOT NULL,
        failure_reason TEXT,
        contact_count INTEGER NOT NULL DEFAULT 0,
        refunds_today INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        sequence INTEGER NOT NULL,
        trace_id TEXT NOT NULL,
        case_id TEXT,
        event_type TEXT NOT NULL,
        decision TEXT,
        title TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_trace ON audit_events(trace_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        arguments_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        reason TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT
      );

      CREATE TABLE IF NOT EXISTS evaluation_runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        scenario_count INTEGER NOT NULL,
        metrics_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS evaluation_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        scenario_id TEXT NOT NULL,
        scenario_name TEXT NOT NULL,
        category TEXT NOT NULL,
        expected TEXT NOT NULL,
        actual TEXT NOT NULL,
        unsafe INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        latency_ms REAL NOT NULL,
        trace_id TEXT NOT NULL,
        details_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE
      );
    `);
  }

  close() {
    this.db.close();
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  clearDemoData() {
    this.transaction(() => {
      this.db.exec('DELETE FROM evaluation_results; DELETE FROM evaluation_runs; DELETE FROM approvals; DELETE FROM idempotency_keys; DELETE FROM audit_events; DELETE FROM cases;');
    });
  }

  upsertCase(input) {
    const timestamp = nowIso();
    const row = {
      currency: 'INR',
      payment_method: 'upi',
      failure_reason: 'Payment authorization failed',
      contact_count: 0,
      refunds_today: 0,
      metadata: {},
      ...input
    };
    this.db.prepare(`
      INSERT INTO cases (
        id, customer_id, customer_name, payment_id, order_id, amount, currency, status,
        payment_method, original_recipient, failure_reason, contact_count, refunds_today,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        customer_id=excluded.customer_id, customer_name=excluded.customer_name,
        payment_id=excluded.payment_id, order_id=excluded.order_id, amount=excluded.amount,
        currency=excluded.currency, status=excluded.status, payment_method=excluded.payment_method,
        original_recipient=excluded.original_recipient, failure_reason=excluded.failure_reason,
        contact_count=excluded.contact_count, refunds_today=excluded.refunds_today,
        metadata_json=excluded.metadata_json, updated_at=excluded.updated_at
    `).run(
      row.id, row.customer_id, row.customer_name, row.payment_id, row.order_id,
      row.amount, row.currency, row.status, row.payment_method, row.original_recipient,
      row.failure_reason, row.contact_count, row.refunds_today, JSON.stringify(row.metadata),
      row.created_at || timestamp, timestamp
    );
    return this.getCase(row.id);
  }

  seedCoreCases() {
    const fixtures = [
      {
        id: 'case_safe_link', customer_id: 'cust_anaya', customer_name: 'Anaya Rao',
        payment_id: 'pay_demo_499', order_id: 'order_demo_499', amount: 499, status: 'failed',
        payment_method: 'upi', original_recipient: 'anaya@upi', failure_reason: 'UPI collect request expired'
      },
      {
        id: 'case_injection', customer_id: 'cust_kabir', customer_name: 'Kabir Shah',
        payment_id: 'pay_demo_799', order_id: 'order_demo_799', amount: 799, status: 'failed',
        payment_method: 'card', original_recipient: 'cust_kabir', failure_reason: 'Customer note attached to failed payment'
      },
      {
        id: 'case_approval', customer_id: 'cust_meera', customer_name: 'Meera Iyer',
        payment_id: 'pay_demo_5000', order_id: 'order_demo_5000', amount: 5000, status: 'paid',
        payment_method: 'netbanking', original_recipient: 'cust_meera', failure_reason: null
      },
      {
        id: 'case_duplicate', customer_id: 'cust_vihaan', customer_name: 'Vihaan Nair',
        payment_id: 'pay_demo_349', order_id: 'order_demo_349', amount: 349, status: 'failed',
        payment_method: 'upi', original_recipient: 'vihaan@upi', failure_reason: 'Bank temporarily unavailable'
      },
      {
        id: 'case_stale', customer_id: 'cust_zoya', customer_name: 'Zoya Khan',
        payment_id: 'pay_demo_1299', order_id: 'order_demo_1299', amount: 1299, status: 'failed',
        payment_method: 'card', original_recipient: 'cust_zoya', failure_reason: 'Card authentication abandoned'
      }
    ];
    for (const fixture of fixtures) this.upsertCase(fixture);
    return fixtures.map((fixture) => this.getCase(fixture.id));
  }

  getCase(id) {
    return hydrateCase(this.db.prepare('SELECT * FROM cases WHERE id = ?').get(id));
  }

  updateCase(id, patch) {
    const current = this.getCase(id);
    if (!current) return null;
    return this.upsertCase({ ...current, ...patch, metadata: { ...current.metadata, ...(patch.metadata || {}) } });
  }

  listCases(limit = 100) {
    return this.db.prepare('SELECT * FROM cases ORDER BY updated_at DESC LIMIT ?').all(limit).map(hydrateCase);
  }

  appendAudit({ traceId, caseId = null, eventType, decision = null, title, payload = {} }) {
    const last = this.db.prepare('SELECT sequence, event_hash FROM audit_events WHERE trace_id = ? ORDER BY sequence DESC LIMIT 1').get(traceId);
    const sequence = (last?.sequence || 0) + 1;
    const previousHash = last?.event_hash || 'GENESIS';
    const createdAt = nowIso();
    const canonical = stableStringify({ traceId, caseId, eventType, decision, title, payload, sequence, createdAt, previousHash });
    const eventHash = sha256(canonical);
    const event = {
      id: makeId('evt'), sequence, trace_id: traceId, case_id: caseId,
      event_type: eventType, decision, title, payload_json: JSON.stringify(payload),
      previous_hash: previousHash, event_hash: eventHash, created_at: createdAt
    };
    this.db.prepare(`INSERT INTO audit_events
      (id, sequence, trace_id, case_id, event_type, decision, title, payload_json, previous_hash, event_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(...Object.values(event));
    return hydrateAudit(event);
  }

  getTrace(traceId) {
    return this.db.prepare('SELECT * FROM audit_events WHERE trace_id = ? ORDER BY sequence ASC').all(traceId).map(hydrateAudit);
  }

  listTraces(limit = 20) {
    const rows = this.db.prepare(`
      SELECT grouped.trace_id, grouped.case_id, grouped.started_at, grouped.updated_at, grouped.event_count,
             (SELECT decision FROM audit_events decision_event
              WHERE decision_event.trace_id = grouped.trace_id AND decision IS NOT NULL
              ORDER BY sequence DESC LIMIT 1) AS decision,
             (SELECT title FROM audit_events outcome_event
              WHERE outcome_event.trace_id = grouped.trace_id
                AND event_type IN ('action_executed','action_blocked','approval_requested','approval_resolved','duplicate_prevented','stale_state_prevented','action_failed')
              ORDER BY sequence DESC LIMIT 1) AS outcome
      FROM (
        SELECT trace_id, MAX(case_id) AS case_id, MIN(created_at) AS started_at,
               MAX(created_at) AS updated_at, COUNT(*) AS event_count
        FROM audit_events GROUP BY trace_id
      ) grouped
      ORDER BY grouped.updated_at DESC LIMIT ?
    `).all(limit);
    return rows.map((row) => ({ ...row, event_count: Number(row.event_count) }));
  }

  verifyTrace(traceId) {
    const events = this.getTrace(traceId);
    let previousHash = 'GENESIS';
    for (const event of events) {
      const canonical = stableStringify({
        traceId: event.trace_id, caseId: event.case_id, eventType: event.event_type,
        decision: event.decision, title: event.title, payload: event.payload,
        sequence: event.sequence, createdAt: event.created_at, previousHash
      });
      if (event.previous_hash !== previousHash || sha256(canonical) !== event.event_hash) {
        return { valid: false, eventId: event.id, checked: events.length };
      }
      previousHash = event.event_hash;
    }
    return { valid: true, checked: events.length, head: previousHash };
  }

  getIdempotency(key) {
    const row = this.db.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get(key);
    return row ? { ...row, result: parseJson(row.result_json, {}) } : null;
  }

  putIdempotency(key, traceId, status, result = {}) {
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO idempotency_keys (key, trace_id, status, result_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET status=excluded.status, result_json=excluded.result_json, updated_at=excluded.updated_at
    `).run(key, traceId, status, JSON.stringify(result), timestamp, timestamp);
  }

  createApproval({ traceId, caseId, tool, arguments: args, idempotencyKey, reason, ruleId }) {
    const approval = {
      id: makeId('apr'), trace_id: traceId, case_id: caseId, tool,
      arguments_json: JSON.stringify(args), idempotency_key: idempotencyKey,
      reason, rule_id: ruleId, status: 'pending', created_at: nowIso(),
      resolved_at: null, resolved_by: null
    };
    this.db.prepare(`INSERT INTO approvals
      (id, trace_id, case_id, tool, arguments_json, idempotency_key, reason, rule_id, status, created_at, resolved_at, resolved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(...Object.values(approval));
    return hydrateApproval(approval);
  }

  getApproval(id) {
    return hydrateApproval(this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id));
  }

  listApprovals(status = null) {
    const rows = status
      ? this.db.prepare('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC').all(status)
      : this.db.prepare('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50').all();
    return rows.map(hydrateApproval);
  }

  resolveApproval(id, status, resolvedBy = 'demo_reviewer') {
    this.db.prepare('UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?')
      .run(status, nowIso(), resolvedBy, id);
    return this.getApproval(id);
  }

  createEvaluationRun({ id, name, source, scenarioCount }) {
    this.db.prepare(`INSERT INTO evaluation_runs
      (id, name, source, scenario_count, metrics_json, created_at, completed_at)
      VALUES (?, ?, ?, ?, '{}', ?, NULL)`
    ).run(id, name, source, scenarioCount, nowIso());
  }

  addEvaluationResult(result) {
    this.db.prepare(`INSERT INTO evaluation_results
      (id, run_id, scenario_id, scenario_name, category, expected, actual, unsafe, correct, latency_ms, trace_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      result.id, result.runId, result.scenarioId, result.scenarioName, result.category,
      result.expected, result.actual, result.unsafe ? 1 : 0, result.correct ? 1 : 0,
      result.latencyMs, result.traceId, JSON.stringify(result.details || {})
    );
  }

  completeEvaluationRun(id, metrics) {
    this.db.prepare('UPDATE evaluation_runs SET metrics_json = ?, completed_at = ? WHERE id = ?')
      .run(JSON.stringify(metrics), nowIso(), id);
    return this.getEvaluationRun(id);
  }

  getEvaluationRun(id) {
    const row = this.db.prepare('SELECT * FROM evaluation_runs WHERE id = ?').get(id);
    if (!row) return null;
    const results = this.db.prepare('SELECT * FROM evaluation_results WHERE run_id = ? ORDER BY rowid ASC').all(id)
      .map((item) => ({ ...item, unsafe: Boolean(item.unsafe), correct: Boolean(item.correct), details: parseJson(item.details_json, {}) }));
    return { ...row, metrics: parseJson(row.metrics_json, {}), results };
  }

  getLatestEvaluation() {
    const row = this.db.prepare('SELECT id FROM evaluation_runs WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1').get();
    return row ? this.getEvaluationRun(row.id) : null;
  }

  getOverview() {
    const audit = this.db.prepare(`SELECT
      COUNT(DISTINCT trace_id) AS traces,
      COUNT(*) AS events,
      SUM(CASE WHEN event_type='action_blocked' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN event_type='duplicate_prevented' THEN 1 ELSE 0 END) AS duplicates,
      SUM(CASE WHEN event_type='stale_state_prevented' THEN 1 ELSE 0 END) AS stale,
      SUM(CASE WHEN event_type='action_executed' THEN 1 ELSE 0 END) AS executed
      FROM audit_events`).get();
    return {
      ...Object.fromEntries(Object.entries(audit).map(([key, value]) => [key, Number(value || 0)])),
      pendingApprovals: Number(this.db.prepare("SELECT COUNT(*) AS count FROM approvals WHERE status='pending'").get().count),
      cases: Number(this.db.prepare('SELECT COUNT(*) AS count FROM cases').get().count)
    };
  }
}
