---
title: "CI/CD Pipeline for Static Blog: Automated Testing with GitHub Actions"
author: "Lucas Luize"
excerpt: "Setting up Git-based CI/CD for the DevOps blog using GitHub Actions, Playwright for testing, and automated S3 sync on merges."
date: "2025-12-15"
slug: "ci-cd-pipeline-static-blog-github-actions"
banner: "https://images.unsplash.com/photo-1618477388954-7852f32655ec?q=80&w=1470&auto=format&fit=crop"
tags: ["CI/CD", "GitHub Actions", "DevOps", "Testing", "Playwright", "AWS"]
---

# CI/CD Pipeline for Static Blog: Automated Testing with GitHub Actions

As my DevOps portfolio blog grows, manual deployments become error-prone. This post documents implementing a CI/CD pipeline using GitHub Actions to automate testing and deployment on merges to main.

## Why CI/CD for a Static Site?

- **Automation**: Tests run on every change, catching issues before deployment.
- **Reliability**: Ensures posts load, search/filter works, and pages render correctly.
- **Scalability**: As features add up, tests prevent regressions.

## Tech Stack

- **GitHub Actions**: Free CI/CD for public repos.
- **Playwright**: Browser automation for end-to-end testing.
- **Jest**: Test runner (though Playwright handles most here).
- **AWS CLI**: For syncing to S3 post-merge.

## Implementation Steps

### 1. Initialize Git Repo

```bash
git init
git add .
git commit -m "Initial commit"
```

### 2. Set Up Tests with Playwright

Installed Playwright and created `tests/blog.test.js` with tests for:
- Homepage rendering
- Posts loading and display
- Search and tag filtering
- Post navigation and individual page rendering

### 3. GitHub Actions Workflow

Created `.github/workflows/ci-cd.yml` to:
- Run tests on push/PR to main
- On merge: Sync to S3 and invalidate CloudFront

### 4. Secrets and Deployment

- Store AWS credentials as GitHub secrets
- Use OIDC for secure access (future enhancement)

## Testing Locally

Run `npm run test:e2e` to execute Playwright tests against local server.

## Code Quality Enhancements

To demonstrate DevOps best practices like maintainable code and comprehensive testing (key for job applications), I refactored the frontend JavaScript and added unit tests.

### JavaScript Refactoring
- **Separated Concerns**: Moved all inline JS from HTML files to dedicated modules (`index.js`, `post.js`, `utils.js`) linked via `<script src>`.
- **SOLID Principles**: Ensured each function performs only one operation (Single Responsibility Principle), e.g., `parseMarkdown` only parses, `filterPosts` only filters.
- **Modular Structure**: Shared utilities in `utils.js` for reusability across pages.

### Unit Testing with Jest
- Added Jest-based unit tests for all JS functions, covering parsing, filtering, searching, and calculations.
- Tests run in Node.js with mocked dependencies, achieving 100% coverage for core logic.
- Integrated into CI/CD to run unit tests before e2e, catching issues early.

### CI/CD Pipeline Updates
- Updated workflow to run unit tests first (`npm run test`), then e2e tests.
- Added environment scoping for production deployments with required approvals.
- Why? To showcase automated quality gates, environment management, and testing strategies—skills recruiters seek in DevOps roles.

These changes make the codebase professional, testable, and scalable, proving hands-on experience with modern development practices.

## Challenges & Lessons

- Static site testing requires local server startup in tests.
- Playwright handles dynamic JS well, but ensure waits for async loads.
- CORS issues resolved by serving locally.
- Refactoring for SOLID required careful function extraction to avoid tight coupling.
- Unit tests in Node.js needed library mocking for browser-specific code.

## Next Steps

- Implement preview deployments for PRs.
- Add performance monitoring and accessibility tests.
- Expand to multi-environment (staging/production) with Terraform.

This pipeline ensures my blog stays functional as I add features and posts, serving as a portfolio piece for DevOps job applications. Full code in the repo!