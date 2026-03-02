---
title: "The Post That Vanished: Fixing Blog Index Drift with CI Guardrails"
author: "Lucas Luize"
excerpt: "I shipped a new post, saw a green deploy, and still couldn't find it on the homepage. Here is how I tracked down index drift, added automated checks, and turned a frustrating bug into a reliability win."
date: "2026-03-02"
slug: "post-index-drift-ci-guardrail"
banner: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1470&auto=format&fit=crop"
tags: ["DevOps", "CI/CD", "GitHub Actions", "Testing", "Reliability", "AWS"]
---

# The Post That Vanished: Fixing Blog Index Drift with CI Guardrails

I hit a classic DevOps pain point this week: everything looked green, but production behavior said otherwise.

I pushed a new markdown post, CI passed, deployment ran, CloudFront invalidation started... and the post still did not show on the homepage.

## What Actually Broke

My frontend reads `posts/index.json` first, then fetches each post by slug.

That means a markdown file can exist in `posts/`, be deployed correctly, and still never render if its slug is missing from `index.json`.

So this was not a CDN issue or a UI bug. It was index drift.

## Why It Took Longer Than It Should

- The pipeline was green, so I trusted deploy.
- Invalidation was running, so I suspected caching.
- Sorting logic was correct, so the UI looked innocent.

The system looked healthy at every high-level checkpoint, but one content contract was broken.

## The Fix

I added a unit test that enforces two rules:

1. Every markdown post must have a `slug` present in `posts/index.json`.
2. Every slug in `posts/index.json` must map to a real markdown post.

Now CI fails fast if either side drifts.

I also updated the workflow sequence to keep the gates explicit:

1. Unit tests
2. E2E tests
3. Deploy on push to `master`

## Lessons Learned

### Green does not mean safe

A green pipeline only proves what you asked it to verify.

### Data contracts need tests

Not all production bugs come from application code. Sometimes the risk lives in metadata, manifests, or indexes.

### Remove memory from release steps

If a release depends on "remembering one extra manual update," it will eventually fail.

### Guardrails beat hero debugging

The best reliability improvements are boring, automatic checks that block bad deploys early.

## Closing

This bug was frustrating, but useful. The platform is now stricter, safer, and easier to trust.

If I forget to register a slug, CI catches it before users do. Exactly the kind of failure mode I want: fast, clear, and recoverable.
