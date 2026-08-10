// Behavior e2e for the terminal UI, run against the built dist/.
// LOCATOR POLICY: role/label/text only, never CSS class selectors.
// COUNTS: derived from the served manifest, never hardcoded.
const { test, expect } = require('@playwright/test');

let manifest;
test.beforeAll(async ({ request }) => {
  manifest = await (await request.get('/manifest.json')).json();
});

const MOTD_FINAL = 'Browse posts + projects with the picker.';

function nav(page) {
  return page.getByRole('navigation', { name: 'workspaces' });
}

async function tabTo(page, locator, max = 60) {
  for (let i = 0; i < max; i++) {
    const on = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
    if (on) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

test('MOTD types then completes instantly on click', async ({ page }) => {
  await page.goto('/index.html');
  const motd = page.getByLabel('message of the day');
  await motd.click();
  await expect(motd).toContainText(MOTD_FINAL);
});

test('MOTD is skipped on reload and absent on a deep-linked post', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByLabel('message of the day').click(); // completes -> sessionStorage.motdDone
  await page.reload();
  // Skipped path renders final text synchronously; assert it is present without
  // waiting for the ~1.3s typing animation.
  await expect(page.getByLabel('message of the day')).toContainText(MOTD_FINAL, { timeout: 700 });
  // A deep-linked reader page has no MOTD element at all.
  await page.goto('/posts/' + manifest.posts[0].slug + '.html');
  await expect(page.getByLabel('message of the day')).toHaveCount(0);
});

test('sidebar link swaps #pane via pjax without a full reload', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => { window.__marker = 1; });
  await nav(page).getByRole('link', { name: 'posts', exact: true }).click();
  await expect(page).toHaveURL(/\/posts\.html$/);
  await expect(page.getByRole('heading', { name: 'Posts', level: 1 })).toBeVisible();
  // Marker survived => no document navigation happened.
  expect(await page.evaluate(() => window.__marker)).toBe(1);
});

test('browser Back restores the previous pane after a pjax nav', async ({ page }) => {
  await page.goto('/index.html');
  await nav(page).getByRole('link', { name: 'posts', exact: true }).click();
  await expect(page).toHaveURL(/\/posts\.html$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.getByRole('heading', { name: 'Lucas Luize', level: 1 })).toBeVisible();
});

test('telescope narrows results and Enter opens a post', async ({ page }) => {
  await page.goto('/posts.html');
  const input = page.getByRole('combobox');
  const options = page.getByRole('option');
  const total = manifest.posts.length;
  await expect(options).toHaveCount(total);
  await input.fill('terraform');
  await expect.poll(() => options.count()).toBeLessThan(total);
  expect(await options.count()).toBeGreaterThan(0);
  await input.press('Enter');
  await expect(page).toHaveURL(/\/posts\/.+\.html$/);
});

test('telescope tag chip filters results', async ({ page }) => {
  await page.goto('/posts.html');
  const options = page.getByRole('option');
  const total = manifest.posts.length;
  await expect(options).toHaveCount(total);
  // Derive a tag that some (not all) posts carry, so filtering must shrink the list.
  const counts = {};
  for (const p of manifest.posts) for (const t of p.tags || []) counts[t] = (counts[t] || 0) + 1;
  const tag = Object.keys(counts).find((t) => counts[t] > 0 && counts[t] < total);
  expect(tag).toBeTruthy();
  await page.getByRole('group', { name: 'filter by tag' })
    .getByRole('button', { name: tag, exact: true }).click();
  await expect.poll(() => options.count()).toBe(counts[tag]);
});

test('post deep link renders an h1 and share links', async ({ page }) => {
  const post = manifest.posts[0];
  await page.goto('/posts/' + post.slug + '.html');
  await expect(page.getByRole('heading', { level: 1, name: post.title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Share on X' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Share on LinkedIn' })).toBeVisible();
});

test('post.html?slug=X redirects to the reader page', async ({ page }) => {
  const slug = manifest.posts[1].slug;
  await page.goto('/post.html?slug=' + slug);
  await expect(page).toHaveURL(new RegExp('/posts/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.html$'));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('prompt: "open posts" navigates and "sudo x" prints command-not-found', async ({ page }) => {
  await page.goto('/index.html');
  const cmd = page.getByRole('textbox', { name: 'command', exact: true });
  await cmd.fill('open posts');
  await cmd.press('Enter');
  await expect(page).toHaveURL(/\/posts\.html$/);
  // Prompt is chrome (survives pjax); the same input keeps working.
  await cmd.fill('sudo x');
  await cmd.press('Enter');
  await expect(page.getByText(/command not found/)).toBeVisible();
});

test('contact wizard rejects a bad email then prints the mailto fallback', async ({ page }) => {
  await page.goto('/contact.html');
  const cmd = page.getByRole('textbox', { name: 'command', exact: true });
  await cmd.fill('contact');
  await cmd.press('Enter');
  await expect(page.getByText('name:', { exact: true })).toBeVisible();
  await cmd.fill('Test User');
  await cmd.press('Enter');
  await cmd.fill('not-an-email');
  await cmd.press('Enter');
  await expect(page.getByText(/valid email/)).toBeVisible();
  await cmd.fill('test@example.com');
  await cmd.press('Enter');
  await cmd.fill('Hello there, this is a test message.');
  await cmd.press('Enter');
  await expect(page.getByText(/send\? \[Y\/n\]/)).toBeVisible();
  await cmd.fill('y');
  await cmd.press('Enter');
  const mailto = page.getByRole('link', { name: /^mailto:/ });
  await expect(mailto).toBeVisible();
  await expect(mailto).toHaveAttribute('href', /^mailto:/);
});

test('keyboard-only journey: reach posts, open a post, go back', async ({ page }) => {
  await page.goto('/index.html');
  const postsLink = nav(page).getByRole('link', { name: 'posts', exact: true });
  expect(await tabTo(page, postsLink)).toBe(true);
  await expect(postsLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/posts\.html$/);
  // Tab to the telescope input, then Enter opens the first result.
  const input = page.getByRole('combobox');
  expect(await tabTo(page, input)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/posts\/.+\.html$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/posts\.html$/);
});

test('unknown URL 404s and the 404 page shows not-found content', async ({ page }) => {
  // Static host maps unknown paths to 404.html; the local python server returns a
  // 404 status for a missing file. Assert both: the status, and that our custom
  // 404 page renders the not-found content.
  const resp = await page.goto('/definitely-not-a-real-path-xyz.html');
  expect(resp.status()).toBe(404);
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  await expect(page.getByText(/does not resolve/)).toBeVisible();
});
