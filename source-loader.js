import { parseSource } from './source.js';
import { validateDataset, blank, cellText } from './dataset.js';

export function checkXlsxArchive(buffer) {
  const bytes = new DataView(buffer);
  let end = -1;
  for (let pos = bytes.byteLength - 22; pos >= Math.max(0, bytes.byteLength - 65557); pos--) {
    if (bytes.getUint32(pos, true) === 0x06054b50) { end = pos; break; }
  }
  if (end < 0) throw new Error('This is not a readable XLSX ZIP archive');
  const entries = bytes.getUint16(end + 10, true);
  let position = bytes.getUint32(end + 16, true), expanded = 0;
  if (entries > 2000 || position >= bytes.byteLength) throw new Error('Workbook archive exceeds the supported limits');
  for (let i = 0; i < entries; i++) {
    if (position + 46 > bytes.byteLength || bytes.getUint32(position, true) !== 0x02014b50) throw new Error('Workbook archive directory is invalid');
    if (bytes.getUint16(position + 8, true) & 1) throw new Error('Encrypted workbooks are not supported; save an unencrypted XLSX copy');
    expanded += bytes.getUint32(position + 24, true);
    if (expanded > 30_000_000) throw new Error('Expanded workbook exceeds 30 MB; export a smaller worksheet as CSV');
    position += 46 + bytes.getUint16(position + 28, true) + bytes.getUint16(position + 30, true) + bytes.getUint16(position + 32, true);
  }
}
export function worksheetRecords(matrix) {
  const data = matrix.filter(row => row.some(value => !blank(value)));
  if (data.length < 2) throw new Error('Worksheet needs a header row and at least one data row');
  const headers = data[0].map(value => cellText(value).trim());
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Worksheet header row needs unique, non-empty column names');
  const rows = data.slice(1).map((cells, i) => {
    if (cells.slice(headers.length).some(v => !blank(v))) throw new Error(`Worksheet row ${i + 2} contains values without column names`);
    return Object.fromEntries(headers.map((name, j) => [name, cells[j] instanceof Date ? cells[j].toISOString().slice(0, 10) : cells[j] ?? null]));
  });
  validateDataset(rows);
  return rows;
}
export async function readDatasetFile(file) {
  if (file.size > 5_000_000) throw new Error('Choose a file smaller than 5 MB');
  if (/\.xlsx$/i.test(file.name)) {
    const buffer = await file.arrayBuffer(); checkXlsxArchive(buffer);
    const sheets = await new Promise((resolve, reject) => {
      const worker = new Worker('./assets/spreadsheet-worker.js', { type: 'module' });
      const done = (error, data) => { clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(data); };
      const timer = setTimeout(() => done(new Error('Workbook parsing timed out; export the worksheet as CSV')), 15000);
      worker.onmessage = event => event.data.error ? done(new Error(event.data.error)) : done(null, event.data.sheets);
      worker.onerror = () => done(new Error('Could not read this XLSX workbook; export a worksheet as CSV'));
      worker.postMessage(buffer, [buffer]);
    });
    const result = sheets.map(sheet => {
      try { return { name: sheet.sheet, rows: worksheetRecords(sheet.data) }; }
      catch (error) { return { name: sheet.sheet, rows: [], error: error.message }; }
    });
    if (!result.some(sheet => sheet.rows.length)) throw new Error(`No usable worksheet: ${result[0]?.error || 'workbook is empty'}`);
    return { sheets: result, note: 'Excel formulas are not executed. Only saved/cached values are read; blank formula results remain missing. Save/recalculate in Excel if needed.' };
  }
  if (!/\.(csv|tsv|json|jsonl|ndjson)$/i.test(file.name)) throw new Error('Supported dataset files: CSV, TSV, JSON, JSONL/NDJSON and XLSX. Export other formats to one of these.');
  const rows = parseSource(await file.text(), file.name); validateDataset(rows);
  return { sheets: [{ name: 'Data', rows }], note: '' };
}
