---
title: "Building a Portable DevOps Workstation: Dotfiles, Bootstrap, and CI Guardrails"
author: "Lucas Luize"
excerpt: "How I built a portable shell/editor/cloud environment with one bootstrap script, profile-based packages, and CI checks to reduce setup time and configuration drift."
date: "2026-02-27"
slug: "portable-devops-workstation-dotfiles-bootstrap"
banner: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?q=80&w=1470&auto=format&fit=crop"
tags: ["DevOps", "Dotfiles", "Automation", "CI/CD", "Linux", "macOS", "AWS"]
---

# Building a Portable DevOps Workstation: Dotfiles, Bootstrap, and CI Guardrails

One thing I keep learning as a Cloud/DevOps student: productivity is not only about knowing tools, it is about rebuilding your environment fast and safely.

I wanted a setup I could carry to any new machine (Linux or macOS) without repeating manual steps for zsh, Neovim, AWS CLI, plugins, fonts, and quality-of-life CLI tools. The result was a portable dotfiles project with a bootstrap script, profiles, and CI checks.

## Why I Built This

Before this project, each new machine meant:
- Reinstalling packages one by one
- Recreating shell aliases and plugins from memory
- Fixing "works on this laptop only" differences
- Spending hours troubleshooting instead of building

For someone targeting a DevOps role, that is a red flag. If I believe in automation for infrastructure, I should automate my own workstation too.

## Project Goal

Create a single source of truth for my development environment with:
- **One entrypoint**: `bootstrap.sh`
- **Cross-platform support**: Debian/Ubuntu, Fedora, Arch, macOS
- **Profile-based installs**: home vs work tooling
- **Safe defaults**: backups before symlinks, dry-run mode, doctor checks
- **Security guardrails**: checksum/signature verification and secret scanning hooks

## Implementation Overview

I refactored the bootstrap into modular scripts so each concern is clear:

- `bootstrap.sh`: flag parsing and orchestration
- `lib/common.sh`: globals, platform detection, shared helpers
- `lib/packages.sh`: package manager mapping and installation
- `lib/installers.sh`: AWS CLI, lazygit, OpenCode, Oh My Zsh, Nerd Font
- `lib/dotfiles.sh`: symlinks, backups, local templates, git hooks
- `lib/doctor.sh`: environment validation
- `lib/profiles.sh`: profile loading
- `profiles/work.sh`: Cloud/Network/DevOps package set

### Flags I Added

To avoid risky runs and reduce troubleshooting:
- `--dry-run` to preview commands only
- `--doctor` to validate environment health
- `--profile work` to install job-relevant tooling
- `--only-*` and `--skip-*` for partial installs

This made the script useful for both full provisioning and targeted updates.

## Security and Reliability Decisions

A private repo is still not a vault, so I treated secrets seriously.

What I implemented:
- Global/local `.gitignore` patterns for auth files and env files
- Local override files (`~/.zshrc.local`, `~/.gitconfig.local`) for sensitive or machine-specific values
- AWS CLI signature verification (PGP)
- Checksum validation for downloaded binaries/assets
- Pre-commit secret scanning hook with fallback regex checks

I also added GitHub Actions CI for:
- `bash -n` syntax checks
- `shellcheck`
- smoke tests on Ubuntu + macOS

Even on a private repo, Actions still works. It helped me catch issues quickly (especially linting and CI runner differences).

## Real Problems I Hit (and Fixed)

This project was a good reminder that automation scripts are software and need debugging like anything else.

- **ShellCheck false positives with sourced files**: fixed by using `shellcheck -x -P .` and tuning lint scope.
- **CI smoke test failures**: `--dry-run` + `--doctor` needed to be CI-friendly, so required checks were adjusted to avoid false failures on clean runners.
- **Tool naming drift** (`eza` vs `exa`): standardized package choices and aliases.
- **Path assumptions**: script became resilient whether run from cloned repo path or installed path.

## What I Learned

The biggest lesson: a good DevOps mindset applies to personal workflows too.

- **Idempotency matters**: rerunning bootstrap should be safe.
- **Observability matters**: clear logs and doctor checks reduce guesswork.
- **Portability matters**: package names and binaries differ across platforms.
- **Security-by-default matters**: don't rely on memory to avoid committing secrets.
- **Documentation matters**: if future me cannot understand it quickly, it is not done.

## Why This Helps My DevOps Journey

This project is not just "dotfiles." It demonstrates practical DevOps behavior:
- automation-first thinking
- cross-platform scripting
- CI quality gates
- security controls in developer workflow
- iterative debugging and improvement

As someone preparing for a DevOps role, this became a concrete portfolio piece showing how I design, test, harden, and document systems.

## Next Steps

Planned improvements:
- Add a quick function map with line references for faster troubleshooting
- Expand `work` profile with optional cloud-native tools based on repository availability
- Add more CI checks (smoke matrix by profile)
- Add bootstrap telemetry summary (what was installed/skipped and why)

This project started as "I want my setup mobile" and turned into a real exercise in automation, reliability, and secure defaults. Exactly the direction I want to keep following while I work toward my first DevOps role.
