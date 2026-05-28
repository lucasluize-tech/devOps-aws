# Skills + Projects Redesign — Design Spec

**Date:** 2026-05-28
**Status:** Approved by user
**Scope:** Replace the stale Skills section and fake Projects section on the homepage with reality-aligned content, introduce a per-project static-rendered detail page system, and apply CI/CD optimizations encountered during the audit.

---

## 1. Goals

- **Skills section** — replace the 3 aspirational cards with 4 cards reflecting the categories Lucas actually works in (per master-resume and profile).
- **Projects section** — replace the 3 fake project cards with 6 real projects in a horizontal scroll-snap carousel. Each card is clickable and routes to a per-project detail page.
- **Detail pages** — new `project.html?slug=...` system mirroring the existing post system. Authored as markdown with rich YAML front-matter, rendered client-side. Supports screenshots, structured sections (Why / Architecture / CIA), and graceful handling of private repositories.
- **TDD** — tests written before implementation for all new code paths.
- **CI/CD optimization** — apply low-risk improvements found during workflow audit.
- **No new build tools, frameworks, or runtime deps.** The site remains vanilla HTML/CSS/JS for S3 static hosting.

### Non-goals

- Formal standalone design-system document (existing `:root` tokens + CLAUDE.md already serve as one).
- Security mitigations (deferred per user direction; documented as known surface in §7).
- Screenshot content (user provides later; design handles empty state).
- Visual regression testing.
- CSP headers, SRI on CDN scripts, Disqus replacement — all cross-cutting concerns for separate work.

---

## 2. Information Architecture

### File layout (additions)

```
project.html                                # detail page shell (mirrors post.html)
project.js                                  # detail page renderer
project.css                                 # detail page styles (mirrors post.css)

projects/                                   # NEW dir
  index.json                                # [{ slug: "..." }, ...] registry
  proxmox-ha-infrastructure.md
  it-wiki-cms.md
  devops-lucasluize-com.md
  magazine-tracker.md
  todo-cli-tool.md
  agentic-engagement-specialist.md
  images/
    <slug>/
      01-cover.png
      02-architecture.png
      ...

tests/unit/
  projects-parsing.test.js
  projects-index-consistency.test.js
  projects-helpers.test.js
  project-body-split.test.js
  project-screenshots.test.js

tests/e2e/
  projects-carousel.test.js
  project-detail.test.js
  projects-accessibility.test.js

tests/fixtures/projects/                    # minimal .md fixtures
```

### URL pattern

- Card on homepage -> `/project.html?slug=<slug>`
- Mirrors existing `/post.html?slug=<slug>`. No pretty-URL routing required (S3 + CloudFront).

### Sort order

- Projects carousel renders sorted by front-matter `date` desc (most recently meaningful first). Same convention as posts.

---

## 3. Content Model

### Front-matter schema

YAML, parsed client-side by `gray-matter`. Required fields enforced by unit tests.

```yaml
title: "Proxmox HA Infrastructure"
slug: "proxmox-ha-infrastructure"
category: "Infra"                           # enum: Infra | Apps | Dev Tools | Other
status: "in production"                     # enum: in production | published | maintained | archived
tech_stack:                                 # array, surfaced on card + detail page
  - "Proxmox VE"
  - "Debian / LXC"
  - "keepalived (VIP)"
  - "Bash"
goal: "CIA-triad-compliant on-prem HA for EPL services"   # one-liner, recruiter-scannable
github: "https://github.com/lucasluize-tech/..."          # optional
demo: "https://devops.lucasluize.com"                     # optional
visibility: "public"                        # enum: public | private | internal
date: "2026-05-28"                          # YYYY-MM-DD, used for sort order
cover_image: "01-cover.png"                 # optional, relative to images/<slug>/
screenshots:                                # ordered, may be empty
  - { file: "02-architecture.png", caption: "VIP failover topology" }
  - { file: "03-dashboard.png", caption: "Weekly health report" }
```

### Required vs optional

- **Required:** `title`, `slug`, `category`, `status`, `goal`, `visibility`, `date`, `tech_stack` (may be empty array but key must exist).
- **Optional:** `github`, `demo`, `cover_image`, `screenshots` (defaults to empty array).

### Enum vocabularies

- `category` in { `Infra`, `Apps`, `Dev Tools`, `Other` }
- `status` in { `in production`, `published`, `maintained`, `archived` }
- `visibility` in { `public`, `private`, `internal` }

### Markdown body contract

The renderer expects the body to contain these H2 sections in this order:

```markdown
## Why
prose

## Architecture
prose (gallery is injected after this section's prose)

## CIA
prose

## Notes  (optional, free-form)
prose
```

