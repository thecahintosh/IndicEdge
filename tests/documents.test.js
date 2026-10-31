import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textRecords, decodeText, pdfTextLines } from '../document-reader.js';
import { readDatasetFile } from '../source-loader.js';

test('plain text retains line provenance, blank-line gaps and literal markup', () => {
  const rows = textRecords('Invoice 17\r\n\r\n<script>not executable</script>\nBalance: 250 INR');
  assert.deepEqual(rows.map(row => row.line), [1, 3, 4]);
  assert.equal(rows[1].text, '<script>not executable</script>');
  assert.throws(() => textRecords('\n   \n'), /No readable text/);
  assert.throws(() => textRecords('binary\u0000data'), /binary/);
});
test('UTF-8 and UTF-16 text decode without silently substituting bad bytes', () => {
  assert.equal(decodeText(new TextEncoder().encode('हिंदी record').buffer), 'हिंदी record');
  const encoded = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Invoice 17', 'utf16le')]);
  assert.equal(decodeText(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)), 'Invoice 17');
  assert.throws(() => decodeText(new Uint8Array([0xff, 0xff]).buffer), /encoding/);
});
test('PDF text groups by line baselines and explicit end-of-line markers', () => {
  assert.deepEqual(pdfTextLines([
    { str: 'Invoice', transform: [1, 0, 0, 1, 10, 700] },
    { str: '17', transform: [1, 0, 0, 1, 70, 700], hasEOL: true },
    { str: 'Balance 250', transform: [1, 0, 0, 1, 10, 680] },
    { str: 'Next line', transform: [1, 0, 0, 1, 10, 660] }
  ]), ['Invoice 17', 'Balance 250', 'Next line']);
});
test('document size/format failures are explicit; text sources remain usable without order columns', async () => {
  const file = new File(['First line\nSecond line'], 'notes.txt', { type: 'text/plain' });
  const result = await readDatasetFile(file);
  assert.equal(result.sheets[0].rows.length, 2);
  assert.equal(result.kind, 'document');
  await assert.rejects(readDatasetFile(new File(['anything'], 'unknown.exe')), /Supported files/);
  await assert.rejects(readDatasetFile({ name: 'big.pdf', size: 5000001 }), /5 MB/);
});
