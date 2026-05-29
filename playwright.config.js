module.exports = {
  testDir: 'tests/e2e',
  testMatch: '**/*.test.js',
  use: {
    baseURL: 'http://localhost:8000',
  },
  webServer: {
    command: 'python3 -m http.server 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
};
