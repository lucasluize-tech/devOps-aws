const { test, expect } = require('@playwright/test');
const { exec, execSync } = require('child_process');
const path = require('path');

test.describe('Blog Tests', () => {
  let server;

  test.beforeAll(async () => {
    // Kill any existing server on port 8000
    try {
      execSync('pkill -f "python3 -m http.server 8000" || true');
    } catch (e) {}
    // Start local server in the project root
    const projectRoot = path.join(__dirname, '..', '..');
    try {
      server = exec('python3 -m http.server 8000', { cwd: projectRoot });
      console.log('Server command executed in:', projectRoot);
      server.stdout.on('data', (data) => console.log('Server stdout:', data));
      server.stderr.on('data', (data) => console.error('Server stderr:', data));
      server.on('close', (code) => console.log('Server closed with code:', code));
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer
      console.log('Server should be ready after 5s');
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
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
    await expect(cards).toHaveCount(4); // Max 4 per page
  });

  test('Pagination controls render', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#pagination-controls');
    const controls = page.locator('#pagination-controls');
    await expect(controls).toBeVisible();
    const dots = page.locator('.dot');
    await expect(dots).toHaveCount(2); // 5 posts / 4 = 2 pages
    const activeDot = page.locator('.dot.active');
    await expect(activeDot).toHaveCount(1);
  });

  test('Pagination arrows work', async ({ page }) => {
    await page.goto('http://localhost:8000');
    const nextBtn = page.locator('.pagination-arrows button').filter({ hasText: '→' });
    await nextBtn.click();
    const cards = page.locator('#posts-list .card');
    await expect(cards).toHaveCount(1); // Page 2 has 1 post
    const activeDot = page.locator('.dot.active').nth(1);
    await expect(activeDot).toBeVisible(); // Second dot active
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
    await page.waitForURL(/post\.html\?slug=.+/);
    await expect(page.locator('h1.post-title')).toBeVisible();
  });

  test('Post page renders correctly', async ({ page }) => {
    await page.goto('http://localhost:8000/post.html?slug=s3-cloudfront-oac-acm-static-site');
    await expect(page.locator('h1.post-title')).toContainText('From Static S3 to CDN with HTTPS');
    await expect(page.locator('.post-content')).toBeVisible();
    await expect(page.locator('#share-twitter')).toHaveAttribute('href', /twitter\.com/);
  });
});