- Missing sections do not crash the renderer; they simply don't render.
- Free content after `## Notes` renders as-is.

### Screenshot file conventions

- Files live in `projects/images/<slug>/`.
- Renderer prepends path automatically; the front-matter `file` field is just the basename.
- Allowed extensions: `.png .jpg .jpeg .webp .gif` (validated by renderer; invalid entries skipped with console warning).

---

## 4. Homepage UI

### Skills section — 4 cards

Same `.card` shell as today; rewritten content. Section header keeps `[active]` status label.

| Card | Bullet content (final wording at implementation) |
|---|---|
| **Cloud & Containers** | AWS (EC2, S3, Lambda, RDS, IAM, CloudFront, Route 53, VPC, ACM, OAC); Docker multi-stage + Compose; GitOps pull-from-main; container hardening |
| **Infrastructure & Networking** | Proxmox VE + LXC + keepalived; SonicWall TZ680 HA pair (VLANs, DHCP, zones); UniFi controller / APs / PoE; Tailscale (exit nodes, ACLs); Windows Server (AD/DC/DNS) |
| **Code & Automation** | Python (Pydantic v2, FastAPI, Typer); Bash; Node.js / Next.js; SQL (Postgres, SQLite); Cron / scripted reporting |
| **Testing & Quality** | pytest + hypothesis (property-based); Jest + Playwright (e2e); mypy strict, ruff; coverage gates; TDD discipline |

Grid: 4 columns at desktop breakpoint, falls back through 2-col -> 1-col on smaller widths.

### Projects section — 6 cards in scroll-snap carousel

#### Card anatomy

```
+---------------------------------+
|  [Infra]      [in production]   |  category tag (mono) + status pill (color-coded)
|                                 |
|  Proxmox HA Infrastructure      |  title (Bricolage Grotesque, bold)
|                                 |
|  CIA-triad-compliant on-prem    |  goal (1 line, body color)
|  HA for EPL services            |
|                                 |
|  +----++------++----------+     |
|  |Prox||Debian||keepalived|...  |  tech chips (JetBrains Mono, muted, small)
|  +----++------++----------+     |
|                                 |
|  view case study ->             |  affordance
+---------------------------------+
```

- The whole card is an `<a href="/project.html?slug=...">` — keyboard-tabbable.
- Hover: same `translateY(-4px)` + violet->orange border-left shift as existing `.card` (design system consistency).

#### Status pill colors (semantic)

| Status | Color token |
|---|---|
| `in production` | `--success` (green) |
| `published` | `--accent` (violet) |
| `maintained` | `--secondary` (orange) |
| `archived` | `--muted` (gray) |

#### Category tag

- JetBrains Mono, uppercase, low-contrast border. Matches existing `#skills h2::after` `[active]` aesthetic.

#### Carousel mechanics

- Container: `overflow-x: auto; scroll-snap-type: x mandatory;`. Native CSS, no JS scroll library.
- Track: flex row, gap `16px`. Each card has `scroll-snap-align: start`.
- Card width: `320px` on desktop, `min(85vw, 360px)` on mobile (peek-next pattern).
- Hidden scrollbar (visual cleanliness); native overflow preserved for keyboard arrow keys, trackpad, screen readers.
- Pagination dots below the carousel (existing `.dot` / `.dot.active` style). Driven by `IntersectionObserver` watching each card.
- No discrete arrow buttons — scroll-snap handles navigation natively.

#### Section header

`#projects h2::after` updates to a count-aware label (e.g. `[6 active]`).

#### Lineup (final 6)

1. Proxmox HA Infrastructure — `Infra` · `in production`
2. IT Wiki + CMS — `Infra` · `in production`
3. devops.lucasluize.com — `Infra` · `in production`
4. EPL Magazine Tracker — `Apps` · `in production`
5. todo-cli-tool — `Dev Tools` · `published`
6. Agentic Engagement Specialist — `Dev Tools` · `maintained`

### Accessibility

- `<section id="projects" aria-label="Featured projects">`.
- Carousel container: `role="region"` + `tabindex="0"` for keyboard scrollability.
- Cards are real `<a>`, not `<div onclick>`.
- Status pills carry semantic text content (screen readers can read "in production").

---

## 5. Detail Page UI (`project.html?slug=foo`)

### Layout

Single column, `max-width: 880px` (slightly wider than posts at 800px for screenshot breathing room). Same sticky header (`D9` brand), same footer.

### Anatomy (top to bottom)

