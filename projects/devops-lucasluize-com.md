---
title: "devops.lucasluize.com"
slug: "devops-lucasluize-com"
category: "Infra"
status: "in production"
goal: "Static-hosted DevOps blog and portfolio on private S3 behind CloudFront with HTTPS"
visibility: "public"
date: "2026-05-28"
github: "https://github.com/lucasluize-tech/s3-bucket-landing"
demo: "https://devops.lucasluize.com"
tech_stack:
  - "AWS S3"
  - "CloudFront"
  - "ACM"
  - "Origin Access Control"
  - "Route 53"
  - "GitHub Actions"
  - "Jest"
  - "Playwright"
screenshots: []
---

## Why

I needed a personal site that demonstrates the same patterns I use professionally: private origin, CDN-fronted, automated test gates, idempotent deploy. Off-the-shelf platforms (Vercel, Netlify) abstract away the parts that I actually want to show recruiters I can do.

## Architecture

Static HTML/CSS/JS with markdown blog posts parsed client-side (marked + gray-matter). No build step, no framework — intentional for S3 static hosting and for showing that "vanilla" is still a viable architecture when scope is bounded.

Origin: private S3 bucket. Distribution: CloudFront with Origin Access Control so the bucket is never publicly readable. TLS via ACM certificate. Custom 403/404 error responses patched on the distribution via idempotent AWS-CLI scripts that diff and update only when the ETag has drifted.

CI/CD: GitHub Actions runs Jest unit tests and Playwright e2e tests on every push to `master`. Deploy step syncs to S3, then issues a CloudFront invalidation. Deploy only fires from `master` push events; PRs run tests only.

## CIA

- **Confidentiality:** Not a security-critical site, but the S3 origin is private — bucket policy denies all public access, OAC is the only allowed reader.
- **Integrity:** Unit + e2e tests gate every deploy. Tagged commits, no force-push to master.
- **Availability:** CloudFront global CDN. S3 11-nines durability. Static site has no runtime dependencies that can fail.

## Notes

The carousel + project detail page system you're reading this on was built using the same TDD + spec-driven workflow as the rest of the repo. Spec and plan documents are in `docs/superpowers/`.
