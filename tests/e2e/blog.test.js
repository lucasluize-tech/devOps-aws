const { test, expect } = require('@playwright/test');

test.describe('Blog Tests', () => {
  test('Homepage loads and renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Building reliable, automated cloud platforms');
    await expect(page.locator('#posts')).toBeVisible();
  });

  test('Posts load and display correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#posts-list .card');
    const cards = page.locator('#posts-list .card');
    await expect(cards).toHaveCount(4); // Max 4 per page
  });

  test('Pagination controls render', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#pagination-controls');
    const controls = page.locator('#pagination-controls');
    await expect(controls).toBeVisible();
    const totalPosts = await page.evaluate(async () => {
      const response = await fetch('/posts/index.json');
      const posts = await response.json();
      return posts.length;
    });
    const expectedPages = Math.ceil(totalPosts / 4);
    const dots = page.locator('.dot');
    await expect(dots).toHaveCount(expectedPages);
    const activeDot = page.locator('.dot.active');
    await expect(activeDot).toHaveCount(1);
  });

  test('Pagination arrows work', async ({ page }) => {
    await page.goto('/');
    const totalPosts = await page.evaluate(async () => {
      const response = await fetch('/posts/index.json');
      const posts = await response.json();
      return posts.length;
    });

    const nextBtn = page.locator('.pagination-arrows button').filter({ hasText: '→' });
    await nextBtn.click();
    const cards = page.locator('#posts-list .card');

    const postsPerPage = 4;
    const expectedSecondPageCount = Math.min(postsPerPage, totalPosts - postsPerPage);
    await expect(cards).toHaveCount(expectedSecondPageCount);
    await expect(page.locator('.dot').nth(1)).toHaveClass(/active/); // Second dot active
  });

  test('Search functionality works', async ({ page }) => {
    await page.goto('/');
    await page.fill('#search-input', 'AWS');
    await page.waitForTimeout(500); // Wait for filter
    const cards = page.locator('#posts-list .card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1); // Should filter to relevant posts
  });

  test('Tag filtering works', async ({ page }) => {
    await page.goto('/');
    await page.click('text=AWS'); // Click AWS tag button
    await page.waitForTimeout(500);
    const cards = page.locator('#posts-list .card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Post navigation works', async ({ page }) => {
    await page.goto('/');
    const firstCard = page.locator('#posts-list .card').first();
    await firstCard.click();
    await page.waitForURL(/post\.html\?slug=.+/);
    await expect(page.locator('h1.post-title')).toBeVisible();
  });

  test('Post page renders correctly', async ({ page }) => {
    await page.goto('/post.html?slug=s3-cloudfront-oac-acm-static-site');
    await expect(page.locator('h1.post-title')).toContainText('From Static S3 to CDN with HTTPS');
    await expect(page.locator('.post-content')).toBeVisible();
    await expect(page.locator('#share-twitter')).toHaveAttribute('href', /twitter\.com/);
  });
});