```
Sticky header — "cd /projects" subtitle

[Infra]    [in production]            category + status pills
Proxmox HA Infrastructure             title (clamp 1.8–2.8rem)
CIA-triad-compliant on-prem HA…       goal (muted)

Tech: Proxmox · Debian · keepalived   inline tech list (mono, · separator)
      · Bash · CIFS · cron

[ GitHub -> ]  [ Live demo -> ]       action buttons (or muted note for private)

## Why                                rendered from markdown body
prose

## Architecture
prose + inline images allowed

[screenshot gallery here]             injected after Architecture prose

## CIA
prose

## Notes (optional)

<- back to all projects               links to /#projects
Comments (Disqus, project-<slug>)
Footer
```

### Action buttons by `visibility`

- `public` -> both `[GitHub]` and `[Live demo]` render if URLs present. External links get `target="_blank" rel="noopener noreferrer"`.
- `private` -> buttons hidden; muted line renders: `private repo — see case study below`.
- `internal` -> buttons hidden; muted line renders: `internal EPL deployment — case study below`.

### Tech stack

- Detail page renders tech as inline mono list (`Proxmox · Debian · keepalived · ...`), not chip pills. Chips are reserved for card-density contexts.

### Screenshot gallery

- Injected after the Architecture H2 section's prose.
- Fallback: if `## Architecture` is missing, gallery is injected after `## Why`. If both are missing, gallery renders at the top of the body content.
- Vertical stack of full-width images with captions below each.
- Each entry: `<figure>` + `<img loading="lazy">` + `<figcaption class="muted">`.
- Click -> opens full-size image in new tab. No custom lightbox.
- Empty state (`screenshots: []` or omitted): no gallery renders; architecture prose carries the page.

### Disqus

- Same embed as `post.html`.
- Identifier prefixed with `project-<slug>` so threads don't collide with post slugs.

### Omitted from detail pages

- Reading-time indicator (post-specific).
- Twitter/LinkedIn share buttons (people share blog posts, not portfolio entries).

### States

- `Loading...` while fetching, same shape as post page.
- Invalid slug -> error title + helpful message.
- Mobile -> same single-column behavior, images full-width, tech list wraps cleanly.

---

## 6. JS Architecture

### `utils.js` (extended, dual-export preserved)

New helpers, callable from both `index.js` and `project.js`:

- `renderTechChips(techArray, container, { variant: "card" | "detail" })` — DOM-built chips/list depending on context.
- `renderStatusPill(status, container)` — `<span>` with status-specific class. Maps `"in production"` -> `.status-production`, etc.
- `renderCategoryTag(category, container)` — `<span>` with mono styling.
- `renderActionButtons(project, container)` — handles `visibility` logic (public -> buttons; private/internal -> muted note).
- `parseMarkdown(md)` — already exists, reused unchanged.

### `index.js` (extended)

- `loadProjects()` — fetches `projects/index.json`, fetches each `.md`, parses front-matter, sorts by `date` desc. Mirrors `loadPosts()`.
- `renderProjectCarousel(projects, container)` — renders scroll-snap track + each `.project-card`.
- `attachCarouselDots(container)` — `IntersectionObserver` watches each card's intersection with the viewport, updates `.dot.active`. No JS scroll mutation.
- `initIndex()` — extended to call `loadProjects()` and `renderProjectCarousel()`. `Promise.all([loadPosts(), loadProjects()])` so posts/projects don't block each other.

### `project.js` (new)

- `initProject()` — reads `?slug=` from URL (same pattern as `post.js`).
- `loadProject(slug)` — fetches `projects/<slug>.md`, parses front-matter.
- `renderProject(data, content)` — populates the structured header (title, goal, pills, tech chips, action buttons), then renders markdown body. Splits body content by H2 to inject the screenshot gallery between Architecture and CIA.
- `renderScreenshotGallery(screenshots, slug, container)` — emits `<figure>` blocks with `loading="lazy"`. Validates file paths.
- Error handling for invalid slug, missing front-matter fields, missing screenshot files — surfaces user-readable messages.

### No new dependencies

- `marked` and `gray-matter` already loaded via CDN in `post.html`. Same scripts on `project.html`. No bundler, no module loader.

### Coupling

- `project.js` does not import `index.js`. Shared work lives in `utils.js`. Mirrors the existing post.js / index.js relationship.

---

## 7. Security — Informational (no mitigation work this PR)

Documented attack surface introduced by this change. **Per user direction, no mitigation work lands in this PR.** Surfaces noted here so the implementation plan and future hardening passes have a record.

