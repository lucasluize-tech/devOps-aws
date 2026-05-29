---
title: "EPL Magazine Tracker"
slug: "magazine-tracker"
category: "Apps"
status: "in production"
goal: "Internal full-stack app for tracking periodical subscriptions across all branches"
visibility: "internal"
date: "2026-03-30"
tech_stack:
  - "Next.js 16 (App Router)"
  - "TypeScript (strict)"
  - "SQLite + Prisma 7"
  - "Tailwind CSS + shadcn/ui"
  - "Docker Compose"
  - "JWT (jose + bcrypt)"
  - "Zod"
  - "Winston"
  - "ExcelJS"
screenshots: []
---

## Why

Edison Public Library tracked magazine subscriptions in per-branch spreadsheets. Multiple vendors with different subscription periods (EBSCO is June–May; calendar-year vendors are Jan–Dec). Reports were manual, transfers between branches were untracked, and circulation staff couldn't tell whether a magazine was overdue, expected, or never going to arrive.

I built a single unified system with role-based access, vendor-aware period handling, inter-branch transfers, and admin reports with .xlsx export.

## Architecture

Next.js 16 App Router with TypeScript strict mode end to end. SQLite + Prisma 7 — small enough that Postgres would be over-engineering, but with proper migrations. JWT auth via `jose` + bcrypt password hashing. Role-based access control (staff vs admin). Zod for runtime input validation at every API boundary. Winston structured logging with a full audit trail.

Two parallel subscription period systems: EBSCO (June–May) and calendar-year (January–December) both run simultaneously with auto-deactivation when their period ends. Multi-period dashboard with per-period progress bars and period-aware status: completed, overdue, expected this week, upcoming, never received, not subscribed.

Inter-branch transfer lifecycle (pending / completed / cancelled). Admin reports filterable by period, branch, and magazine, with `.xlsx` export via ExcelJS. "Same as" period creation with conflict detection to make rollover painless.

Deployment: Docker Compose on the EPL internal LAN. Container health check with auto-restart. Safe DB migration script that backs up SQLite and tests the migration on a copy before applying to prod.

## CIA

- **Confidentiality:** JWT-gated, RBAC at the row level for admin-only reports. Internal LAN only.
- **Integrity:** Zod validates every input. Winston audit log captures every meaningful action. Migration script is back-then-test-then-apply.
- **Availability:** Docker container health check + auto-restart. SQLite backups before every migration. Hosted on the Proxmox HA stack.
