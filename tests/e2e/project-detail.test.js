const { test, expect } = require('@playwright/test');

test.describe('Project detail page', () => {
  test('renders title, goal, pills, tech list, and action buttons for a public project', async ({ page }) => {
    await page.goto('/project.html?slug=todo-cli-tool');
    await expect(page.locator('.project-title')).toContainText('todo-cli-tool');
    await expect(page.locator('.project-goal')).toContainText('Project-aware');
    await expect(page.locator('.project-pills .category-tag')).toContainText('Dev Tools');
    await expect(page.locator('.project-pills .status-pill')).toContainText('published');
    await expect(page.locator('.project-tech .tech-list')).toContainText('Python');
    await expect(page.locator('.project-actions a').first()).toHaveAttribute('href', /github\.com/);
  });

  test('hides action buttons and shows muted note for private project', async ({ page }) => {
    await page.goto('/project.html?slug=agentic-engagement-specialist');
    await expect(page.locator('.project-actions a')).toHaveCount(0);
    await expect(page.locator('.project-actions .muted')).toContainText(/private repo/i);
  });

  test('hides action buttons and shows internal note for internal project', async ({ page }) => {
    await page.goto('/project.html?slug=proxmox-ha-infrastructure');
    await expect(page.locator('.project-actions a')).toHaveCount(0);
    await expect(page.locator('.project-actions .muted')).toContainText(/internal/i);
  });

  test('renders body sections from markdown', async ({ page }) => {
    await page.goto('/project.html?slug=todo-cli-tool');
    const content = page.locator('.project-content');
    await expect(content.locator('h2', { hasText: 'Why' })).toBeVisible();
    await expect(content.locator('h2', { hasText: 'Architecture' })).toBeVisible();
    await expect(content.locator('h2', { hasText: 'CIA' })).toBeVisible();
  });

  test('handles invalid slug gracefully', async ({ page }) => {
    await page.goto('/project.html?slug=does-not-exist');
    await expect(page.locator('.project-title')).toContainText(/Error|not found/);
  });
});
