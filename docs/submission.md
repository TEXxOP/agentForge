# Application-ready project summary

## Track

Open Track

## Project title

AgentProof - Safety testing and runtime policy enforcement for action-taking AI agents

## Objective / what it solves

AI agents that create payment links, issue refunds, or contact customers are non-deterministic and operate on changing state. Ordinary unit tests miss prompt injection, duplicate webhook delivery, stale payment status, incorrect recipients, amount hallucination, and approval bypass; observability often explains the damage only after execution.

AgentProof is a pre-deployment release gate and runtime action gateway for payment agents. It uses AI to generate adversarial scenarios from an agent’s tool schemas and merchant policies, executes those scenarios in an isolated payment simulator, deterministically allows, blocks, or pauses every consequential tool call, revalidates payment state just before execution, prevents duplicates, and produces a replayable hash-chained evidence trail.

The working demo has three tools, ten policies/invariants, a human approval queue, a bounded Razorpay test-mode Payment Link adapter, five stateful guided failures, and a 60-case evaluation dashboard. The reference run gated 33 of 34 unsafe traces (97.1%), passed all 26 legitimate traces with zero false blocks, prevented every seeded duplicate and stale action, and reports one known semantic miss honestly. All batch outcomes are clearly labelled synthetic.

## Why AI is meaningful

AI expands adversarial coverage by reading the registered JSON tool schemas and active policies, then proposing semantic and stateful failure cases that fixed boundary tests may miss. Generated scenarios stay drafts until a human reviews the expected invariant. AI does not control money: amount, recipient, expiry, payment status, idempotency, contact limits, and approvals are enforced deterministically.

## Build challenges and how they were solved

### 1. Testing stateful failures, not just prompts

A prompt-injection demo alone would not prove payment reliability. The scenario runner therefore isolates trusted payment state and injects two real distributed-system failures: duplicate event delivery and a payment success between planning and execution. Both run through the production gateway, not a test-only policy copy.

### 2. Separating agent reasoning from financial authority

Every tool proposal is normalized into one `ActionIntent`. Only the gateway holds an adapter reference. The model can propose an action, but deterministic rules bind it to the original recipient, captured amount, current status, link expiry, contact count, idempotency key, and approval threshold.

### 3. Avoiding a misleading perfect evaluation

The 60-case suite uses explicit expected outcomes rather than having a model judge its own work. An oblique instruction override is deliberately kept as a failing case. The UI reports the escape and zero false blocks beside the passing metrics, and the repository documents cumulative-refund and uncertain-result gaps.

### 4. Keeping the demo reliable while showing a real integration

Batch tests use a deterministic simulator so network availability and test quota cannot change results. A separate bounded adapter can create one real Razorpay test-mode Payment Link and refuses non-test key IDs. Refunds and customer messages remain simulated.

### 5. Making audit evidence inspectable

Each trace event includes its sequence and previous event hash. Replay recalculates the chain and shows the matched rule, trusted evidence, decision, and provider result. The documentation calls this application-level tamper evidence, not immutable or formally certified logging.

## One-line pitch

AgentProof lets payment teams ship AI agents with reproducible evidence that every money action is tested, bounded, gated, and explainable.

## Important submission note

Add the final public GitHub repository URL and a public five-minute video link only after verifying them in a signed-out browser. The official form states that the final submission cannot be edited afterward.
