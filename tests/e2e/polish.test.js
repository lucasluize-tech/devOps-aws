// Behavior e2e for the herdr polish wave: draggable dividers, code copy,
// reading-progress spacing, cwd-aware prompt. Same locator policy as
// terminal.test.js: role/label/text, counts from the manifest.
const { test, expect } = require('@playwright/test');

let manifest;
test.beforeAll(async ({ request }) => {
  manifest = await (await request.get('/manifest.json')).json();
});

// Find a post whose page actually has code fences (copy buttons).
async function gotoPostWithCode(page) {
  for (const p of manifest.posts) {
    await page.goto('/posts/' + p.slug + '.html');
    if (await page.getByRole('button', { name: 'copy' }).count()) return p;
  }
  throw new Error('no post with a code fence found');
}

test('dragging the sidebar divider resizes the sidebar and persists', async ({ page }) => {
  await page.goto('/index.html');
  const nav = page.getByRole('navigation', { name: 'workspaces' });
  const sep = page.getByRole('separator', { name: 'resize sidebar' });
  const before = (await nav.boundingBox()).width;
  const box = await sep.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + 200;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y, { steps: 4 });
  await page.mouse.up();
  const after = (await nav.boundingBox()).width;
  expect(after).toBeGreaterThan(before + 40);
  // localStorage persistence survives a reload
  await page.reload();
  const persisted = (await nav.boundingBox()).width;
  expect(Math.abs(persisted - after)).toBeLessThan(4);
});

test('telescope vim keys: esc unlocks j/k, s flips sort, / refocuses filter', async ({ page }) => {
  await page.goto('/posts.html');
  const listbox = page.getByRole('listbox', { name: 'posts results' });
  const options = listbox.getByRole('option');
  const firstTitle = await options.first().textContent();
  // focus starts in the fuzzy input; Escape hands it to the list
  await page.keyboard.press('Escape');
  await expect(listbox).toBeFocused();
  await page.keyboard.press('j');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('k');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  // s reverses the sort: a different post now heads the list
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'toggle sort order' })).toHaveText('sort:oldest');
  await expect(options.first()).not.toHaveText(firstTitle);
  // / returns focus to the filter input
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: 'fuzzy filter posts' })).toBeFocused();
});

test('keyboard on the telescope divider widens the results pane', async ({ page }) => {
  await page.goto('/posts.html');
  const results = page.getByRole('listbox', { name: 'posts results' });
  const before = (await results.boundingBox()).width;
  const sep = page.getByRole('separator', { name: 'resize results' });
  await sep.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const after = (await results.boundingBox()).width;
  expect(after).toBeGreaterThan(before + 20);
});

test('code copy button puts the snippet on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await gotoPostWithCode(page);
  const btn = page.getByRole('button', { name: 'copy' }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(page.getByRole('button', { name: 'copied!' }).first()).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.length).toBeGreaterThan(0);
  // the clipboard holds the code, not the chrome
  expect(clip).not.toContain('copy');
});

test('reading progress label has a space between read and the percent', async ({ page }) => {
  await page.goto('/posts/' + manifest.posts[0].slug + '.html');
  // the ::before content carries the label; assert the nbsp survived
  const content = await page.evaluate(() => {
    const el = document.querySelector('[data-progress]');
    return getComputedStyle(el, '::before').content;
  });
  expect(content).toContain('read ');
});

test('prompt cwd follows navigation (prompt + statusline)', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.getByText('lucas@devops', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'workspaces' })
    .getByRole('link', { name: 'projects', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\.html$/);
  // prompt label + statusline path + picker pane title all show the new cwd
  await expect(page.getByText('~/projects', { exact: true })).toHaveCount(3);
  // and the click echoed its command into the scrollback
  await expect(page.getByText('> cd projects', { exact: true })).toBeVisible();
});

test('code fences are syntax-highlighted (shiki token spans)', async ({ page }) => {
  await gotoPostWithCode(page);
  const tokenCount = await page.evaluate(
    () => document.querySelectorAll('pre span[style*="color:"]').length
  );
  expect(tokenCount).toBeGreaterThan(0);
});
