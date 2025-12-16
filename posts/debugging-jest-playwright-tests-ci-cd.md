---
title: "Debugging Jest and Playwright Tests: Lessons from CI/CD Pipeline Setup"
author: "Lucas Luize"
excerpt: "Troubleshooting e2e and unit tests in a static blog project—fixing server management, test isolation, and YAML parsing for reliable DevOps automation."
date: "2025-12-16"
slug: "debugging-jest-playwright-tests-ci-cd"
banner: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1470&auto=format&fit=crop"
tags: ["Testing", "Jest", "Playwright", "CI/CD", "Debugging", "DevOps"]
---

# Debugging Jest and Playwright Tests: Lessons from CI/CD Pipeline Setup

Setting up automated testing for my DevOps portfolio blog revealed common pitfalls in e2e and unit test frameworks. This post details the debugging process, fixes, and why robust testing matters for professional software delivery.

## The Challenge

After implementing Jest for unit tests and Playwright for e2e tests, local runs showed issues:
- Playwright tests failed with "Address already in use" on port 8000.
- Server processes persisted between test runs.
- Test isolation problems caused flaky results.
- YAML front-matter parsing failed silently in some environments.

These issues would break CI/CD reliability, so debugging was essential.

## Debugging Process

### 1. Identifying Root Causes
- **Server Lifecycle Issues**: Python HTTP server wasn't killed properly after tests, occupying port 8000.
- **Test Parallelization**: Playwright ran tests in parallel by default, leading to server conflicts.
- **Module Resolution**: Jest couldn't find shared utilities, requiring explicit imports.
- **Browser Timing**: E2e tests didn't wait for async JS loads, causing false negatives.

### 2. Implementing Fixes

#### Server Management
Added pre-start cleanup and forceful termination:
```javascript
// Kill existing servers
execSync('pkill -f "python3 -m http.server 8000" || true');

// Force kill on exit
process.on('exit', () => server?.kill('SIGKILL'));
test.afterAll(() => server?.kill('SIGKILL'));
```

#### Test Isolation
Configured Playwright for serial execution:
```javascript
test.describe.serial('Blog Tests', () => { /* tests */ });
```

#### Module Sharing
Created `utils.js` for common functions, with Node/browser compatibility:
```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseMarkdown, ... };
} else {
  window.parseMarkdown = parseMarkdown;
}
```

#### Async Handling
Increased server startup wait and added event listeners:
```javascript
server.on('close', (code) => console.log('Server exited:', code));
await new Promise(resolve => setTimeout(resolve, 5000));
```

## Results and Lessons

- **Local Tests**: All pass reliably, no port conflicts.
- **CI/CD Reliability**: Tests now run sequentially in GitHub Actions, preventing race conditions.
- **Maintainability**: Shared utilities reduce code duplication.
- **Debugging Tips**: Use console logs, event listeners, and serial execution for complex async setups.

## Why This Matters

In DevOps, testing ensures deployments don't break user experiences. These fixes prevent false positives in CI/CD, saving time and building confidence in automation. As my blog grows, this foundation supports scaling to more complex features.

Full code in the repo—happy testing!