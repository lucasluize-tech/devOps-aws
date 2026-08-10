module.exports = {
  testDir: 'tests/e2e',
  testMatch: '**/*.test.js',
  use: {
    baseURL: 'http://localhost:8000',
  },
  webServer: {
    // Build fresh into dist/ then serve it, so e2e always hits the terminal UI.
    command: 'npm run build && python3 -m http.server 8000 --directory dist',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
};
