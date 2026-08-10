// Accessibility gate: zero serious/critical axe violations on the key pages.
const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

let manifest;
test.beforeAll(async ({ request }) => {
  manifest = await (await request.get('/manifest.json')).json();
});

async function seriousViolations(page, url) {
  await page.goto(url);
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

test('index has no serious/critical a11y violations', async ({ page }) => {
  const v = await seriousViolations(page, '/');
  expect(v, JSON.stringify(v.map((x) => ({ id: x.id, nodes: x.nodes.length })), null, 2)).toEqual([]);
});

test('posts has no serious/critical a11y violations', async ({ page }) => {
  const v = await seriousViolations(page, '/posts.html');
  expect(v, JSON.stringify(v.map((x) => ({ id: x.id, nodes: x.nodes.length })), null, 2)).toEqual([]);
});

test('a post page has no serious/critical a11y violations', async ({ page }) => {
  const v = await seriousViolations(page, '/' + manifest.posts[0].url);
  expect(v, JSON.stringify(v.map((x) => ({ id: x.id, nodes: x.nodes.length })), null, 2)).toEqual([]);
});

test('contact has no serious/critical a11y violations', async ({ page }) => {
  const v = await seriousViolations(page, '/contact.html');
  expect(v, JSON.stringify(v.map((x) => ({ id: x.id, nodes: x.nodes.length })), null, 2)).toEqual([]);
});
