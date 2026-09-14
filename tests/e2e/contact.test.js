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

test('send with unconfigured endpoint keeps the draft and offers mailto', async ({ page }) => {
  await page.goto('/contact.html');
  await page.getByLabel('Name').fill('Jane');
  await page.getByLabel('From').fill('j@co.com');
  await page.getByLabel('Subject').fill('SRE');
  // exact: true - "Message" would otherwise substring-match the compose
  // form's own aria-label ("compose message") and violate strict mode.
  await page.getByLabel('Message', { exact: true }).fill('hello');
  await page.getByRole('button', { name: /send/ }).click();
  // draft untouched after the failed relay
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('hello');
  // scoped to the compose form's status bar - the same copy also lands in
  // the prompt scrollback (draft:sent summary), which would make an
  // unscoped getByText match strict-mode ambiguous.
  const composeForm = page.getByRole('form', { name: 'compose message' });
  await expect(composeForm.getByText(/draft is still here|relay unavailable/)).toBeVisible();
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
