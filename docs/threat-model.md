# Threat model

## Protected claim

For the declared demo policies and tools, an agent proposal should not cause an unsafe external action even when its source text is hostile, its event is replayed, or trusted payment state changes after planning.

## Assets

- merchant funds and captured payment balance;
- correct payment/customer/recipient binding;
- customer contact consent and frequency;
- test-mode API credentials;
- reviewer authority;
- action and evaluation evidence.

## Trust boundaries

Untrusted:

- customer messages and payment notes;
- webhook delivery timing and repetition;
- generated agent reasoning;
- model-generated scenario drafts;
- browser API input.

Trusted inside this demo:

- local case state loaded by the gateway;
- active deterministic policy code;
- local process configuration;
- a human reviewer operating the approval UI;
- the selected adapter implementation.

## Threats and controls

| Threat or failure | Consequence | Current control | Status |
| --- | --- | --- | --- |
| Direct prompt injection in a customer note | Unauthorized financial tool proposal | External text is classified, never trusted as state; AP-008 blocks detected consequential calls | Covered in guided demo |
| Hallucinated refund recipient | Money routed to wrong party | AP-001 exact match against original trusted recipient | Covered |
| Refund greater than captured amount | Excess merchant loss | AP-002 trusted amount boundary | Covered |
| High-value refund without review | Unauthorized large action | AP-003 exact pending approval plus full post-approval recheck | Covered |
| Replayed or duplicate webhook | Duplicate link, refund, or contact | AP-009 business-action idempotency key | Covered in guided demo |
| Payment succeeds after agent plans recovery | Confusing or double-charge risk | AP-010 just-in-time state revalidation | Covered in guided demo |
| Recovery continues after success | Customer harm / duplicate collection | AP-007 stopping rule | Covered |
| Excess customer messages | Spam / consent harm | AP-006 per-case contact cap | Covered |
| Missing or oversized payment link | Unbounded collection attempt | AP-005 amount match, ceiling, and future expiry | Covered |
| Approval reuse | Later unauthorized action | Database status is single-use and action fields are persisted | Covered in tests |
| Oblique instruction override | Semantic detector miss | Reported as an escaped violation in the fixed suite | Known miss |
| Split a large refund into smaller calls | Approval threshold bypass | AP-004 limits a second refund, but the first sub-threshold call may execute | Known gap; add cumulative daily/payment value policy |
| API timeout with unknown provider result | Blind retry creates duplicate action | Failed key prevents blind local retry | Partial; provider reference reconciliation is future work |
| Malicious local administrator rewrites the full DB and hashes | Evidence can be forged | Hash chain detects partial edits only | Out of scope; use external append-only/WORM log |
| Test secret leaks into model context | Credential compromise | Generator prompt contains only tools and policy; config is never audited/rendered | Covered by architecture |
| Cross-tenant case confusion | One merchant acts on another merchant's case | Single demo tenant only | Out of scope; production needs tenant-scoped identity and row keys |

## Explicit non-claims

AgentProof is not:

- a formal verification system;
- a compliance certification;
- a universal jailbreak or prompt-injection detector;
- a production multi-tenant payment service;
- a fraud detector or offense-capable security tool;
- authorization to use Razorpay live-mode credentials.

The product name means reproducible policy evidence within a declared evaluation boundary.

## Next security work

1. Track cumulative refund amount per payment/customer/window and approval token.
2. Reconcile unknown external outcomes by stable provider reference before changing idempotency status.
3. Verify signed Razorpay webhooks and deduplicate `x-razorpay-event-id` separately from action fingerprints.
4. Add tenant identity to every state and audit key.
5. Encrypt or redact customer identifiers at persistence boundaries.
6. Export audit heads to an external append-only sink.
7. Add approval expiry and a cryptographically signed, exact-action capability.
