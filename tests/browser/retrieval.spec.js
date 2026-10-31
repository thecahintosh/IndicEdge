import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';

test('multi-file retrieval returns cited evidence locally, reports no matches and respects excluded fields', async ({ page }) => {
  const errors = [], posts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.postData()); });
  await page.goto('/#retrieve'); await expect(page.locator('#connectionLabel')).toHaveText('Local workspace');
  await expect(page.locator('#ragSearch')).toBeDisabled();
  await page.locator('#ragFiles').setInputFiles([
    { name: 'returns.txt', mimeType: 'text/plain', buffer: Buffer.from('Refund policy: unused goods can be returned within 30 days.\nA purchase receipt is required.') },
    { name: 'delivery.txt', mimeType: 'text/plain', buffer: Buffer.from('Standard shipping takes five business days. Express delivery is available.') }
  ]);
  await expect(page.locator('#ragSourceList .rag-source')).toHaveCount(2);
  await page.locator('#ragQuestion').fill('What is the refund policy?');
  await page.getByRole('button', { name: 'Find relevant excerpts', exact: true }).click();
  await expect(page.locator('#ragEvidence .rag-passage')).toHaveCount(1);
  await expect(page.locator('#ragEvidence')).toContainText('[S1] returns.txt');
  await expect(page.locator('#ragEvidence')).toContainText('30 days');
  await expect(page.locator('#ragEvidence')).toContainText('Lines 1–2');
  await expect(page.locator('#ragPreviewAI')).toBeDisabled();
  await expect(page.locator('#ragAIAvailability')).toContainText('Local retrieval and citations still work');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (process.env.CAPTURE_UI === 'true') { mkdirSync('.impeccable/review', { recursive: true }); await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await page.screenshot({ path: '.impeccable/review/retrieval-desktop.png', fullPage: true }); }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (process.env.CAPTURE_UI === 'true') { await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await page.screenshot({ path: '.impeccable/review/retrieval-mobile.png', fullPage: true }); }
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#ragQuestion').fill('zebras astronomy');
  await page.getByRole('button', { name: 'Find relevant excerpts', exact: true }).click();
  await expect(page.locator('#ragSearchMessage')).toContainText('No relevant evidence');
  await expect(page.locator('#ragEvidence')).toBeEmpty();
  await page.locator('#ragFiles').setInputFiles({ name: 'private.csv', mimeType: 'text/csv', buffer: Buffer.from('product,bank_account\nRice,FORBIDDENBANKTOKEN') });
  await expect(page.locator('#ragSourceList .rag-source')).toHaveCount(3);
  await page.locator('#ragQuestion').fill('FORBIDDENBANKTOKEN');
  await page.getByRole('button', { name: 'Find relevant excerpts', exact: true }).click();
  await expect(page.locator('#ragSearchMessage')).toContainText('No relevant evidence');
  await page.getByText('Fields used for retrieval', { exact: true }).click();
  await page.locator('#ragFields input[value="bank_account"]').check();
  await page.getByRole('button', { name: 'Find relevant excerpts', exact: true }).click();
  await expect(page.locator('#ragEvidence')).toContainText('FORBIDDENBANKTOKEN');
  expect(posts.join('')).not.toMatch(/Refund policy|FORBIDDENBANKTOKEN/);
  await page.getByRole('button', { name: 'Clear retrieval files', exact: true }).click();
  await expect(page.locator('#ragSourceList')).toBeEmpty(); await expect(page.locator('#ragEvidence')).toBeEmpty();
  expect(errors).toEqual([]);
});

test('active source is explicitly added as a snapshot; re-adding replaces stale evidence', async ({ page }) => {
  await page.goto('/#sources'); await expect(page.locator('#connectionLabel')).toHaveText('Local workspace');
  await page.locator('#sourceFile').setInputFiles({ name: 'policy.txt', mimeType: 'text/plain', buffer: Buffer.from('Refund policy allows returns within 30 days.') });
  await page.getByRole('button', { name: 'Ask about this source', exact: true }).click();
  await expect(page.locator('#retrieveView')).toBeVisible();
  await page.locator('#ragQuestion').fill('refund policy'); await page.getByRole('button', { name: 'Find relevant excerpts', exact: true }).click();
  await expect(page.locator('#ragEvidence')).toContainText('30 days');
  await page.getByRole('link', { name: 'Source data', exact: true }).click();
  await page.locator('#sourceFile').setInputFiles({ name: 'policy.txt', mimeType: 'text/plain', buffer: Buffer.from('Refund policy allows returns within 14 days.') });
  await page.getByRole('button', { name: 'Ask about this source', exact: true }).click();
  await expect(page.locator('#ragSourceList .rag-source')).toHaveCount(1);
  await page.locator('#ragQuestion').fill('refund policy'); await page.getByRole('button', { name: 'Find relevant excerpts', exact: true }).click();
  await expect(page.locator('#ragEvidence')).toContainText('14 days');
  await expect(page.locator('#ragEvidence')).not.toContainText('30 days');
});
