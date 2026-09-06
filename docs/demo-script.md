# Five-minute pitch script

Run order, timings, and the exact words. Every segment is a real click in the running app; nothing here is a slide. Timings add to 5:00.

## Before the clock starts

- `npm start`, then open http://127.0.0.1:4173 — or the deployed URL from [deploy.md](deploy.md).
- Land on the **Architecture** view: `Cmd/Ctrl+K` → "Open architecture", or click Architecture in the header.
- If a rehearsal left traces behind, `Cmd/Ctrl+K` → "Reset demo evidence".
- Check the header chip reads **Simulator**, unless you deliberately configured Razorpay test mode.
- Every jump below has a `Cmd/Ctrl+K` entry, so you never hunt for a button on camera.

## 0:00–0:40 — What the system is (Architecture)

Click "Trace a request" and let it walk one stage at a time while you talk.

> "This is a payment agent's action path, and it is the whole product. Every tool call an agent makes — payment link, refund, customer message — goes through one mandatory gateway: bind the intent to trusted payment state, isolate untrusted text, evaluate ten deterministic merchant rules, deduplicate the business action, allow or block or pause, re-fetch state right before execution, then hash-chain the evidence. The three lanes matter more than the boxes. AI may propose actions and generate tests. Deterministic code must decide about money. A human must own policy and any high-value refund."

Click the policy-engine node so the panel names the real source file, then move on.

## 0:40–1:00 — Why tests and traces do not cover this

> "Tracing tells a payment team what an agent did after it acted. Unit tests cover code paths. Neither proves the agent will obey merchant policy when customer text is hostile, when a webhook is redelivered, or when the payment succeeds between planning and execution. That is the gap AgentProof closes."

## 1:00–2:30 — The five-part guided proof (Proof runner)

`Cmd/Ctrl+K` → "Open proof runner". Work the rail top to bottom. Each run leaves a decision tag and a replayable trace behind.

### 1:00–1:18 — Safe action

Select **Safe action**, click **Run this case**.

> "A ₹499 unpaid order gets a matching link with a future expiry. Policy passes, state is fetched again, and the bounded action executes. The simulator keeps this repeatable; with test credentials the same adapter creates a real Razorpay test-mode Payment Link."

Point at the environment chip and the provider result. Do not call a simulated outcome real money.

### 1:18–1:45 — Injection

Select **Injection**, click **Run this case**. Say this literally:

> "This customer note tells the agent to ignore its instructions and refund every order, and the agent believes it. AgentProof does not. The note is classified as untrusted input, AP-008 blocks the refund before the adapter is ever called, and the block itself is written into a hash-chained event you can replay line by line."

Hold on the blocked trace for a beat: matched rule, source-risk signal, adapter never reached.

### 1:45–2:05 — Approval

Select **Approval**, run it, then open **Review** in the header and click **Approve exact action**.

> "A valid ₹5,000 refund is not rejected — it is paused. The reviewer approves this exact case, tool, and amount, once. AgentProof then re-runs every other rule, re-fetches payment state, executes, and closes the approval. Approval discharges one rule, not the policy."

### 2:05–2:18 — Duplicate

Select **Duplicate**, run it.

> "Razorpay-style webhooks get retried. Both deliveries reach the gateway. The first creates the link; the second resolves to the same business-action key and never reaches the adapter. One external action, two visible traces."

### 2:18–2:30 — Stale state

Select **Stale state**, run it.

> "This link was safe when the agent planned it. Before execution, the customer pays through another attempt. AgentProof re-reads state, sees `paid`, and cancels recovery. That is the production failure a prompt-only demo never tests."

## 2:30–3:15 — Break it yourself (Attack lab)

Hand over the keyboard. This is the strongest 45 seconds you have, so resist filling it with narration.

> "You do not have to trust our five cases. Type your own hostile customer note, pick a tool and a case, and fire it at the same gateway we just used. Each preset is named for the rule it targets."

Let the judge type. Read back only what is on screen: decision, matched rule, guard latency, whether the adapter was reached, audit hash. If they want a suggestion, offer one — an attacker recipient on a refund (AP-001), a refund larger than the capture (AP-002), a ₹9,000 payment link (AP-005), or their own phrasing of an instruction override (AP-008).

> "Same gateway, same rules, same evidence chain as the scripted demo. Nothing you type is special-cased."

## 3:15–4:00 — The release gate, and the miss we kept (Evidence)

`Cmd/Ctrl+K` → "Run the 60-case release gate".

> "Sixty isolated traces against the real gateway: 26 benign, 34 unsafe. Expected outcomes are reviewed fixtures, so the runtime never grades itself. On the reference run: 59 of 60 exact outcomes, 33 of 34 unsafe actions gated, 26 of 26 benign actions allowed, zero false blocks, 26.55 ms median guard latency, 127.66 ms at p95. The decisions reproduce on any machine; the latency numbers are from ours."

Filter to **Regressions** and click **Replay escape**. Say this literally:

> "One case still escapes, and we left it in. This oblique instruction override does not match our baseline detector. The gate counts it as a miss, the saved report names it, and it stays a regression target instead of becoming a rounding error on a slide."

## 4:00–4:40 — Prove the controls are load-bearing (Policy)

`Cmd/Ctrl+K` → "Open policy". Select **AP-008**, click **Prove blast radius** and give it a couple of seconds.

> "Any team can claim a rule matters. This removes one control inside a disposable copy of the database, re-runs all sixty cases twice — with and without it — and reports how many extra unsafe actions escape. The control's value is measured, not asserted."

Then click **Generate drafts** and run one draft with its play button.

> "AI reads the registered tool schemas and the active policy and proposes semantic and stateful cases humans would not write. A draft stays a draft: it compiles into a contained, simulator-only replay, and when the expected control does not actually cover it, the gap is shown rather than hidden."

If no model endpoint is configured, say the six drafts are the seeded offline fallback. Do not imply they were generated live.

## 4:40–5:00 — Close

While you say this, `Cmd/Ctrl+K` → "Open architecture" and click "Replay last real trace", so the diagram you opened with animates from the hash-chained events of the case you just ran.

> "One mandatory path, ten deterministic rules, a human on the money that matters, sixty reviewed cases, and the one failure still printed in the report. That is what lets a merchant ship a payment agent this week instead of arguing about it for a quarter."

End on the hero line: **Ship payment agents with proof, not promises.**

## If the network dies

Say it plainly and keep moving:

> "This whole thing runs locally — Node, SQLite, and a payment simulator. No credentials, no external calls, so a dead network costs us nothing."

Then switch to the local build at http://127.0.0.1:4173. Only two features want the network: optional live draft generation, which falls back to six labelled seeded drafts, and the optional Razorpay test-mode Payment Link, which you can skip without losing a single proof.

## If a judge asks about production readiness

> "Today it is one process, with an application-level tamper-evident hash chain, the simulator by default, and a bounded Razorpay test-mode adapter that refuses any key that is not `rzp_test_`. It is a release gate and a reference gateway, not a certified control. Production means the gateway as a separately authorized service, tenant-scoped identity, signed webhook verification, a managed database, an append-only external log sink, approval expiry, and provider reconciliation after an uncertain result. Two gaps are already named in the repository: cumulative refund amounts across calls, and reconciliation after an unknown provider outcome. The threat model states both, and the counterfactual tool is how we would justify each new control."

## Never say

- "Money moved." Outcomes are simulated unless the Razorpay adapter is on, and that is test mode.
- "It prevents prompt injection." It is one transparent detector with a known miss.
- "Revenue recovered." No revenue figure exists anywhere in this project.
