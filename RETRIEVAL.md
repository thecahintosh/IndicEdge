# Ask your files

IndicEdge now includes a browser-local retrieval pipeline and an optional Prune answer step. This is BM25 keyword retrieval, not remote embeddings or cross-language semantic search.

## Use it

1. Open **Ask your files**. Click **Add files** to import several supported PDFs, DOCX, text files or datasets. Alternatively, load a file in Source data and click **Ask about this source** to explicitly add a snapshot.
2. Inspect the source list and each file's **Extraction notes**. Documents use extracted body text; XLSX workbooks add their readable worksheets as separate sources. Snapshotting a selected DOCX table or worksheet preserves that selection.
3. Under **Fields used for retrieval**, choose what enters the index. Common banking, contact, salary/health and confidential field names start excluded. Document location fields are used for citations, not search text. Pattern rules cannot identify all private business facts inside prose.
4. Ask a question using words from the sources, such as “What is the refund policy?”, “Prune gateway API”, or a transaction category/name present in the selected data fields. Choose up to three or five passages, then click **Find relevant excerpts**.
5. Read the excerpts and file/page/line/paragraph/data-row references. BM25 scores reflect keyword overlap, not confidence, completeness or factual correctness. No-match queries produce a clear note instead of an invented answer.
6. If Prune is configured and you are signed in, select only the relevant passages and click **Preview & answer with AI**. Inspect the full question, system instruction and selected pattern-redacted evidence. Original file names, full documents and unselected passages are excluded from this request. Approve it explicitly.
7. Read the AI answer and its citation links back to the retrieved excerpts. Unknown/missing source IDs are rejected by the API. Insufficient/conflicting evidence should produce a needs-review response. Citation checking cannot prove each claim is grounded: review the answer against the originals. Actual provider metadata appears in Run history.

## Privacy, persistence and updates

Sources, chunks, field choices and the index remain in browser memory. Local retrieval creates no provider call or fabricated receipt. A model is used only after exact-payload approval through Prune. The backend's existing per-account admission, idempotency and attempt caps apply. Generated answer/replay data may be retained for up to seven days; gateway/provider retention is separate. The raw retrieval corpus is not uploaded automatically.

Retrieval copies are independent from the active analysis source. Editing, filtering or clearing the analysis source does not silently alter an existing retrieval snapshot. Re-add the active source to replace its prior same-name snapshot. Reuploading a file with the same filename replaces its prior retrieval copy. Remove individual sources or use **Clear retrieval files** to release the corpus. Reload or sign-out clears it too. Changing the question, selected fields, sources or approved passage selection clears stale results/answers; responses for an outdated selection are not displayed.

## Limits

Up to eight retrieval sources, four million indexed characters and 10,000 passages. Each excerpt is at most 1,200 characters. Long records overlap by 160 characters; ordinary adjacent document lines are packed within page boundaries. The entire index is rebuilt locally from currently selected fields when searching. Oversized corpora stop with an explicit error rather than silently searching a truncated index.

This implementation does not provide semantic synonym matching, automatic translation, OCR, guaranteed privacy, GPU acceleration, or reliable whole-dataset arithmetic through excerpts. Use **Source data → Analyze fields** for exhaustive numeric totals; top-k retrieval may omit necessary rows. A scanned PDF still needs OCR before text retrieval can work.

## Integration status

Local multi-file retrieval and citation behavior are tested. The Prune route is tested with a provider fixture for exact approval, replay and citation validation. Live provider generation requires the user's actual Prune/Supabase configuration; tests are not represented as real signed receipts.
