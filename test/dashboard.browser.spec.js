const { test, expect } = require('@playwright/test');

test('dashboard renders controls and live-data formatting toggle', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/dashboard');
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status' })).toBeVisible();
  await expect(page.locator('#format-toggle')).toBeVisible();
  await page.locator('#format-toggle').check();
  await expect(page.locator('#format-label')).toHaveText('Single-line JSON');
});
