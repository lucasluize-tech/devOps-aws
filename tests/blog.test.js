const { test, expect } = require('@playwright/test');
const { exec } = require('child_process');
const path = require('path');

test.describe('Blog Tests', () => {
  let server;

  test.beforeAll(async () => {
    // Start local server
    server = exec('python3 -m http.server 8000', { cwd: __dirname });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for server to start
  });

  test.afterAll(() => {
    if (server) server.kill();
  });

  test('Homepage loads and renders', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await expect(page.locator('h1')).toContainText('Building reliable, automated cloud platforms');
    await expect(page.locator('#posts')).toBeVisible();
  });

  test('Posts load and display correctly', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#posts-list .card');
    const cards = page.locator('#posts-list .card');
    await expect(cards).toHaveCount(3); // Assuming 3 posts
  });

  test('Search functionality works', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.fill('#search-input', 'AWS');
    await page.waitForTimeout(500); // Wait for filter
    const cards = page.locator('#posts-list .card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1); // Should filter to relevant posts
  });

  test('Tag filtering works', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.click('text=AWS'); // Click AWS tag button
    await page.waitForTimeout(500);
    const cards = page.locator('#posts-list .card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Post navigation works', async ({ page }) => {
    await page.goto('http://localhost:8000');
    const firstCard = page.locator('#posts-list .card').first();
    await firstCard.click();
    await expect(page).toHaveURL(/post\.html\?slug=.+/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('Post page renders correctly', async ({ page }) => {
    await page.goto('http://localhost:8000/post.html?slug=s3-cloudfront-oac-acm-static-site');
    await expect(page.locator('h1')).toContainText('From Static S3 to CDN with HTTPS');
    await expect(page.locator('.post-content')).toBeVisible();
    await expect(page.locator('#share-twitter')).toHaveAttribute('href', /twitter\.com/);
  });
});