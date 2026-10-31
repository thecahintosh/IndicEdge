import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { zipSync, strToU8 } from 'fflate';
import { mkdirSync } from 'node:fs';

const csv = 'date,transaction_id,category,money_in_inr,money_out_inr,running_balance_inr\n2026-10-01,T1,Opening,0,0,1000\n2026-10-02,T2,Sales,100.10,0,1100.10\n2026-10-03,T3,Stock,0,25.20,1074.90';
test('financial CSV loads with missing-column notes and supports field operations without transmitting data', async ({ page }) => {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') requests.push(request.postData()); });
  await page.goto('/#sources'); await expect(page.locator('#connectionLabel')).toHaveText('Local workspace');
  await page.locator('#sourceFile').setInputFiles({ name: 'financial.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#sourceRows tr')).toHaveCount(3);
  await expect(page.locator('#datasetCompatibility')).toContainText('Missing columns: order_id, customer_name, contact, due_date, amount, status');
  await expect(page.locator('#datasetCompatibility')).toContainText('Cash-flow summary · Available');
  await page.getByRole('button', { name: 'Run operation', exact: true }).click();
  await expect(page.locator('#datasetResultBody')).toContainText('74.9');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (process.env.CAPTURE_UI === 'true') {
    mkdirSync('.impeccable/review', { recursive: true }); await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
    await page.screenshot({ path: '.impeccable/review/dataset-desktop.png', fullPage: true });
  }
  await page.locator('#datasetOperation').selectOption('sum');
  await page.locator('#datasetField').selectOption('money_in_inr');
  await page.getByRole('button', { name: 'Run operation', exact: true }).click();
  await expect(page.locator('#datasetValue')).toHaveText('100.1');
  await page.locator('#datasetOperation').selectOption('filter');
  await page.locator('#datasetField').selectOption('category');
  await page.locator('#datasetFilterValue').fill('Sales');
  await page.getByRole('button', { name: 'Run operation', exact: true }).click();
  await expect(page.locator('#datasetResultBody tr')).toHaveCount(1);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export result CSV' }).click();
  expect((await download).suggestedFilename()).toBe('indicedge-analysis.csv');
  await page.getByRole('button', { name: 'Use these rows as active source' }).click();
  await expect(page.locator('#sourceRows tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Workbench', exact: true }).click();
  await expect(page.locator('#runWorkflow')).toBeDisabled();
  await expect(page.locator('#sourceConstraintNote')).toContainText('due_date');
  expect(requests.join('')).not.toMatch(/T1|T2|T3|running_balance_inr/);
  expect(errors).toEqual([]);

  await page.getByRole('link', { name: 'Source data', exact: true }).click();
  await page.locator('#sourceFile').setInputFiles({ name: 'financial.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (process.env.CAPTURE_UI === 'true') { await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await page.screenshot({ path: '.impeccable/review/dataset-mobile.png', fullPage: true }); }
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

function workbook() {
  const sheet = (header, value) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${header}</t></is></c><c r="B1" t="inlineStr"><is><t>Amount</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${value}</t></is></c><c r="B2"><v>10.25</v></c></row></sheetData></worksheet>`;
  return Buffer.from(zipSync(Object.fromEntries(Object.entries({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/><sheet name="Stock" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet('Customer Name', 'Fictional customer'),
    'xl/worksheets/sheet2.xml': sheet('Product Name', 'Rice')
  }).map(([name, xml]) => [name, strToU8(xml)]))));
}
test('XLSX uses browser worker, supports multiple worksheets and clears stale results on sheet changes', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#sources'); await expect(page.locator('#connectionLabel')).toHaveText('Local workspace');
  await page.locator('#sourceFile').setInputFiles({ name: 'workbook.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook() });
  await expect(page.locator('#sourceName')).toHaveText('workbook.xlsx');
  await expect(page.locator('#sourceRows')).toContainText('Fictional customer');
  await page.locator('#datasetOperation').selectOption('sum'); await page.locator('#datasetField').selectOption('Amount');
  await page.getByRole('button', { name: 'Run operation', exact: true }).click();
  await expect(page.locator('#datasetValue')).toHaveText('10.25');
  await page.locator('#sourceSheet').selectOption({ label: 'Stock' });
  await expect(page.locator('#sourceRows')).toContainText('Rice');
  await expect(page.locator('#datasetResult')).not.toBeVisible();
  expect(errors).toEqual([]);
});
