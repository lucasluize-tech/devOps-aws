// Performance budgets: same-origin JS+CSS weight, LCP under CPU throttling,
// and near-zero CLS while the MOTD types.
const { test, expect } = require('@playwright/test');

// Raw (uncompressed) budget: the app grew deliberately in the 2026-08 polish
// wave (resize.js dividers, tour, giscus loader, expanded terminal/reader CSS)
// to ~88KB raw / ~28KB gzipped - prod serves compressed via CloudFront. Still
// zero frameworks. Raise consciously, never casually.
test('same-origin JS+CSS weight <= 110KB raw', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForLoadState('networkidle');
  const bytes = await page.evaluate(() => {
    const origin = location.origin;
    return performance.getEntriesByType('resource')
      .filter((r) => {
        if (!r.name.startsWith(origin)) return false;
        const path = new URL(r.name).pathname;
        return /\.(js|css)$/.test(path);
      })
      .reduce((sum, r) => sum + (r.encodedBodySize || 0), 0);
  });
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThanOrEqual(110 * 1024);
});

test('LCP < 2500ms with 4x CPU throttling', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/index.html');
  const lcp = await page.evaluate(() => new Promise((resolve) => {
    let value = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) value = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => resolve(value), 1500);
  }));
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThan(2500);
});

test('MOTD typing causes near-zero layout shift', async ({ page }) => {
  await page.goto('/index.html');
  const cls = await page.evaluate(() => new Promise((resolve) => {
    let total = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => resolve(total), 1600); // let the MOTD finish typing
  }));
  expect(cls).toBeLessThan(0.02);
});
