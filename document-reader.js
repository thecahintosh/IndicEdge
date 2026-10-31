import { validateDataset } from './dataset.js';
import { checkXlsxArchive, worksheetRecords } from './source-loader.js';

export function textRecords(text) {
  if (text.includes('\u0000')) throw new Error('The file contains binary data rather than readable text');
  const rows = text.split(/\r\n|\n|\r/).flatMap((line, index) => line.trim() ? [{ line: index + 1, text: line }] : []);
  if (!rows.length) throw new Error('No readable text was found in this file');
  validateDataset(rows); return rows;
}
export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error('Text encoding is not recognized. Save the text as UTF-8 or UTF-16 and retry.'); }
}
const descendants = (root, name) => [...root.getElementsByTagName('*')].filter(node => node.localName === name);
function wordText(root) {
  const walk = node => {
    if (node.localName === 't') return node.textContent;
    if (node.localName === 'tab') return '\t';
    if (['br', 'cr'].includes(node.localName)) return '\n';
    return [...node.children].map(walk).join('') + (node.localName === 'p' ? '\n' : '');
  };
  return walk(root);
}
export function parseWordXML(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Document XML contains unsupported entity declarations');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Word document XML is damaged');
  const paragraphs = descendants(doc, 'p').flatMap((p, i) => {
    const text = wordText(p).trim(); return text ? [{ paragraph: i + 1, text }] : [];
  });
  if (!paragraphs.length) throw new Error('No text was found in this DOCX. Image-only Word documents need OCR.');
  validateDataset(paragraphs);
  const sheets = [{ name: 'Document text', rows: paragraphs }];
  descendants(doc, 'tbl').forEach((table, index) => {
    const matrix = [...table.children].filter(node => node.localName === 'tr').map(row =>
      [...row.children].filter(node => node.localName === 'tc').map(cell => wordText(cell).trim()));
    try { sheets.push({ name: `Table ${index + 1}`, rows: worksheetRecords(matrix) }); }
    catch (error) { sheets.push({ name: `Table ${index + 1}`, rows: [], error: error.message }); }
  });
  return { sheets, kind: 'document', note: `Extracted ${paragraphs.length} text paragraphs and ${sheets.length - 1} table(s). Choose a table to calculate on its fields. Tables use their first row as headers. Merged cells, text boxes, headers/footers, images and original formatting are not fully preserved; inspect the extracted source. No macros or embedded content are executed.` };
}
export function pdfTextLines(items) {
  const lines = []; let line = '', baseline = null;
  const flush = () => { if (line.trim()) lines.push(line.trim()); line = ''; baseline = null; };
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5];
    if (baseline !== null && typeof y === 'number' && Math.abs(y - baseline) > 3) flush();
    if (line && !/\s$/.test(line) && !/^\s/.test(item.str)) line += ' ';
    line += item.str;
    if (typeof y === 'number') baseline = y;
    if (item.hasEOL) flush();
  }
  flush(); return lines;
}
async function readPDF(file) {
  const buffer = await file.arrayBuffer();
  if (!new TextDecoder('latin1').decode(buffer.slice(0, 1024)).includes('%PDF-')) throw new Error('The selected file does not contain a valid PDF header');
  const pdfjs = await import('./assets/pdf/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./assets/pdf/pdf.worker.mjs', document.baseURI).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true,
    cMapUrl: new URL('./assets/pdf/cmaps/', document.baseURI).href, cMapPacked: true,
    standardFontDataUrl: new URL('./assets/pdf/standard_fonts/', document.baseURI).href,
    wasmUrl: new URL('./assets/pdf/wasm/', document.baseURI).href });
  let timer; let rejectGuard;
  const guard = new Promise((resolve, reject) => { rejectGuard = reject; timer = setTimeout(() => reject(new Error('PDF extraction timed out; try a smaller document')), 30000); });
  task.onPassword = () => rejectGuard(new Error('This PDF is password protected. Upload an unlocked copy you are authorized to use.'));
  try {
    return await Promise.race([guard, (async () => {
      const pdf = await task.promise;
      if (pdf.numPages > 100) throw new Error('Use a PDF with at most 100 pages');
      const rows = []; let emptyPages = 0, characters = 0;
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const page = await pdf.getPage(pageNo), content = await page.getTextContent();
        const lines = pdfTextLines(content.items);
        if (!lines.length) emptyPages++;
        lines.forEach((text, index) => { characters += text.length; rows.push({ page: pageNo, line: index + 1, text }); });
        if (characters > 1_000_000 || rows.length > 5000) throw new Error('Extracted PDF text exceeds the supported limit. Split the PDF into smaller documents.');
        page.cleanup();
      }
      if (!rows.length) throw new Error('No text layer was found. This PDF may be scanned or image-only and needs OCR before text operations can run.');
      validateDataset(rows);
      return { kind: 'document', sheets: [{ name: 'PDF text', rows }],
        note: `Extracted text from ${pdf.numPages} page(s). ${emptyPages ? `${emptyPages} page(s) had no extractable text and may require OCR. ` : ''}PDF reading order and table layout may differ from the original. Tables remain text; financial/order columns are not guessed. Use the text field to search/filter, and inspect extracted lines before relying on them.` };
    })()]);
  } catch (error) {
    if (['InvalidPDFException', 'UnknownErrorException'].includes(error.name)) throw new Error('This PDF could not be read. It may be damaged or use unsupported PDF features.');
    throw error;
  } finally { clearTimeout(timer); await task.destroy(); }
}
export async function readDocumentFile(file) {
  if (/\.pdf$/i.test(file.name)) return readPDF(file);
  const buffer = await file.arrayBuffer();
  if (/\.docx$/i.test(file.name)) {
    checkXlsxArchive(buffer);
    const { unzipSync, strFromU8 } = await import('./assets/document-archive.js');
    let entries;
    try { entries = unzipSync(new Uint8Array(buffer), { filter: entry => entry.name === 'word/document.xml' }); }
    catch { throw new Error('The DOCX archive is damaged or unsupported'); }
    if (!entries['word/document.xml']) throw new Error('This archive is not a Word DOCX document');
    return parseWordXML(strFromU8(entries['word/document.xml']));
  }
  const rows = textRecords(decodeText(buffer));
  return { kind: 'document', sheets: [{ name: 'Text lines', rows }], note: 'Each non-empty line is an inspectable text record. Formatting and business fields are not inferred. Filter/search the text field; numeric operations require actual numeric fields. Markdown and log content are treated as text, never rendered as HTML or executed.' };
}
