---
title: "Proxmox HA Infrastructure"
slug: "proxmox-ha-infrastructure"
category: "Infra"
status: "in production"
goal: "CIA-triad-compliant on-prem HA for Edison Public Library services"
visibility: "internal"
date: "2026-05-21"
tech_stack:
  - "Proxmox VE"
  - "Debian / LXC"
  - "keepalived (VIP)"
  - "Bash"
  - "Postfix SMTP relay"
  - "CIFS/SMB"
  - "Tailscale"
  - "cron"
  - "vzdump"
screenshots: []
---

## Why

The library runs critical services — IT wiki, monitoring, asset management, magazine tracker — that staff and patrons depend on daily. The original setup was a single QNAP NAS doing compute and storage, with no failover, no documented recovery, and a single point of failure for everything containerized.

I rebuilt it as a 2-node Proxmox cluster with cold-standby HA, automated backups, dead-man's-switch alerting, and a 15-step disaster-recovery runbook. The goal: any single host can die without users noticing for more than a few minutes.

## Architecture

Two-node `epl-servers` cluster (`pve` + `pve2`) with virtual IP `10.101.16.86` managed by `keepalived` running inside an LXC container — not on the host — so failover is transparent to Docker workloads. 60-second failover delay, 300-second failback delay, singleton lock to prevent multiple instances.

Eight monitoring scripts on cron: HA watcher (1 min), VIP watcher (2 min), mount watcher (5 min), resource monitor (15 min), weekly health report, host-config backup, container data sync, automated HA self-test.

Backups: weekly `vzdump` of all containers (zstd compression, 4 generations) to QNAP NAS via CIFS, plus a host-config archive of `/etc/pve`, fstab, network interfaces, postfix config, scripts, and crontabs. Every backup is integrity-checked with `tar tzf` before being declared good.

Dead-man's-switch heartbeat: PVE writes a timestamp to QNAP every 5 minutes; QNAP-side script alerts via SMTP if the timestamp goes stale, detecting failure even when the host is fully unreachable.

Postfix SMTP relay through Google Workspace (no auth, IP-whitelisted) delivers all alerts plus a weekly summary.

## CIA

- **Confidentiality:** Tailscale-only ingress for management; no public-facing services. SMTP relay restricted by source IP. Backups encrypted in transit (CIFS over Tailscale).
- **Integrity:** `vzdump` archives integrity-checked post-backup. Dead-man's-switch detects silent failures. Resource monitor catches drift before it becomes corruption.
- **Availability:** keepalived VIP + LXC failover. Multiple monitoring scripts with overlapping observation windows. 15-step DR runbook so any team member can rebuild from cold metal.

## Notes

Phase 4 is currently in progress: adding a Debian QDevice container on QNAP Container Station for true 3-node quorum. The architectural review compared corosync + QDevice (Option A) against a script-based warm-standby (Option B) — chose A after analyzing split-brain risk, duplicate-IP exposure, and divergent SQLite/MariaDB write paths.
