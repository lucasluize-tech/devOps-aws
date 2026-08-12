module.exports = {
  testDir: 'tests/e2e',
  testMatch: '**/*.test.js',
  // One worker: this suite runs on a shared dev box (load avg can sit >10 with
  // other sessions running). Parallel workers starve the axe scans + CPU-
  // throttled perf tests into 30s+ timeouts. Serial is ~1min and deterministic.
  workers: 1,
  // Headroom for axe on shiki-dense reader DOMs under host load (slow != broken).
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:8000',
  },
  webServer: {
    // Build fresh into dist/ then serve it, so e2e always hits the terminal UI.
    // `exec` so the python server replaces the shell and actually dies with the
    // run - otherwise it orphans, and the next run reuses it serving STALE dist.
    command: 'npm run build && exec python3 -m http.server 8000 --directory dist',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
};
