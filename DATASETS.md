# Working with datasets

## Load a source

Open **Source data → Choose dataset file**. Supported formats are CSV (comma, semicolon or tab delimiter), TSV, JSON, JSONL/NDJSON, and XLSX. The source remains in browser memory; these analysis operations do not send it to a model or backend.

Limits: 5 MB per file, 5,000 records, 200 named fields, 20,000 characters per cell. XLSX parsing runs in a terminable browser worker, with archive limits and a 15-second timeout. Legacy XLS, PDFs, scans and encrypted spreadsheets must be exported to a supported tabular format first.

CSV/TSV need a header row with unique non-empty names. Spaces, punctuation, case and non-English column names are preserved. JSON can be an array of record objects or `{ "rows": [...] }` / `{ "data": [...] }`. JSONL has one record object per line. Sparse JSON rows load; missing cells are reported. Nested values remain structured display/text data, not executable instructions.

For XLSX, choose a worksheet when there are multiple. Each worksheet's first non-empty row is its header. Invalid/empty worksheets are labelled in the selector without blocking usable worksheets. Formulas are not evaluated: only saved values are read, and missing cached results remain missing. Recalculate/save in Excel when necessary. Dates are converted to YYYY-MM-DD when recognized by the workbook reader.

## Read the constraint notes

**What this source supports** lists missing columns and the operations those columns prevent. A financial ledger without customer contacts and order due dates remains loaded and can be analyzed. It cannot generate valid order reminders.

If all order fields exist but values are invalid (duplicate IDs, invalid dates/statuses/amounts or more than 2,000 orders), the source remains inspectable while the order-specific workflow is unavailable. Original schema validation still applies at execution.

**Field types and missing values** shows inferred types and empty-cell counts. Numeric operations accept plain decimal values with up to six decimal places. Currency-formatted strings, mixed text and unrecognized date formats are not silently coerced. Correct the source or filter the affected rows explicitly.
Keep large identifiers/integers as text, particularly in JSON/XLSX. Unsafe native JavaScript integer values are rejected for numeric operations; text decimal values can be aggregated exactly within the input limits.

## Analyze fields

Choose an operation, select the source field(s), then click **Run operation**:

- Inspect fields or count records.
- Sum, average, minimum or maximum of a numeric field. Blank cells are counted and excluded; non-numeric cells block the calculation. Fixed-point arithmetic avoids ordinary floating-point sum errors. Averages truncate at six decimal places.
- Filter by exact equality/inequality, case-insensitive text containment, numeric comparison, ISO date before/after, or missing/present values.
- Sort ascending/descending using the inferred field type. Empty cells stay last; mixed/structured fields require cleanup first.
- Group by a field with record counts or sums of another numeric field. Missing group values have their own group; missing numeric values are counted separately.
- Cash-flow summary when `money_in_inr` and `money_out_inr` exist. It calculates money in/out and net movement, without calling that accounting profit. An optional `running_balance_inr` field enables implied opening/last balance and row-by-row reconciliation. Reconciliation uses source row order, not a silent date sort. Missing cash values or negative flow entries require review.

Use **Export result CSV** to download all result rows (the UI previews only the first 100). Export escapes spreadsheet formula prefixes.

Filtering/sorting leaves the source unchanged. **Use these rows as active source** explicitly replaces the active view for subsequent operations, allowing filter-then-sum/group workflows. An empty result cannot replace the source. Reload the original file or reselect an XLSX worksheet to restore its records. Changing the source, worksheet, or operation clears stale results.

## Privacy and scope

Generic dataset analysis is browser-local and makes zero AI calls. It does not create a Prune receipt or claim AI savings from a provider call that never happened. Optional order AI features retain their separate exact-payload approval controls. No generic dataset values are automatically added to those requests.

This is a bounded tabular operation engine, not arbitrary generated-code execution. Unsupported operations and missing required evidence produce explicit errors instead of invented values.
