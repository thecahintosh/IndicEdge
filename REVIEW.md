# Draft review — 31 October 2026

Reviewed baseline `2bd6779`, including every maintained source file. The draft is a chat application, not yet the combined workflow product. No successful cloud deployment was inferred from source alone.

## Findings

1. **High: browser-selected API origin.** `app.js` trusts `localStorage.indicedge_api` and sends bearer tokens to that host. Use same-origin requests exclusively; configure a reverse proxy for split hosting.
2. **High: no durable admission control or idempotency.** A process-local Set does not survive restarts or coordinate instances. Reserve a request in PostgreSQL before a model call; never automatically replay pending/failed billable requests.
3. **High: unnecessary retention.** History persists entire raw prompts and responses. New workflow audit records should retain plan IDs, aggregate outcomes and provider receipts, not customer records, drafts or raw instructions.
4. **High: incomplete database boundary.** Enabling RLS without policies does not establish tenant isolation. Backend account connections may bypass RLS. Scope every state query by authenticated user and deny direct browser table access.
5. **Medium: charged success reported as failure.** Provider success followed by database failure returns a generic retryable error. Return the actual result with a persistence warning; preserve the pre-call reservation to prevent duplicate spending.
6. **Medium: error handling.** Malformed JSON, blocked origins and payload limits return generic 500 errors. Return explicit JSON status codes, and avoid logging provider error bodies containing request text.
7. **Medium: session races.** A delayed request can populate another session's UI after logout. Cancel requests and invalidate old session generations.
8. **Medium: unrepeatable builds.** Missing lockfile, `npm install` in Docker, root container user, and no CI or tests. Lock dependencies, use `npm ci`, run as non-root, and test authorization and failure paths.
9. **Product gap:** no intent schema, approval boundary, fresh-data reuse, evidence, disclosure controls, or execution engine. NVIDIA telemetry is not GPU execution.
10. **UI gap:** login wall prevents an immediate product demo; generic module cards explain infrastructure instead of a business task. Labels, focus, loading, failure and reduced-motion behavior need attention.

## Delivery plan

- **Phase 1 — foundation:** fix admission/idempotency, error handling, deployment defaults, same-origin client and reproducible tooling. Keep cloud configuration explicit.
- **Phase 2 — workflow:** bounded English/Hinglish/Hindi order intent, strict plan validation, local CSV/JSON parsing, task-dependent disclosure, exact payload approval, deterministic fresh-data execution, saved workflows and receipt records. No external messages are sent.
- **Phase 3 — experience:** black monochrome workspace, source inspector, workflow library, execution evidence and honest compute status; keyboard/mobile/reduced-motion support.
- **Phase 4 — verification:** meaningful unit/API/browser tests, CI, setup guide, and a runnable local demo. Push each verified milestone.

## Subsequent milestones

- GPU document retrieval/OCR: integrate a bounded local worker and measure real CPU/GPU correctness and latency before enabling scheduling. Do not enable unreviewed CUDA code just to display GPU activity.
- Sarvam speech: transcript confirmation before plan compilation; distinguish cloud speech disclosure from local processing.
- Unstructured documents: task-specific evidence requirements, source citations, retrieval evaluation and explicit abstention.
- Cloud production: real account integration tests, migration-role separation, retention controls, shared deployment and budget reconciliation.

## Boundaries

The initial supported vertical is order follow-up drafts, not arbitrary agents. Application savings must be measured separately from Prune estimates. Zero LLM calls means zero external model spend for that run, not zero electricity or hosting cost. A receipt proves a gateway event, not answer correctness or privacy.
