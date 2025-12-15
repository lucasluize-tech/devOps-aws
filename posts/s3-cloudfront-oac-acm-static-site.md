---
title: "From Static S3 to CDN with HTTPS: My First DevOps Project on AWS"
author: "Lucas Luize"
excerpt: "How I built a secure static site on S3 behind CloudFront using OAC and ACM—plus lessons learned, costs, and next steps."
date: "2025-10-28"
slug: "s3-cloudfront-oac-acm-static-site"
banner: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?q=80&w=1470&auto=format&fit=crop"
tags: ["AWS", "DevOps", "CloudFront", "S3", "ACM", "OAC", "Infrastructure"]
---

# From Static S3 to CDN with HTTPS: My First DevOps Project on AWS

I just finished a foundational DevOps project: hosting a static landing page on S3 and securing it behind CloudFront with HTTPS using ACM, while keeping the S3 bucket private via an Origin Access Control (OAC). This post captures the why, the how, the gotchas, and what I’ll do next.

## TL;DR

- S3 hosts static content (HTML/CSS/JS), not servers or databases.
- CloudFront provides HTTPS, caching, global performance, and security headers.
- OAC locks S3 so only CloudFront can read it—no public S3 access.
- ACM (in us-east-1) issues the TLS certificate for my custom domain.
- DNS (Squarespace → later Route 53) points my subdomain to CloudFront.

## Architecture Overview

- User → CloudFront (HTTPS) → S3 (private via OAC)
- DNS (CNAME) → CloudFront distribution domain
- ACM certificate (us-east-1) attached to CloudFront for TLS
- Optional: Custom 404 page, security headers, and cache policies

Why this design:
- Security-by-default: Block public access to S3; CloudFront reads with signed requests.
- Performance: Edge caching + compression reduces latency and egress.
- Simplicity: Perfect for a landing page/SPA with minimal ops overhead.

## Step-by-Step Build

1) Create/prepare S3 bucket (private)
- Enabled Bucket Owner Enforced (disables ACLs)
- Kept “Block public access” ON
- No public bucket policy

2) Build landing page
- Single-page responsive HTML with minimal CSS
- Later: version assets (e.g., app.abc123.css) for cache-busting

3) CloudFront distribution
- Origin: S3 REST endpoint (not website endpoint) + OAC (SigV4)
- Default root object: index.html
- Viewer protocol: redirect HTTP → HTTPS
- Cache policy: CachingOptimized
- Optional: Response headers policy (HSTS, CSP, etc.)

4) TLS with ACM (us-east-1)
- Requested certificate for devops.lucasluize.com
- Validated via CNAME
- Attached to CloudFront

5) DNS
- CNAME devops.lucasluize.com → dXXXX.cloudfront.net (Squarespace DNS)
- After propagation, HTTPS works end-to-end

## Common Pitfalls I Hit (and Fixed)

- 403 on S3 Website: Needed a proper bucket policy for that mode. But with OAC, I switched to the S3 REST origin and locked the bucket down.
- ACM validation “Host value can’t end with a .”: Removed trailing dot in CNAME value when using external DNS UI.
- Wrong origin type with OAC: OAC only works with S3 REST endpoint, not website endpoint.

## Costs and Free-Tier Notes

- S3: Pennies for a few GB and requests.
- CloudFront: Often within free tier early on; later ~$0.085–0.12/GB egress depending on region.
- ACM: Free public certs.
- DNS: With Squarespace, domain fees; with Route 53, ~$0.50/hosted zone per month.
- Budgets: I created a $5 monthly alert to be safe.

At small traffic (<1k users), costs are typically $1–$5/month.

## What I Learned

- S3 is object storage—not compute. Perfect for static websites and assets.
- CloudFront + OAC is the secure, modern pattern to serve private S3 content publicly.
- Certificates for CloudFront must be in us-east-1.
- DNS validation can be done outside AWS; just paste ACM’s exact CNAME.

## What’s Next

- Add security headers via a CloudFront Response Headers Policy.
- Add a 404.html and friendly error mapping.
- Automate deploys with GitHub Actions (sync S3 + CloudFront invalidation).
- Migrate DNS to Route 53 so Terraform can manage cert validation and CNAMEs.
- Start a second project: API (API Gateway + Lambda) + SPA on this frontend.

## Useful Commands

```bash
# Upload site
aws s3 sync ./site s3://YOUR_BUCKET/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"

# Verify identity for your current CLI profile
aws sts get-caller-identity