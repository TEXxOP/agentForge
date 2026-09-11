# AgentProof

> Ship payment agents with proof, not promises.

AgentProof is a safety and evidence layer for AI agents that can affect money. Every payment action goes through one mandatory gateway that checks trusted state, deterministic merchant policy, idempotency, approval requirements, and fresh state before execution.

Built for the [Razorpay AI Buildathon](https://razorpay.com/buildathon/) Open Track.

![Tests](https://img.shields.io/badge/tests-14%20passing-16a375?style=flat-square)
![Mode](https://img.shields.io/badge/money-test%20mode%20only-6f60f7?style=flat-square)

## Product walkthrough

This is a recording of the real local app blocking an injected refund, showing the trace, exercising the Attack Lab, and opening the architecture view.

![AgentProof product walkthrough](./docs/assets/agentproof-demo.gif)

## What it protects against

- Prompt injection attempting to authorize money actions
- Refund recipient and amount mismatches
- Approval bypasses for high-value refunds
- Duplicate webhooks and repeat actions
- Stale payment state before a recovery action
- Recovery messages after payment success

## Architecture

![AgentProof architecture](./docs/assets/agentproof-architecture.png)

AI can propose an action. Deterministic code decides whether it is allowed, blocked, or paused for human approval. Every decision creates a replayable, hash-chained evidence trace.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The default simulator needs no credentials and starts with a 60-case evaluation.

## Verify

```bash
npm run check
```

This runs the production build, server syntax check, and 14 automated tests.

## Optional Razorpay test mode

The default simulator is best for the demo. To create a real Payment Link in Razorpay test mode, copy `.env.example` to `.env` and set:

```dotenv
PAYMENT_ADAPTER=razorpay_test
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

Only test-mode keys are accepted. Refunds and messages remain simulated.

## Honest limitation

AgentProof is a test harness and reference gateway, not a formal guarantee or production payment system. Its known semantic miss and cumulative-refund gap are intentionally visible in the evidence workflow.
