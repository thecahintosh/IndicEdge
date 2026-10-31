import { test, expect } from '@playwright/test';
test('workbench interprets financial questions without requiring customer/order columns', async ({ page }) => {
  await page.goto('/#sources'); await expect(page.locator('#connectionLabel')).toHaveText('Local workspace');
  await page.locator('#sourceFile').setInputFiles({ name: 'finance.csv', mimeType: 'text/csv', buffer: Buffer.from('money_in_inr,money_out_inr,running_balance_inr\n100,0,20000\n0,50,19950') });
  await page.getByRole('link', { name: 'Workbench', exact: true }).click();
  await page.locator('#instruction').fill('find the total running balance');
  await page.getByRole('button', { name: 'Review workflow', exact: true }).click();
  await expect(page.locator('#rulesPanel')).not.toBeVisible();
  await expect(page.locator('#dataTaskRules')).toContainText('double-count');
  await expect(page.locator('#sourceConstraintNote')).toBeEmpty();
  await page.getByRole('button', { name: 'Run calculation', exact: true }).click();
  await expect(page.locator('#resultFacts')).toHaveText('19950');
  await page.locator('#instruction').fill('find total income');
  await page.getByRole('button', { name: 'Review workflow', exact: true }).click();
  await page.getByRole('button', { name: 'Run calculation', exact: true }).click();
  await expect(page.locator('#resultFacts')).toHaveText('100');
  await expect(page.locator('#saveWorkflow')).toBeDisabled();
});
