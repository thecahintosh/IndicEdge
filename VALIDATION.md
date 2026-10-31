# Validation — 31 October 2026

## Document source update

- 32 unit/API tests include text line provenance, UTF-8/UTF-16 decoding, binary/encoding rejection, PDF text grouping and supported-file/size boundaries.
- Seven browser scenarios include self-hosted PDF text extraction/filtering, no-text-layer OCR notices, Word body/table extraction and numeric analysis, and inert plain-text markup alongside all prior dataset/order regressions.
- Parser libraries, workers, CMaps, fonts and decompression code are self-hosted; document source content is not sent to an external model. This does not claim OCR, perfect PDF layout reconstruction or full Word feature fidelity.

## Arbitrary dataset update

- 28 unit/API tests now include arbitrary/Unicode column names, CSV/TSV/JSONL, partial schemas, field constraints, exact decimal calculations, mixed numeric rejection, grouping, sorting, filtering, cash-flow reconciliation, nested values and worksheet validation.
- Four browser scenarios include successful financial CSV loading with missing-order-field notes, generic operations/export, source privacy checks, multi-sheet XLSX in a local browser worker, stale-result invalidation, and existing order workflows.
- Generic dataset/source states pass automated axe checks and 390px/320px overflow checks. A narrow-screen hidden-file-input sizing issue found by the test was corrected.
- The supplied 25-row financial file was checked locally without committing or transmitting it. It loads, its cash-flow totals reconcile, and only the unsupported reminder workflow is disabled.

## Passed locally

- 19 unit/API tests (`npm test`).
- Real PostgreSQL 17 integration: 15 concurrent state updates across two connections preserve every update; simultaneous identical billable requests reach the provider fixture once; completed results replay; owners remain isolated; Supabase browser roles have no table SELECT permission.
- Two browser scenarios with desktop 1440px and mobile 390px/320px checks: complete workflow, Hindi drafts, fresh-data rerun, saved plans, CSV download, rejected sources, source clearing, unsupported instructions, keyboard dialog focus and source-free network audit payloads.
- Axe: no violations in tested workbench/result/mobile states. This is automated coverage, not a claim of complete accessibility certification.
- `npm audit --omit=dev`: zero reported vulnerabilities at verification time.
- Docker image build with locked production dependencies and non-root runtime.
- Independent Impeccable finish review: **ship** at supplied screenshot/test scope. Four captures were inspected; motion reviewed in code, not through human device testing.

## Significant integration correction

The disposable PostgreSQL run found that Drizzle configures postgres-js JSON serialization differently from a standalone raw client. Raw locked writes now explicitly JSON-encode and cast to JSONB. The real database concurrency/idempotency suite passed after the fix.

## Not verified or not implemented

- Live private Supabase Auth configuration and live Prune provider calls require access to the user's existing local environment configuration. No keys were requested in chat or committed.
- No actual provider charge, signed receipt or savings baseline has been manufactured. Collect a real approved call and matching receipt before submission.
- GPU telemetry is available on the host; CUDA/OCR/document-retrieval execution and Sarvam speech remain roadmap work.
- Browser audit totals are client-reported, not independently attested. Local-mode persistence is intentionally single-process.
- GitHub Actions is configured; a local pass does not itself prove the remote Actions run completed.
