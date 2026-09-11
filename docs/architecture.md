# AgentProof architecture

## Design goal

AgentProof must prove one narrow claim end to end:

> A payment agent with three tools cannot reach an external adapter without passing the same deterministic merchant policies used by its pre-deployment tests.

The demo is intentionally a single-process system. This keeps the trust boundary reviewable while preserving the controls that matter: structured intent, trusted-state binding, idempotency, approval, just-in-time revalidation, adapter isolation, and append-only evidence.

## Components

### Deliberately imperfect payment agent

The demonstration subject can propose only:

- `create_payment_link(amount, expires_at)`
- `issue_refund(amount, recipient, reason)`
- `send_customer_message(channel, message)`

It is allowed to be wrong. It may follow an injected customer note, use stale status, repeat a webhook, or propose a high-value refund. The important invariant is that a proposal is not execution.

### Action intent

Every proposal becomes one structured object:

```json
{
  "caseId": "case_approval",
  "tool": "issue_refund",
  "arguments": {
    "amount": 5000,
    "recipient": "cust_meera",
    "reason": "merchant_authorized_return"
  },
  "sourceEventId": "payment.refund_requested:evt_123",
  "sourceText": "Merchant support approved a return review.",
  "actor": "demo_payment_agent",
  "preauthorized": true
}
```

The model does not supply trusted customer, payment, captured amount, current status, or original recipient. `caseId` resolves those fields from SQLite.

### Action gateway

`src/gateway.mjs` owns the only adapter reference. Its execution path is:

1. Derive or accept an idempotency key from case, event, tool, and canonical arguments.
2. Stop a key already handled.
3. Load trusted case state.
4. Persist `action_proposed` without the raw secret configuration.
5. Classify the untrusted source text and persist the signal, not the raw note.
6. Evaluate all relevant policies.
7. Persist and return `blocked`, create a bound approval, or continue.
8. Invoke the optional test hook that simulates a race.
9. Fetch case state again.
10. Cancel an action invalidated by the fresh state.
11. Execute through the selected adapter.
12. Apply the simulated state transition and persist the external result.

The external adapter is not exported to the browser or scenario generator.

### Policy engine

`src/policy-engine.mjs` is explicit code rather than free-form policy prompting. A decision has:

```json
{
  "decision": "blocked",
  "summary": "Refund recipient does not match the original payment.",
  "matches": [
    {
      "ruleId": "AP-001",
      "outcome": "block",
      "evidence": {
        "expected": "anaya@upi",
        "proposed": "attacker@upi"
      }
    }
  ]
}
```

Precedence is `block` over `require_approval` over `allow`. Human approval can discharge only the exact approval rule; every other rule and current-state condition is evaluated again.

### Approvals

An approval stores exact tool arguments, case, rule, idempotency key, trace, reviewer, and status. Resolution is single-use. Approval does not bypass recipient, amount, daily-refund, source-risk, or state policies. The gateway fetches current state again after the reviewer accepts.

For the hackathon demo, the exact-argument binding is stored and displayed. A production version would issue a short-lived signed approval capability containing the same binding and tenant identity.

### Idempotency and state freshness

Two controls address different payment failure modes:

- **Idempotency** stops an identical business action from executing twice after event redelivery or client retry.
- **Fresh-state revalidation** stops an action that was valid when planned but invalid when execution begins.

The duplicate demo deliberately calls the gateway twice with one key; the adapter call count remains one. The stale demo changes `failed` to `paid` between policy evaluation and execution; AP-010 cancels the link.

### Adapters

The simulator returns provider-shaped results and updates local case state. It powers batch evaluation.

The Razorpay test adapter:

- starts only with an `rzp_test_` key ID and secret;
- enables a real standard Payment Link action;
- applies a 12-second timeout;
- binds a reference to the demo order and case;
- never enables a live-mode endpoint;
- leaves refunds and messages simulated.

This asymmetric adapter is deliberate. A real Payment Link shows integration depth without making a hackathon safety demo capable of moving live money.

### Persistence and audit integrity

Node's built-in SQLite stores:

- payment cases;
- audit events;
- idempotency records;
- approvals;
- evaluation runs and results.

For each trace, an event hash covers canonical event content, timestamp, sequence, and previous hash. Replay recalculates the chain from `GENESIS` and reports the head. This detects individual application-level record changes. It is not a claim of immutable storage against a database administrator.

### Evaluation runner

Every scenario gets a unique case, order, payment, source event, and business-action key. Scenarios exercise the production gateway, not a second test-only implementation. The runner compares actual with explicit expected outcome and saves:

- exact outcome rate;
- unsafe detection and escape count;
- benign pass and false-block rate;
- duplicates and stale actions prevented;
- approval count;
- p50 and p95 guard latency;
- rule/result coverage;
- the first known miss.

### Scenario generator

The optional model receives only registered JSON tool schemas and public merchant policy definitions. It creates defensive scenario drafts. It does not receive API credentials, payment rows, or authority to activate policy. Model output is parsed as JSON, normalized, length-limited, tool-name allow-listed, marked `draft`, and presented for human review.

## Deployment boundary

The hackathon version is a local developer release gate. Production decomposition would place the gateway in a separately authorized service, use a durable queue, tenant-scoped identity, signed webhook verification, a managed database, an append-only external log sink, approval expiry, and provider reconciliation after uncertain outcomes. None of those claims are implied by the demo.
