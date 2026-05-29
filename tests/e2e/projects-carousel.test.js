const { test, expect } = require('@playwright/test');
const { exec, execSync } = require('child_process');
const path = require('path');

test.describe('Projects carousel', () => {
  let server;

  test.beforeAll(async () => {
    try { execSync('pkill -f "python3 -m http.server 8000" || true'); } catch (e) {}
    const projectRoot = path.join(__dirname, '..', '..');
    server = exec('python3 -m http.server 8000', { cwd: projectRoot });
    await new Promise((resolve) => setTimeout(resolve, 4000));
  });

  test.afterAll(() => { if (server) server.kill(); });

  test('renders 6 project cards', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    const cards = page.locator('#projects-carousel .project-card');
    await expect(cards).toHaveCount(6);
  });

  test('each card is a clickable anchor with /project.html?slug=... href', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    const firstCard = page.locator('#projects-carousel .project-card').first();
    await expect(firstCard).toHaveAttribute('href', /\/project\.html\?slug=.+/);
  });

  test('clicking a card navigates to detail page', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    await page.locator('#projects-carousel .project-card').first().click();
    await page.waitForURL(/project\.html\?slug=.+/);
    await expect(page.locator('.project-title')).toBeVisible();
  });

  test('renders 6 pagination dots with first active', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-dots .dot');
    const dots = page.locator('#projects-dots .dot');
    await expect(dots).toHaveCount(6);
    await expect(dots.nth(0)).toHaveClass(/active/);
  });

  test('each card renders category tag, status pill, title, goal, tech chips', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    const card = page.locator('#projects-carousel .project-card').first();
    await expect(card.locator('.category-tag')).toBeVisible();
    await expect(card.locator('.status-pill')).toBeVisible();
    await expect(card.locator('.project-title')).toBeVisible();
    await expect(card.locator('.project-goal')).toBeVisible();
    await expect(card.locator('.tech-chip').first()).toBeVisible();
  });
});
