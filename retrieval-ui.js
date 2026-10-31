import { readDatasetFile } from './source-loader.js';
import { validateDataset } from './dataset.js';
import { buildRetrievalIndex, retrieveEvidence, defaultRetrievalField, approvedRagPayload, ragMessages } from './retrieval.js';

const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };

export function setupRetrievalUI({ getCurrent, canUseAI, openDisclosure, cancelDisclosure, reveal }) {
  let sources = [], enabledFields = new Set(), knownFields = new Set(), evidence = [], revision = 0, uploadGeneration = 0;
  let selection = new Set();
  function invalidate() {
    revision++; evidence = []; selection.clear();
    $('ragEvidence').replaceChildren(); $('ragAnswer').replaceChildren(); $('ragResults').classList.add('hidden'); $('ragAnswer').classList.add('hidden');
    $('ragSearchMessage').textContent = ''; $('ragPreviewAI').disabled = true;
    cancelDisclosure();
  }
  function refreshAI() {
    $('ragPreviewAI').disabled = !canUseAI() || !selection.size;
    $('ragAIAvailability').textContent = canUseAI() ? 'AI answers require approval of the exact excerpts and question. Generated answers may be retained by the backend for replay for up to seven days.' : 'Prune is unavailable in this workspace. Local retrieval and citations still work; no AI answer is simulated.';
  }
  function renderSources() {
    $('ragSourceList').replaceChildren();
    for (const source of sources) {
      const item = el('div', undefined, 'rag-source'); const copy = el('div');
      copy.append(el('strong', source.name), el('span', `${source.rows.length} records · ${source.kind === 'document' ? 'extracted text/table' : 'structured data'}`));
      if (source.note) {
        const details = el('details'); details.append(el('summary', 'Extraction notes'), el('p', source.note)); copy.append(details);
      }
      const remove = el('button', 'Remove', 'text-button'); remove.setAttribute('aria-label', `Remove ${source.name}`);
      remove.addEventListener('click', () => { sources = sources.filter(s => s.id !== source.id); invalidate(); renderSources(); });
      item.append(copy, remove); $('ragSourceList').append(item);
    }
    const names = [...new Set(sources.flatMap(source => validateDataset(source.rows).filter(name => source.kind !== 'document' || !['page', 'line', 'paragraph'].includes(name))))];
    for (const name of names) if (!knownFields.has(name)) { knownFields.add(name); if (defaultRetrievalField(name)) enabledFields.add(name); }
    enabledFields = new Set([...enabledFields].filter(name => names.includes(name)));
    $('ragFields').replaceChildren();
    for (const name of names) {
      const label = el('label', undefined, 'checkbox-label'); const input = el('input'); input.type = 'checkbox'; input.value = name; input.checked = enabledFields.has(name);
      input.addEventListener('change', () => { input.checked ? enabledFields.add(name) : enabledFields.delete(name); invalidate(); refreshAI(); });
      label.append(input, document.createTextNode(`${name}${defaultRetrievalField(name) ? '' : ' · excluded by default'}`)); $('ragFields').append(label);
    }
    $('ragCorpusCount').textContent = sources.length ? `${sources.length} retrieval source${sources.length === 1 ? '' : 's'} · ${sources.reduce((sum, source) => sum + source.rows.length, 0)} records · browser memory` : 'No retrieval sources yet. Add the active source or choose files.';
    $('ragSearch').disabled = !sources.length; refreshAI();
  }
  function addSourceGroup(group, originalName) {
    const retained = sources.filter(source => source.originalName !== originalName);
    if (retained.length + group.length > 8) throw new Error('Use at most 8 retrieval sources (worksheets count separately). Remove a source before adding more.');
    for (const source of group) validateDataset(source.rows);
    sources = [...retained, ...group.map(source => ({ ...source, originalName, id: crypto.randomUUID() }))];
    invalidate(); renderSources();
  }
  $('ragAddCurrent').addEventListener('click', () => {
    try {
      const current = getCurrent();
      if (!current.rows.length) throw new Error('Load a source under Source data first, or choose files here');
      addSourceGroup([{ name: current.name, rows: structuredClone(current.rows), kind: current.kind, note: current.note }], `active:${current.name}`);
      $('ragImportMessage').textContent = 'Added a snapshot of the active source. Re-add it after changing its records; existing retrieval files are independent of the analysis view.';
    } catch (error) { $('ragImportMessage').textContent = error.message; }
  });
  $('ragFiles').addEventListener('change', async event => {
    const files = [...event.target.files]; if (!files.length) return;
    const generation = uploadGeneration; const messages = []; $('ragFiles').disabled = true;
    $('ragImportMessage').textContent = 'Reading and extracting files locally…';
    try {
      if (files.length > 8) throw new Error('Choose up to 8 files at a time');
      for (const file of files) {
        try {
          const loaded = await readDatasetFile(file);
          if (generation !== uploadGeneration) return;
          const sheets = loaded.kind === 'document' ? loaded.sheets.slice(0, 1) : loaded.sheets.filter(sheet => sheet.rows.length);
          addSourceGroup(sheets.map(sheet => ({ name: sheets.length > 1 ? `${file.name} · ${sheet.name}` : file.name, rows: sheet.rows, kind: loaded.kind || 'dataset', note: loaded.note })), file.name);
          messages.push(`Added ${file.name}.`);
        } catch (error) { if (generation !== uploadGeneration) return; messages.push(`${file.name}: ${error.message}`); }
      }
      $('ragImportMessage').textContent = messages.join('\n');
    } catch (error) { $('ragImportMessage').textContent = error.message; }
    finally { $('ragFiles').disabled = false; $('ragFiles').value = ''; }
  });
  function selectedEvidence() { return evidence.filter(item => selection.has(item.citation)); }
  function search(event) {
    event.preventDefault(); invalidate();
    try {
      const started = performance.now();
      const index = buildRetrievalIndex(sources, [...enabledFields]);
      const result = retrieveEvidence(index, $('ragQuestion').value, Number($('ragLimit').value));
      evidence = result.results;
      $('ragResults').classList.remove('hidden');
      $('ragResultNote').textContent = `${result.searchedPassages} passages searched across ${result.sourceCount} source(s) in ${(performance.now() - started).toFixed(1)} ms. ${result.note}`;
      if (!evidence.length) {
        $('ragSearchMessage').textContent = 'No relevant evidence found for these words in the selected fields. Try specific source terms, add the missing file, or review excluded fields. No AI call was made.';
        refreshAI(); return;
      }
      for (const item of evidence) {
        selection.add(item.citation);
        const article = el('article', undefined, 'rag-passage'); article.id = `rag-${item.citation}`;
        const header = el('div', undefined, 'section-top');
        const label = el('label', undefined, 'checkbox-label'); const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = true;
        checkbox.addEventListener('change', () => { checkbox.checked ? selection.add(item.citation) : selection.delete(item.citation); revision++; $('ragAnswer').replaceChildren(); $('ragAnswer').classList.add('hidden'); cancelDisclosure(); refreshAI(); });
        label.append(checkbox, document.createTextNode(`[${item.citation}] ${item.name}`));
        header.append(label, el('span', item.location, 'small muted'));
        article.append(header, el('p', item.text, 'rag-excerpt'), el('small', `BM25 ${item.score} · matched ${item.matchedTerms}/${item.queryTerms} query terms · relevance is not confidence`));
        $('ragEvidence').append(article);
      }
      $('ragSearchMessage').textContent = `${evidence.length} relevant passage${evidence.length === 1 ? '' : 's'} found. Inspect sources and select only what is necessary before requesting an AI answer.`;
      refreshAI(); reveal($('ragResults'));
    } catch (error) { $('ragSearchMessage').textContent = error.message; }
  }
  $('ragForm').addEventListener('submit', search);
  for (const id of ['ragQuestion', 'ragLimit']) $(id).addEventListener('input', () => { invalidate(); refreshAI(); });
  $('ragPreviewAI').addEventListener('click', () => {
    try {
      const chosen = selectedEvidence();
      const payload = approvedRagPayload($('ragQuestion').value, chosen.map(item => ({ citation: item.citation, location: item.location, text: item.text })));
      openDisclosure('retrieve-answer', payload, ragMessages(payload.question, payload.evidence),
        'Only this question and the selected excerpts are shared through Prune. Original file names and full files are excluded. Pattern redaction cannot remove every private fact: inspect the entire payload. Excerpts may still be sensitive. The generated answer can be retained for replay for up to seven days.', { ragVersion: revision });
    } catch (error) { $('ragSearchMessage').textContent = error.message; }
  });
  function clear() {
    uploadGeneration++; sources = []; knownFields.clear(); enabledFields.clear(); $('ragQuestion').value = ''; $('ragFiles').value = '';
    $('ragImportMessage').textContent = ''; invalidate(); renderSources();
  }
  $('ragClear').addEventListener('click', clear);
  function applyAnswer(result, version) {
    if (version !== revision) return false;
    const article = $('ragAnswer'); article.replaceChildren();
    article.append(el('h2', result.needsReview ? 'More evidence or review needed' : 'AI answer — check its sources'), el('p', result.answer, 'rag-excerpt'));
    const citations = el('div', undefined, 'rag-citations');
    for (const id of result.citations || []) {
      const passage = evidence.find(item => item.citation === id); if (!passage) continue;
      const link = el('button', `[${id}] ${passage.name} · ${passage.location}`, 'text-button');
      link.addEventListener('click', () => { $(`rag-${id}`)?.scrollIntoView({ behavior: 'instant', block: 'center' }); }); citations.append(link);
    }
    article.append(citations, el('p', 'Source IDs were checked against the approved excerpts. This is not an independent factual correctness check; verify the answer against the original files.', 'small muted'));
    article.classList.remove('hidden'); reveal(article); return true;
  }
  renderSources();
  return { clear, applyAnswer, refreshAI };
}
