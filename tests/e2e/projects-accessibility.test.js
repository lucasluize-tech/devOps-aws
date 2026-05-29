const { test, expect } = require('@playwright/test');
const { exec, execSync } = require('child_process');
const path = require('path');

test.describe('Projects accessibility', () => {
  let server;

  test.beforeAll(async () => {
    try { execSync('pkill -f "python3 -m http.server 8000" || true'); } catch (e) {}
    const projectRoot = path.join(__dirname, '..', '..');
    server = exec('python3 -m http.server 8000', { cwd: projectRoot });
    await new Promise((resolve) => setTimeout(resolve, 4000));
  });

  test.afterAll(() => { if (server) server.kill(); });

  test('carousel has role=region and tabindex=0', async ({ page }) => {
    await page.goto('http://localhost:8000');
    const carousel = page.locator('#projects-carousel');
    await expect(carousel).toHaveAttribute('role', 'region');
    await expect(carousel).toHaveAttribute('tabindex', '0');
  });

  test('section has accessible name', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await expect(page.locator('#projects')).toHaveAttribute('aria-label', /projects/i);
  });

  test('project cards are real anchors (not div onclick)', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    const cards = page.locator('#projects-carousel .project-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const tag = await cards.nth(i).evaluate((el) => el.tagName);
      expect(tag).toBe('A');
    }
  });

  test('status pills have semantic text content for screen readers', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .status-pill');
    const pill = page.locator('#projects-carousel .status-pill').first();
    const text = (await pill.textContent()).toLowerCase();
    expect(['in production', 'published', 'maintained', 'archived']).toContain(text.trim());
  });
});