| # | Surface | Notes |
|---|---|---|
| 1 | `marked.parse()` output -> `.innerHTML` for project markdown body | Same risk as existing posts. Author-controlled content. |
| 2 | Front-matter values interpolated into DOM | New helpers use `textContent` by convention but no enforcement layer. |
| 3 | `screenshots[].file` paths -> `<img src>` | No path validation in this PR. Trust author input. |
| 4 | Inline image URLs in markdown body | No URL allowlist in this PR. |
| 5 | External action-button links | `target="_blank"` will be paired with `rel="noopener noreferrer"` (single-line discipline, not infra). |
| 6 | Disqus on `project.html` | Same exposure as existing `post.html`. No new risk. |

### Pre-existing surface noted but not patched

- `index.js` uses `innerHTML` template-literal interpolation for post cards (lines 71–75). Real risk is low (author writes own posts) but the pattern is a known XSS shape. Out of scope per user direction.

### No secret-handling changes

No `.env` reads, no CI secret changes, no new auth surfaces.

---

## 8. Testing Strategy (TDD)

**Order:** tests before code, per task. Unit-first for helpers, then implementation, then e2e.

### Unit tests (Jest)

| File | Covers |
|---|---|
| `tests/unit/projects-parsing.test.js` | `loadProjects()` sort order; rejects malformed front-matter; required fields enforced; enum validation (`status`, `category`, `visibility`). |
| `tests/unit/projects-index-consistency.test.js` | Every `.md` in `projects/` is in `index.json`; every slug in `index.json` has a `.md`; front-matter `slug` matches filename. Mirrors `posts-index-consistency`. |
| `tests/unit/projects-helpers.test.js` | `renderTechChips`, `renderStatusPill`, `renderCategoryTag`, `renderActionButtons` — pure DOM output. Status-pill color class mapping. Private-repo branch hides buttons. Empty `tech_stack` doesn't render container. |
| `tests/unit/project-body-split.test.js` | Markdown body split-by-H2 correctly identifies sections; gallery injection lands after Architecture prose; missing sections degrade gracefully. |
| `tests/unit/project-screenshots.test.js` | `renderScreenshotGallery` emits `<figure>` with `loading="lazy"`; empty array renders nothing; missing `caption` doesn't break rendering. |

### E2E tests (Playwright)

| File | Covers |
|---|---|
| `tests/e2e/projects-carousel.test.js` | Carousel renders 6 cards; cards keyboard-tabbable; clicking navigates to `/project.html?slug=...`; pagination dots reflect scroll position; first dot active on load. |
| `tests/e2e/project-detail.test.js` | Detail page loads with valid slug; title + goal + pills + tech chips + action buttons render; invalid slug shows error state; private-repo project hides GitHub button and shows muted note; gallery renders when screenshots present, absent gracefully when not. |
| `tests/e2e/projects-accessibility.test.js` | Carousel has `role="region"` + `tabindex="0"`; cards are `<a>`; status pills have semantic text; images have meaningful alt text from caption. |

### Critical selectors (to register in CLAUDE.md after merge)

- `#projects-carousel`
- `.project-card`
- `.project-card .category-tag`
- `.project-card .status-pill`
- `.project-card .tech-chips`
- `.project-card .project-title`
- `.project-card .project-goal`
- `#project-article`
- `.project-header`
- `.project-screenshots`
- `.project-screenshots figure`
- `.project-action-buttons`

### Fixtures

- `tests/fixtures/projects/` — minimal valid `.md` fixtures (one per `visibility`, one per `status`).

### Not in scope

- Visual regression / screenshot diffing. Overkill for personal portfolio; ui-ux-pro-max polish iteration would constantly invalidate baselines.

---

## 9. CI/CD Changes

Applied to `.github/workflows/ci-cd.yml` as part of this PR.

### In-PR optimizations

| # | Change | Rationale |
|---|---|---|
| A | `cache: 'npm'` on `actions/setup-node@v4` | ~30s saved per run after first run |
| B | Cache Playwright browsers via `actions/cache@v4`, key includes `package-lock.json` hash | Saves ~2-3 min per run; browser download is the slowest single step |
| C | Upgrade Node 18 -> Node 20 | Node 18 LTS EOL Oct 2025; current LTS hygiene |
| D | `concurrency: { group: deploy-master, cancel-in-progress: false }` on deploy job | Prevents back-to-back pushes from racing into parallel `aws s3 sync --delete` deploys |
| E | Add `docs/*` and `skills-lock.json` to S3 sync exclude list | Correctness fix — prevents spec docs from syncing to the public CDN |
| F | Upload Playwright report + test-results as artifact on `if: failure()` | Debug failed e2e runs without re-running locally |
| G | `timeout-minutes: 15` on both jobs | Fail-fast on hangs; default 6h is wasteful |

