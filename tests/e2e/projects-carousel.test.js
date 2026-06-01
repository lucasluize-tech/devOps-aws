const { test, expect } = require('@playwright/test');

test.describe('Projects carousel', () => {
  test('renders 6 project cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects-carousel .project-card');
    const cards = page.locator('#projects-carousel .project-card');
    await expect(cards).toHaveCount(6);
  });

  test('each card is a clickable anchor with /project.html?slug=... href', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects-carousel .project-card');
    const firstCard = page.locator('#projects-carousel .project-card').first();
    await expect(firstCard).toHaveAttribute('href', /\/project\.html\?slug=.+/);
  });

  test('clicking a card navigates to detail page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects-carousel .project-card');
    await page.locator('#projects-carousel .project-card').first().click();
    await page.waitForURL(/project\.html\?slug=.+/);
    await expect(page.locator('.project-title')).toBeVisible();
  });

  test('renders 6 pagination dots with first active', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects-dots .dot');
    const dots = page.locator('#projects-dots .dot');
    await expect(dots).toHaveCount(6);
    await expect(dots.nth(0)).toHaveClass(/active/);
  });

  test('each card renders category tag, status pill, title, goal, tech chips', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects-carousel .project-card');
    const card = page.locator('#projects-carousel .project-card').first();
    await expect(card.locator('.category-tag')).toBeVisible();
    await expect(card.locator('.status-pill')).toBeVisible();
    await expect(card.locator('.project-title')).toBeVisible();
    await expect(card.locator('.project-goal')).toBeVisible();
    await expect(card.locator('.tech-chip').first()).toBeVisible();
  });

  const scrollLeft = (page) =>
    page.evaluate(() => document.getElementById('projects-carousel').scrollLeft);

  test('next arrow scrolls the carousel right', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects-carousel .project-card');
    const before = await scrollLeft(page);
    await page.click('#carousel-next');
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(before + 50);
  });

  test('clicking a dot scrolls the carousel', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects-dots .dot');
    const before = await scrollLeft(page);
    await page.locator('#projects-dots .dot').nth(3).click();
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(before + 50);
  });

  test('prev arrow is disabled at the start, enabled after scrolling', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects-carousel .project-card');
    await expect(page.locator('#carousel-prev')).toBeDisabled();
    await page.click('#carousel-next');
    await expect(page.locator('#carousel-prev')).toBeEnabled();
  });
});
