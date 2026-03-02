---
title: "CI, Lint, and Debugging Lessons from My Dotfiles Bootstrap Project"
author: "Lucas Luize"
excerpt: "How I debugged ShellCheck failures, CI smoke test issues, and installer edge cases while hardening a cross-platform dotfiles bootstrap workflow."
date: "2026-02-28"
slug: "ci-lint-debugging-dotfiles-bootstrap"
banner: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1470&auto=format&fit=crop"
tags: ["CI/CD", "ShellCheck", "Debugging", "Dotfiles", "DevOps", "GitHub Actions"]
---

# CI, Lint, and Debugging Lessons from My Dotfiles Bootstrap Project

When I finished the first version of my dotfiles/bootstrap project, I had a choice:

- leave it as "works on my machine"
- or treat it like real DevOps code

I chose option 2.

So I added CI checks, linting, and a lot of debugging. This post is the simple version of what went wrong, what I fixed, and what I learned.

## Why This Matters for Me

As a Cloud/DevOps student trying to land my first DevOps role, this project is bigger than dotfiles. It shows I can:

- build automation with guardrails
- debug cross-platform issues
- improve reliability through CI feedback loops

## Quick Terms (No Jargon)

- **Linting**: a "code spell-check" that finds common mistakes and risky patterns before runtime.
- **ShellCheck**: a linter specifically for shell scripts (`.sh`).
- **CI (Continuous Integration)**: automatic checks that run in GitHub whenever I push code.

So basically: instead of hoping my script is fine, I let tools check it every time.

## What Broke First: ShellCheck in CI

My modular script structure (`bootstrap.sh` sourcing files from `lib/`) initially failed with:

- `SC1091` for sourced files not being followed
- `SC2034` for globals that looked unused when files were linted in isolation
- `SC2155` for inline local assignment style issues

### Fixes

- Ran ShellCheck with source following: `shellcheck -x -P .`
- Scoped `SC2034` suppression only where it made sense (profile/module globals)
- Refactored specific code patterns causing `SC2155`

Big lesson: linting one big file is easy. Linting modular scripts needs extra config so the linter understands where functions/variables come from.

## What Broke Next: Smoke Tests on GitHub Runners

My smoke test used:

- `bootstrap.sh --dry-run`
- `bootstrap.sh --doctor`

This failed in CI because GitHub runner machines are "fresh" and minimal. They often don't have `zsh`, `nvim`, or my symlinked dotfiles yet.

My doctor check was too strict for that environment.

### Fixes

- Kept only truly required checks strict (`git`, `curl`)
- Made editor/shell/link checks visible as warnings in doctor mode

Lesson: context matters. A CI runner is not the same as my personal workstation.

## Installer Edge Cases I Had to Debug

Two important install problems showed up during real use:

1. **AWS CLI signature verification failed** (`Failed importing AWS PGP key`)
   - What happened: the script tried to verify authenticity, but key import failed
   - Root cause: one bad character in the embedded key block
   - Fix: replaced with the exact key from AWS docs and re-tested import

2. **lazygit checksum lookup failed**
   - What happened: script downloaded file names that no longer matched current release naming
   - Root cause: expected `Linux_x86_64`, but releases now use lowercase (`linux_x86_64`)
   - Fix: updated naming logic and checksum matching

I also made installer steps more resilient: if one optional tool fails, bootstrap continues and still links core dotfiles.

## The Most Useful Outcome

The biggest win was not a single bug fix. It was the workflow:

- write automation
- run CI
- read exact failures
- patch safely
- rerun and verify

That loop is exactly how I want to work in DevOps: small changes, fast feedback, fewer surprises.

## Next Steps

- Add profile-specific smoke tests in CI (`home` and `work`)
- Add a bootstrap report summary (installed/skipped/failed with reasons)
- Continue reducing distro/package edge-case friction

This project has been one excelent learning exercises so far because it mixes scripting, reliability, security, and troubleshooting in one place.
