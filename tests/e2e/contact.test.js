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

test('shell and composer share one draft: set updates the form, form feeds draft', async ({ page }) => {
  await page.goto('/contact.html');
  // form -> shell
  await page.getByLabel('Subject').fill('typed in the form');
  const cmd = page.getByRole('textbox', { name: 'command', exact: true });
  await cmd.fill('draft');
  await cmd.press('Enter');
  await expect(page.getByText('Subject: typed in the form')).toBeVisible();
  // shell -> form
  await cmd.fill('set subject changed from the shell');
  await cmd.press('Enter');
  await expect(page.getByLabel('Subject')).toHaveValue('changed from the shell');
});
