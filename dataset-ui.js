import { profileDataset, sourceCapabilities, operateDataset, cellText, datasetCSV, validateDataset } from './dataset.js';

const $ = id => document.getElementById(id);
const element = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
function fillSelect(select, names, previous) {
  select.replaceChildren(...names.map(name => { const opt = element('option', name); opt.value = name; return opt; }));
  if (names.includes(previous)) select.value = previous;
}
export function renderTable(head, body, rows, columns) {
  const header = element('tr'); columns.forEach(name => header.append(element('th', name))); head.replaceChildren(header);
  body.replaceChildren();
  for (const row of rows.slice(0, 100)) {
    const tr = element('tr'); for (const name of columns) tr.append(element('td', cellText(row[name]))); body.append(tr);
  }
}
export function setupDatasetUI({ getRows, useRows, reveal }) {
  let lastResult = null;
  let lastSpec = null;
  function clearResult() {
    lastResult = null; lastSpec = null;
    $('datasetResult').classList.add('hidden'); $('datasetResultBody').replaceChildren(); $('datasetResultHead').replaceChildren(); $('datasetValue').textContent = '';
    $('datasetOperationMessage').textContent = '';
  }
  function controls() {
    const op = $('datasetOperation').value;
    $('datasetFieldControl').classList.toggle('hidden', ['count', 'profile', 'finance'].includes(op));
    $('datasetFilterControls').classList.toggle('hidden', op !== 'filter');
    $('datasetDirectionControl').classList.toggle('hidden', op !== 'sort');
    $('datasetMetricControl').classList.toggle('hidden', op !== 'group');
    $('datasetMetricFieldControl').classList.toggle('hidden', op !== 'group' || $('datasetMetric').value !== 'sum');
    $('datasetFilterValueControl').classList.toggle('hidden', ['empty', 'not_empty'].includes($('datasetComparator').value));
  }
  for (const id of ['datasetOperation', 'datasetMetric', 'datasetComparator', 'datasetField', 'datasetMetricField', 'datasetFilterValue', 'datasetDirection']) {
    $(id).addEventListener('input', () => { clearResult(); controls(); });
  }
  function render() {
    clearResult();
    const rows = getRows();
    $('datasetTools').classList.toggle('hidden', !rows.length);
    $('datasetCompatibility').replaceChildren(); $('fieldProfiles').replaceChildren();
    if (!rows.length) { $('sourceHead').replaceChildren(); $('sourceRows').replaceChildren(); controls(); return null; }
    const profiles = profileDataset(rows), columns = profiles.map(p => p.name), capabilities = sourceCapabilities(rows);
    renderTable($('sourceHead'), $('sourceRows'), rows, columns);
    for (const [name, capability] of [['Order reminder workflow', capabilities.order], ['Cash-flow summary', capabilities.financial]]) {
      const section = element('div', undefined, 'capability-row');
      section.append(element('strong', `${name} · ${capability.available ? 'Available' : 'Unavailable'}`), element('p', capability.note));
      $('datasetCompatibility').append(section);
    }
    const sparse = profiles.filter(p => p.missing);
    if (sparse.length) $('datasetCompatibility').append(element('p', `Missing cells: ${sparse.map(p => `${p.name} (${p.missing})`).join(', ')}. Affected calculations show their own requirements; the dataset remains loaded.`, 'small muted'));
    for (const p of profiles) {
      const item = element('div', undefined, 'field-profile'); item.append(element('strong', p.name), element('span', `${p.type} · ${p.present} present · ${p.missing} empty`)); $('fieldProfiles').append(item);
    }
    const previous = $('datasetField').value, previousMetric = $('datasetMetricField').value;
    fillSelect($('datasetField'), columns, previous); fillSelect($('datasetMetricField'), columns, previousMetric);
    $('datasetOperation').value = capabilities.financial.available ? 'finance' : 'profile';
    controls(); return capabilities;
  }
  function run() {
    try {
      const spec = { operation: $('datasetOperation').value, field: $('datasetField').value, comparator: $('datasetComparator').value,
        value: $('datasetFilterValue').value, direction: $('datasetDirection').value, metric: $('datasetMetric').value, metricField: $('datasetMetricField').value };
      const started = performance.now(); const result = operateDataset(getRows(), spec);
      lastSpec = spec; lastResult = result;
      $('datasetOperationMessage').textContent = '';
      $('datasetResultTitle').textContent = result.type === 'value' ? result.label : $('datasetOperation').selectedOptions[0].textContent;
      $('datasetValue').textContent = result.type === 'value' ? result.value : '';
      $('datasetResultTable').classList.toggle('hidden', result.type !== 'table');
      if (result.type === 'table') renderTable($('datasetResultHead'), $('datasetResultBody'), result.rows, result.columns);
      $('datasetResultNote').textContent = `${result.note} ${result.type === 'table' && result.rows.length > 100 ? `Showing 100 of ${result.rows.length} result rows; export includes all.` : ''}`;
      $('datasetResultTiming').textContent = `${(performance.now() - started).toFixed(1)} ms · browser-local · 0 AI calls · no dataset sent`;
      $('useDatasetResult').classList.toggle('hidden', !['filter', 'sort'].includes(spec.operation));
      $('datasetResult').classList.remove('hidden'); reveal($('datasetResult'));
    } catch (error) { clearResult(); $('datasetOperationMessage').textContent = error.message; }
  }
  $('runDatasetOperation').addEventListener('click', run);
  $('useDatasetResult').addEventListener('click', () => {
    if (!lastResult?.rows?.length) { $('datasetOperationMessage').textContent = 'An empty result cannot replace the active dataset'; return; }
    const rows = lastResult.rows;
    if (!['filter', 'sort'].includes(lastSpec?.operation)) return;
    validateDataset(rows); useRows(rows, `Derived ${lastSpec.operation} result`);
  });
  $('exportDatasetResult').addEventListener('click', () => {
    if (!lastResult) return;
    const rows = lastResult.type === 'table' ? lastResult.rows : [{ measure: lastResult.label, value: lastResult.value }];
    const columns = lastResult.type === 'table' ? lastResult.columns : ['measure', 'value'];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + datasetCSV(rows, columns)], { type: 'text/csv;charset=utf-8' }));
    const link = element('a'); link.href = url; link.download = 'indicedge-analysis.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return { render, clearResult };
}
