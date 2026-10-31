# IndicEdge

**Dataset update:** Source loading now supports arbitrary schemas in CSV, TSV, JSON/JSONL and XLSX. Missing columns produce operation-specific notes instead of rejecting an otherwise valid dataset. Use **Source data → Analyze fields** for counts, sums/averages/min/max, filters, sorting, grouping and cash-flow summaries. See [DATASETS.md](DATASETS.md) for the complete supported formats, limits and usage. The order-specific rules below still apply when running reminder drafts.

A task-aware workflow workspace for overdue-order follow-ups. Describe a supported task in English, Hindi or Hinglish, review explicit rules, inspect disclosure, and generate editable Hindi/English drafts. Save the rules and rerun them on fresh records without another planning call.

## Run the complete local demo

Requires Node.js 22+ (24 recommended):

```powershell
npm ci
npm run demo
```

Open **http://127.0.0.1:8787**. Port 8787 avoids the unrelated service occupying 8000 on the development machine. Local mode is explicit, binds to loopback, stores plans/aggregate history in `.data/`, and **disables all external AI calls**. This is a functional deterministic workflow, not a simulated provider response.

1. Click **Hindi reminders**, then **Review workflow**.
2. Review the five-day threshold, language, IST evaluation date, source and disclosure policy.
3. Click **Generate drafts**. The six fictional records yield three matches and INR 11,125.75 outstanding at the example's evaluation date.
4. Edit a draft and export CSV. Nothing is sent to customers.
5. Save the workflow, upload changed CSV/JSON records under **Source data**, load the saved rules and rerun. The result uses the new records.

## Connect the existing Supabase + Prune setup

Copy `.env.example` to `.env` and configure it locally. Never commit `.env`, API keys or database passwords. Set `LOCAL_MODE=false`, your Supabase URL/public anon key, the database connection string, `PRUNE_API_KEY`, and a currently supported `PRUNE_MODEL`. Store the provider key in Prune's vault, not this project. Start with `npm start`.

The production mode uses Supabase Auth and owner-scoped PostgreSQL state through Drizzle. The startup database role needs table creation/alter/revoke permission; this prototype creates `public.indicedge_state`, enables RLS and revokes direct table access from Supabase's `anon`/`authenticated` roles. A separate migration role and tested least-privilege runtime role are a later production milestone. Existing `indicedge_runs` data is not deleted or migrated; the new history UI reads the new aggregate ledger.

Keep frontend and API on the **same origin**. For split hosting use an HTTPS reverse proxy, not browser-selected API hosts. Configure `FRONTEND_ORIGINS` to match the actual origin. The CSP allows the pinned Supabase browser SDK from esm.sh and HTTPS Supabase project hosts. Custom auth domains need an explicit reviewed CSP change.

Optional cloud features:

