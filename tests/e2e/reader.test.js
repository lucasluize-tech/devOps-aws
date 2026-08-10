// Reader page e2e: full chrome renders, and the title appears exactly once
// (regression guard for the double-title bug).
const { test, expect } = require('@playwright/test');

let manifest;
test.beforeAll(async ({ request }) => {
  manifest = await (await request.get('/manifest.json')).json();
});

test('post page renders reader chrome with the title exactly once', async ({ page }) => {
  const post = manifest.posts[0];
  await page.goto('/posts/' + post.slug + '.html');

  // Exactly one h1, and the title text appears exactly once on the page.
  await expect(page.getByRole('heading', { level: 1, name: post.title })).toHaveCount(1);
  await expect(page.getByText(post.title, { exact: true })).toHaveCount(1);

  // Reading time + at least one tag from the manifest.
  await expect(page.getByText(/min read/)).toBeVisible();
  await expect(page.getByText(post.tags[0], { exact: true }).first()).toBeVisible();

  // Share links.
  await expect(page.getByRole('link', { name: 'Share on X' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Share on LinkedIn' })).toBeVisible();

  // Prose body rendered inside the article region.
  const article = page.getByRole('article');
  await expect(article).toBeVisible();
  expect((await article.innerText()).length).toBeGreaterThan(200);
});
