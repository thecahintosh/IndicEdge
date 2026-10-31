# Implementation milestones

## 1. Foundation — implemented
Durable admission and idempotency, owner-scoped PostgreSQL state, local-only development mode, safe origins, bounded errors, locked dependencies. Baseline review is in REVIEW.md.

## 2. Order workflow and disclosure boundary — implemented
Bounded English/Hindi/Hinglish intent templates; manual rule editor; strict plan schema; browser-local CSV/JSON parsing, filtering, exact money and bilingual templates; saved workflow API; minimal aggregate audit. Optional approved Prune compilation/explanation. Unit/API tests cover stale-data avoidance, unknown actions, missing evidence, policy violations, tenant separation, replay and malformed data.

## 3. Workspace redesign — in progress
Black monochrome, operational typography, visible source/rules/disclosure/result flow, explicit loading and error states, workflow library, history and honest compute status. Short state transitions with reduced-motion alternatives.

## 4. End-to-end verification — next
Desktop/mobile browser checks, keyboard/reduced-motion behavior, deterministic workflow rerun on changed records, setup documentation, Docker build, CI, and final verification push. Cloud integration tests require the user's existing local configuration path.

## 5. GPU document engine — planned
Review the supplied CUDA retrieval worker independently; add resource ceilings, owner isolation and measured crossover. Integrate only with a document retrieval use case where it contributes. Telemetry in this build is availability only, not acceleration.

## 6. Speech and broader documents — planned
Sarvam transcription with transcript confirmation and disclosed cloud speech boundary. Then controlled local ingestion, task-specific evidence requirements, evaluation of retrieval sufficiency and abstention.

## 7. Production operations — planned
Dedicated migration role, staging/cloud integration checks, retention and request reconciliation, durable shared run budgets, real delivery adapters with approval and idempotency. No autonomous external sending in the current demo.