- When local intent matching cannot understand a request, **Preview AI interpretation** offers a sanitized instruction and fixed JSON schema. No source rows accompany it. Review the whole request: pattern filtering cannot identify every confidential fact.
- After a run, **Explain with AI** offers an aggregate-only request: match count, outstanding paise, threshold and language. These aggregates can still be sensitive.
- Both require exact-payload approval, authentication and Prune configuration. Every call uses `https://api.withprune.com/v1`, bounded output/time, disabled SDK retries, a request ID and a Prune run-budget header. Configure and verify account-level spend caps in Prune separately.
- `MAX_DAILY_CALLS` caps admitted attempts per account per UTC day, not local electricity/hosting costs. Failed attempts count. The application does not claim that an estimated model price is an actual charge.
- Actual returned `prune_metadata` and usage appear in **Run history**. Signature presence is not signature verification. Use [Prune's verifier](https://www.withprune.com/verify) for a real receipt.

[Official Prune setup](https://www.withprune.com/docs/hackathon) · [Gateway metadata and estimates](https://www.withprune.com/docs/how-it-works)

## Source format and privacy boundary

CSV headers or JSON object keys:

```csv
order_id,customer_name,contact,due_date,amount,status
ORD-2001,Aarav Mehta,aarav@example.test,2026-10-20,2450.50,pending
```

For order reminders, required status values are `pending`, `paid`, `cancelled`. Dates are strict `YYYY-MM-DD`; amounts are non-negative INR decimals with at most two decimal places. Maximum 2,000 orders. Duplicate IDs, unknown statuses and malformed order values block reminder execution, while the dataset stays loaded for inspection and other operations. Generic import allows 5 MB, 5,000 records and 200 columns. Overdue comparisons use calendar days relative to the editable IST evaluation date; the threshold is inclusive.

Source rows and drafts remain in browser memory. They are cleared by reload, clear-source or sign-out. Extra source fields such as bank details and unrelated notes are excluded from the execution representation. Audit requests send aggregate totals, validated rules, date and a source hash. This hash is not encryption or independent proof. In hosted mode these audit records reach your backend; that is not the same as the whole system being local.

Saved workflow names and plans are retained (up to 50). History retains up to 100 aggregate events. Finished AI replay records, including model output and metadata, are retained for up to seven days and pruned on subsequent AI admission; pending unknown outcomes remain until reconciled. No raw instruction is intentionally stored by the new workflow endpoints. The legacy `/api/ask` route remains for compatibility and **does not provide task-aware minimization**; do not submit private documents there. Its model output is also retained for replay.

## Idempotency and unknown outcomes

Billable endpoints require a UUID `Idempotency-Key`. The backend reserves it durably **before** calling Prune. A repeated completed request returns the recorded result; mismatched payloads or failed/pending keys are rejected. If the provider succeeds and saving fails, the response includes the actual result and a persistence warning. Never automatically retry an unknown outcome.

Inspect `GET /api/requests` with your authenticated session to locate pending requests. After checking the corresponding Prune request/receipt and waiting at least one minute, explicitly acknowledge it:

```text
POST /api/requests/<request-id>/reconcile
{"receiptReviewed":true}
```

This releases the pending admission lock, records the acknowledgement, and does not refund, retry, or fabricate a receipt. Ledger limits and daily attempt counters remain in force.

## Docker

```powershell
docker compose up -d --build
```

The standard Compose setup requires the real cloud environment. `HOST=0.0.0.0` inside the container is required; the published host port remains loopback-only. The Dockerfile uses a lockfile, `npm ci`, and a non-root user. Frontend assets and locally licensed fonts/icons are included in the image.

## Verify

```powershell
npm test
npx playwright install chromium
npm run test:browser
# Optional: TEST_DATABASE_URL must point at a disposable PostgreSQL database
npm run test:postgres
npm audit --omit=dev
docker build -t indicedge:local .
```

Tests cover intent rejection, dates, integer money, confidential marker exclusion, fresh-data reuse, source parsing/export safety, owner isolation, request replay/quota and API errors. Browser tests exercise desktop and narrow screens, local-only source processing, keyboard focus and axe accessibility checks. Browser tests use a separate local store. Set `CAPTURE_UI=true` to capture screenshots under the gitignored `.impeccable/review/` directory. The checked-in CI runs unit/API/browser tests, the dependency audit and Docker build.

## Current scope

Implemented: bounded intent, editable rules, field minimization, local order execution, bilingual editable/exportable drafts, saved workflows, aggregate run evidence, approved Prune integration, black responsive UI and reduced-motion support.

**Not implemented:** GPU execution, OCR, arbitrary document retrieval, Sarvam speech, external message sending or a measured full-context AI baseline. GPU availability is real telemetry only. The user confirmed existing cloud credentials; live Supabase/Prune integration is not claimed as verified by this checkout's local tests.

See [REVIEW.md](REVIEW.md) for concrete draft findings, [PLAN.md](PLAN.md) for milestone status, and [DESIGN.md](DESIGN.md) for the UI/motion system. Geist and Phosphor assets are self-hosted with license files in `assets/`.