### Diff sketch

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'                       # C
    cache: 'npm'                             # A

- uses: actions/cache@v4                     # B
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: pw-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

- name: Install Playwright
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps

timeout-minutes: 15                          # G (each job)

- uses: actions/upload-artifact@v4           # F
  if: failure()
  with:
    name: playwright-report
    path: |
      playwright-report/
      test-results/
    retention-days: 14

# deploy job
concurrency:                                 # D
  group: deploy-master
  cancel-in-progress: false

# s3 sync exclude list extended                E
aws s3 sync . s3://... --delete \
  --exclude "node_modules/*" --exclude ".git/*" --exclude ".github/*" \
  --exclude "tests/*" --exclude "docs/*" \
  --exclude ".gitignore" --exclude "package.json" --exclude "package-lock.json" \
  --exclude "skills-lock.json"
```

### Deferred (not this PR)

- Split unit + e2e into parallel jobs.
- S3 sync exclude -> include allowlist.
- Path-based deploy skipping (`paths-ignore`).
- Surgical CloudFront invalidation.

---

## 10. Migration Plan

### Files added

```
project.html
project.js
project.css
projects/index.json
projects/proxmox-ha-infrastructure.md
projects/it-wiki-cms.md
projects/devops-lucasluize-com.md
projects/magazine-tracker.md
projects/todo-cli-tool.md
projects/agentic-engagement-specialist.md
projects/images/.gitkeep
tests/unit/projects-parsing.test.js
tests/unit/projects-index-consistency.test.js
tests/unit/projects-helpers.test.js
tests/unit/project-body-split.test.js
tests/unit/project-screenshots.test.js
tests/e2e/projects-carousel.test.js
tests/e2e/project-detail.test.js
tests/e2e/projects-accessibility.test.js
tests/fixtures/projects/
docs/superpowers/specs/2026-05-28-skills-projects-redesign-design.md
```

### Files modified

- `index.html` — rewrite `#skills` (3 -> 4 cards, real content); rewrite `#projects` (3 fake cards -> carousel container rendered by JS).
- `index.js` — add `loadProjects()`, `renderProjectCarousel()`, `attachCarouselDots()`; extend `initIndex()`. Existing posts logic untouched.
- `utils.js` — add the four render helpers. Dual-export preserved.
- `styles.css` — add `.projects-carousel`, `.project-card`, `.category-tag`, `.status-pill` (+ color variants), `.tech-chip`; update `#skills` grid; update `#projects h2::after` label.
- `.github/workflows/ci-cd.yml` — apply A-G from §9.
- `CLAUDE.md` — extend critical-selectors list.

### Files removed

- None.

### Order of work

1. Add fixtures + write failing unit tests for parsing + index consistency.
2. Author the 6 project `.md` files + registry. Run unit tests to green.
3. Write failing unit tests for the new render helpers.
4. Implement helpers in `utils.js`. Run to green.
5. Write failing e2e tests for carousel + detail page + accessibility.
6. Implement `project.html` + `project.js` + `project.css`; implement carousel rendering in `index.js`; update `index.html` (skills + projects sections); update `styles.css`.
7. **Invoke `ui-ux-pro-max:ui-ux-pro-max`** to polish the visual layer — card spacing, status-pill treatment, hover micro-interactions, screenshot gallery details, animations.
8. Run all tests to green. Fix any regressions in existing tests caused by section markup changes.
9. Apply CI/CD changes from §9.
10. Update `CLAUDE.md` with new critical selectors.

### Rollback

- Each step is a separate commit. `git revert <sha>` per step.
- Change is additive at the file level; no deletions of existing content patterns.
- Reverting the `index.html` skills + projects sections restores the homepage exactly.
- Detail-page URL is new; no inbound links to break.

---

## 11. Out of Scope (Explicit)

- Screenshots themselves (user provides later; design handles empty state).
- Security mitigations (per user direction; surfaces documented in §7).
- Deferred CI/CD items from §9.
- Standalone design-system document.
- Job Search Automation project as a 7th card (parked; can be added later by appending to `projects/index.json` + `.md`).
- CSP, SRI, Disqus replacement, visual regression testing.

---

## 12. References

- Source-of-truth for skill + project content: `~/projects/job-search/docs/profile.md`, `~/projects/job-search/docs/master-resume.md`.
- Existing patterns referenced: `post.html`, `post.js`, `post.css`, `index.js` (posts logic), `utils.js`, `tests/unit/posts-index-consistency.test.js`.
- Design tokens: `styles.css :root`.
- Project conventions: `CLAUDE.md`.
