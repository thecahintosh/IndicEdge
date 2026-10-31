import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import AxeBuilder from '@axe-core/playwright';

function pdf(text) {
  const content = text ? `BT /F1 12 Tf 50 750 Td (${text}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const start = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result);
}
function docx() {
  const paragraph = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const cell = text => `<w:tc>${paragraph(text)}</w:tc>`;
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph('Fictional invoice for local extraction')}
    <w:tbl><w:tr>${cell('Product')}${cell('Amount')}</w:tr><w:tr>${cell('Rice')}${cell('100.10')}</w:tr><w:tr>${cell('Tea')}${cell('25.20')}</w:tr></w:tbl></w:body></w:document>`;
  return Buffer.from(zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') }));
}
test('PDF text loads locally; filters work; image-only PDFs report OCR requirement', async ({ page }) => {
  const errors = [], posts = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (r.method() === 'POST') posts.push(r.postData()); });
  await page.goto('/#sources'); await expect(page.locator('#connectionLabel')).toHaveText('Local workspace');
  await page.locator('#sourceFile').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: pdf('Invoice balance 250 INR') });
  await expect(page.locator('#sourceName')).toHaveText('invoice.pdf');
  await expect(page.locator('#sourceRows')).toContainText('Invoice balance 250 INR');
  await expect(page.locator('#sourceImportNote')).toContainText('financial/order columns are not guessed');
  await page.locator('#datasetOperation').selectOption('filter'); await page.locator('#datasetField').selectOption('text');
  await page.locator('#datasetComparator').selectOption('contains'); await page.locator('#datasetFilterValue').fill('balance');
  await page.getByRole('button', { name: 'Run operation', exact: true }).click(); await expect(page.locator('#datasetResultBody tr')).toHaveCount(1);
  expect(posts.join('')).not.toContain('Invoice balance');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator('#sourceFile').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdf('') });
  await expect(page.locator('#sourceName')).toHaveText('Source rejected'); await expect(page.locator('#globalMessage')).toContainText('needs OCR');
  expect(errors).toEqual([]);
});
test('Word paragraphs and separately selectable tables load, allowing numeric field operations', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#sources'); await expect(page.locator('#connectionLabel')).toHaveText('Local workspace');
  await page.locator('#sourceFile').setInputFiles({ name: 'invoice.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx() });
  await expect(page.locator('#sourceName')).toHaveText('invoice.docx');
  await expect(page.locator('#sourceRows')).toContainText('Fictional invoice');
  await page.locator('#sourceSheet').selectOption({ label: 'Table 1' });
  await expect(page.locator('#sourceRows tr')).toHaveCount(2);
  await page.locator('#datasetOperation').selectOption('sum'); await page.locator('#datasetField').selectOption('Amount');
  await page.getByRole('button', { name: 'Run operation', exact: true }).click(); await expect(page.locator('#datasetValue')).toHaveText('125.3');
  await expect(page.locator('#datasetCompatibility')).toContainText('Missing columns');
  expect(errors).toEqual([]);
});
test('plain text keeps literal markup inert and supports line counts', async ({ page }) => {
  await page.goto('/#sources'); await expect(page.locator('#connectionLabel')).toHaveText('Local workspace');
  await page.locator('#sourceFile').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Payment due\n\n<script>window.__INJECTED=true</script>\nAsk for a receipt') });
  await expect(page.locator('#sourceRows tr')).toHaveCount(3);
  expect(await page.evaluate(() => window.__INJECTED)).toBeUndefined();
  await page.locator('#datasetOperation').selectOption('count'); await page.getByRole('button', { name: 'Run operation', exact: true }).click();
  await expect(page.locator('#datasetValue')).toHaveText('3');
});
