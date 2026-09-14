// tests/e2e/contact.test.js - contact workspace behavior (two-surface draft).
const { test, expect } = require('@playwright/test');

test('composer fields persist across pjax navigation (module draft state)', async ({ page }) => {
  await page.goto('/contact.html');
  await page.getByLabel('Name').fill('Jane Smith');
  await page.getByLabel('Subject').fill('SRE opportunity');
  // navigate away and back through the sidebar (pjax, no reload)
  await page.getByRole('navigation', { name: 'workspaces' })
    .getByRole('link', { name: 'about', exact: true }).click();
  await expect(page).toHaveURL(/about\.html$/);
  await page.getByRole('navigation', { name: 'workspaces' })
    .getByRole('link', { name: 'contact', exact: true }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Jane Smith');
  await expect(page.getByLabel('Subject')).toHaveValue('SRE opportunity');
});
