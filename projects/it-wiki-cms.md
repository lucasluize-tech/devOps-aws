---
title: "IT Wiki + CMS"
slug: "it-wiki-cms"
category: "Infra"
status: "in production"
goal: "78-doc internal knowledge base with browser-based editor, replacing zero documentation"
visibility: "internal"
date: "2026-04-29"
tech_stack:
  - "MkDocs Material"
  - "Python 3.13"
  - "Flask + Gunicorn"
  - "Nginx alpine"
  - "Docker Compose"
  - "Proxmox LXC"
  - "ruamel.yaml"
  - "filelock"
  - "mermaid"
screenshots: []
---

## Why

When I started at Edison Public Library there was no internal IT documentation. None. Every troubleshooting session started by reverse-engineering how things worked. New hires were dependent on tribal knowledge that only existed in my head.

I built an internal MkDocs Material wiki — but adding "use git to edit your docs" as a workflow for non-engineering staff was a non-starter. So I bolted a browser-based CMS on top: anyone can edit a page, upload an image, or reorganize the nav from a phone, with audit stamps and concurrent-save protection.

## Architecture

Two-container Docker Compose stack on Proxmox LXC (CT 100):

- **Editor:** Python 3.13 + Flask + Gunicorn, multi-stage Docker image. Uses `ruamel.yaml` for nav edits so comments and quoting are preserved through round-trips. `filelock` for concurrent-save protection so two editors don't clobber each other.
- **Static server:** Nginx alpine serving the rendered MkDocs Material site.

Production features: user auth with audit stamps, image upload with sanitization + extension whitelist, internal DNS A-record (`wiki.lan`), and a 30+ subsystem coverage area spanning Proxmox, firewall/VLANs, magazines app, printer-checker, AD/DC, DeepFreeze, vendors, and networking diagrams.

The GitOps sync (`auto-commit.sh`) is a `flock`-protected, idempotent, self-healing nightly script: pulls `origin/main`, commits in-place editor changes, pushes back. Mid-rebase auto-recovery handles the case where a manual edit landed during the cron window. A full failure-mode/recovery table lives in the wiki's own docs.

## CIA

- **Confidentiality:** Internal DNS only, no public ingress. Auth-gated CMS.
- **Integrity:** Audit stamps on every edit. `filelock` prevents concurrent-write corruption. Nightly git commit gives a per-edit changelog.
- **Availability:** Two-container split (editor + static) means an editor outage doesn't take down the wiki for readers. LXC is on the Proxmox HA stack — failover-capable.

## Notes

Restructured the wiki taxonomy mid-2026 from a category-based layout to a system/service-based layout — discoverability for new hires improved noticeably during the next onboarding cycle.
