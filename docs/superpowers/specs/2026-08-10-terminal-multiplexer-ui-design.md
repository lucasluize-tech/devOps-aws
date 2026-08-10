# Terminal Multiplexer UI - Design Spec

Date: 2026-08-10
Status: Approved direction, pending spec review
Branch strategy: implement in a worktree branch off `redesign`, merge after validation. No publish until explicitly approved.

## Vision

Reimagine devops.lucasluize.com as a terminal multiplexer session (tmux/herdr-style): sidebar workspaces, panes, a working prompt line, a login MOTD, and blog posts rendered in an NVIM/LazyVim-style reader. The site should feel like the space DevOps/SRE people live in - while staying instantly usable by a non-technical recruiter who only ever clicks.

## Decisions (agreed in brainstorming)

1. **Interaction: hybrid.** Everything is clickable/scrollable like a normal site; a real prompt line drives the same navigation for people who type. Nobody is ever required to type.
2. **Scope: full replacement.** The terminal is the only UI. Markdown stays the authoring format (`posts/*.md`, `projects/*.md`, registries), but becomes input to a CI content-compile step rather than a browser runtime dependency (see Build and delivery).
3. **Mobile: adaptive TUI.** Same design language; sidebar becomes a tmux-style bottom tab bar, panes stack full-width, prompt stays but is never required. Reduced blur effects on mobile for performance.
4. **Entry: fast MOTD, always skippable.** ~1.5s typed login + MOTD with command cheatsheet on the home route. Any key/click/scroll completes it instantly. Deep links (`/posts/<slug>.html`) bypass it entirely. Repeat visits in a session skip the animation (sessionStorage).
5. **Reader: medium cosplay.** Real nvim chrome (statusline with mode/filename/position, LazyVim-style pickers, syntax-highlighted code, inline images) but prose stays Bricolage/DM Sans at readable size. No line numbers on paragraphs.
6. **Architecture: pre-rendered pages + pushState shell.** Every post/project gets a real generated HTML page (`/posts/<slug>.html`, `/projects/<slug>.html`) with pre-rendered, sanitized content and unique title/description/OG meta - crawlers and social scrapers see full documents. Each page boots the same terminal shell with its buffer pre-filled. In-session navigation uses `history.pushState` + manifest fetch, so the multiplexer illusion never breaks; a direct load and an in-session navigation produce identical screens. `post.html?slug=X` / `project.html?slug=X` become redirect stubs so all previously shared URLs keep working.
7. **Contact: interactive wizard → Lambda Function URL + SES (Terraform).** Separate sub-project; the UI POSTs to a configurable endpoint URL with mailto fallback.

## Visual design

### Frame

```
+- lucaslab (glassy, blurred over wordmark) ---------------------+
| +- workspaces -+  +- pane: ~/posts/<slug>.md ----------------+ |
| |  ~  home     |  |                                          | |
| |  *  about    |  |  active buffer renders here              | |
| |  *  projects |  |  (MOTD / neofetch / telescope /          | |
| |  *  posts  v |  |   nvim reader / roadmap / wizard)        | |
| |  *  roadmap  |  |                                          | |
| |  *  contact  |  |                                          | |
| +--------------+  +------------------------------------------+ |
|  lucas@devops:~$ _                                             |
| [lucaslab] 0:home 1:posts*   branch master | 14:32 | CI ok     |
+----------------------------------------------------------------+
```

### Glassy terminal over brand wordmark

- The page background layer carries a large brand wordmark: "LUCAS LUIZE" / "DEVOPS" in a modern military-flavored monospace. Recommended: **Martian Mono** (wide, technical). Alternate if a stencil/military look wins: **Saira Stencil One** (not mono; use only for the wordmark). Decide at implementation with a side-by-side.
- The terminal window sits on top at 50-60% translucency with `backdrop-filter: blur()` - the wordmark is readable at the edges and softly visible through the terminal body.
- Existing `:root` palette unchanged: violet `#a78bfa` accent, orange `#f97316` secondary, same dark tints. The wordmark uses muted/low-opacity text with an accent highlight so it never fights the content.
- Mobile and `prefers-reduced-motion`/low-power: reduce or drop the blur (solid `--bg` at higher opacity) - `backdrop-filter` is expensive on mobile GPUs.

### Colorful, fun chrome (eza/spaceship/LSP energy)

- Sidebar items: icon + name (folder icons for sections, file icons for posts). The active item gets a subtle colored background tint plus the accent marker; hover gets a lighter tint.
- Statusline: spaceship-style segments with icons - session name, window tabs, git branch (static text `master`), clock (live, with clock emoji/SVG), CI badge with a tiny spinner animation that settles to a check.
- Prompt line: multi-segment like a real spaceship/starship prompt - `lucas@devops`, cwd with folder icon, git segment, violet `$`, blinking block cursor.
- Icons are emoji or small inline SVGs (nerd-font vibe without shipping a nerd font). Color-code like eza: directories violet, markdown files orange, executables green.
- Colors carry meaning consistently: violet = navigation/accent, orange = files/warm highlights, green = success/OK states, muted = chrome.

### Logo (replacing "D9")

"D9" has no story. Shortlist, decided at implementation with favicon mockups:

- **`:wq`** (recommended) - vim save-and-quit; ties directly to the NVIM reader, instantly legible to engineers, memorable, and mildly funny ("I ship").
- `>_` - universal terminal prompt; safest, least distinctive.
- `#!` - shebang; every engineer knows it, slightly more obscure to recruiters.

Favicon, sidebar header, and MOTD ASCII art all derive from the chosen mark.

## Architecture

### Components (each a small module, vanilla JS)

- **shell** - renders static chrome: sidebar, pane frame, prompt line, statusline. Owns layout state (active workspace, window tabs).
- **router** - History API over real URLs: `/` (MOTD), `/about.html`, `/projects.html`, `/projects/<slug>.html`, `/posts.html`, `/posts/<slug>.html`, `/roadmap.html`, `/contact.html`. In-session: `pushState` + buffer swap from the manifest, no reload. Direct load: the pre-rendered page hydrates into the shell. Unknown route → real 404 (S3/CloudFront error document, terminal-styled `command not found`), not a soft-200.
- **buffers** - one renderer per route type:
  - `motd` - typed login + cheatsheet (the fast-skippable sequence).
  - `neofetch` (about) - ASCII logo left, key-value facts right; skills table styled like a systemd unit list.
  - `telescope` (posts + projects pickers) - fuzzy input at bottom, results list left, excerpt preview right. Reuses `searchPosts`/`filterPosts`; tags become filter chips. Replaces search box, tag dropdown, and pagination.
  - `nvim` (post/project reader) - markdown via marked.js, syntax highlighting via highlight.js (CDN, same precedent as marked), inline images, statusline showing NORMAL / filename.md / scroll % / reading time. Share links kept.
  - `roadmap` - phases as systemd targets with OK/ACTIVE states and progress.
  - `contact` - interactive wizard (below).
- **prompt** - command engine. Small fixed set: `help`, `ls [posts|projects]`, `open <x>` / `cd <x>`, `cat <slug>`, `whoami`, `status`, `contact`, `clear`, arrow-key history. Unknown command → helpful error. Every command maps to a route the mouse can also reach. (Pipes/tab-completion: out of scope, layerable later.)
- **redirect stubs** - `post.html`/`project.html` keep their filenames and immediately `location.replace('/posts/<slug>.html')` (`/projects/<slug>.html`), preserving every link ever shared.

### Build and delivery (CI content compile)

Constraint reframed: **no framework and no runtime package dependencies; one deterministic content-compile step in CI.** The browser never parses markdown or front matter.

`scripts/build-content.js` (Node, no framework) runs in CI and locally:
- validates front matter against the content schema (build fails on violation - validation cannot be dead code)
- renders markdown → sanitized HTML (marked + sanitizer at build time only)
- emits `dist/`: per-post and per-project pages with unique canonical URL, title, description, OG/twitter meta; the shell pages; `manifest.json` (posts + projects with metadata, replacing runtime registry fetch-and-parse); `sitemap.xml`; `build-info.json` (commit SHA, build timestamp)
- gallery placement uses an explicit `<!-- screenshots -->` marker in the markdown, replacing `splitBodyByH2` magic

Pipeline: build `dist/` once → all tests (Playwright, axe, perf budgets, link checker) run against `dist/` → the *tested artifact* is uploaded and the deploy job syncs that exact artifact to S3 (never a rebuild). Deploy uses **GitHub→AWS OIDC** with a least-privilege role (no long-lived keys in secrets), pinned action SHAs, explicit `permissions:` blocks, and Cache-Control headers (HTML `no-cache`, static assets long max-age). Post-deploy: smoke request against devops.lucasluize.com asserting HTTP 200 + the deployed build SHA from `build-info.json`. The Playwright browser cache step is removed (per Playwright CI guidance; the current conditional skips `--with-deps` on cache hit).

The statusline's branch/SHA/deploy-time segments read `build-info.json` - real provenance, never fake data.

### Content model

Front matter gains `featured_order` (drives recruiter-facing ordering - never sort the narrative by date), `lifecycle` (`production | maintained | archived | prototype`, replacing the mixed-dimension `status`), `repo_visibility` (renamed from `visibility`), and provenance labels (`prod | personal | lab | learning`) surfaced as eza-style tags in pickers and skills. Screenshots become `{file, alt, caption}` objects - alt is never derived from caption. Case studies follow an authoring guideline (not an enforced grammar): Context → Constraints → Architecture → Failure Modes & Reliability → Testing/Validation → Outcome → Tradeoffs, with measured evidence preferred over confident prose (`tested RTO: 83s` beats "fails over seamlessly"). CIA analysis only where meaningful. Disqus is removed from project pages (stays on blog posts).

### Contact wizard + backend

UI: `contact` command (or clicking contact) starts a prompt-line dialog: name → email → message → `send? [Y/n]`. Confirmation renders a themed success/failure line.

Backend (separate sub-project, Terraform, in the aws workspace):
- `aws_lambda_function` (Node, 128MB, reserved concurrency 1)
- `aws_lambda_function_url` (CORS locked to devops.lucasluize.com)
- `aws_ses_email_identity` (owner address; SES sandbox is sufficient and acts as a 200/day cap)
- `aws_cloudwatch_metric_alarm` (billing ≥ $1)

Contract: `POST` JSON `{name, email, message, website, t}` where `website` is a honeypot (must be empty) and `t` is ms elapsed since wizard start (reject < 3000). Lambda validates: message ≤ 2KB, plausible email, honeypot empty, then sends via SES and returns 202. UI reads the endpoint from one const in config; if unset or the POST fails, fall back to a pre-filled `mailto:` draft and say so honestly in the terminal output.

Cost: ~$0/mo (Lambda perpetual free tier, no API Gateway, SES pennies). Abuse: concurrency cap + sandbox cap + honeypot + min-time + payload limit.

### Error handling

- Runtime fetching shrinks to the manifest (content is pre-rendered), but what remains is defensive: `response.ok` checked, `Promise.allSettled` where multiple resources load - one broken resource never blanks a working buffer.
- Fetch failures render as terminal-style errors in the pane (`curl: (7) failed to fetch manifest - retry`) with a retry affordance.
- JS disabled: `<noscript>` block with plain links to posts (markdown is client-rendered today already; not a regression).
- Unknown hash → 404 buffer with `help` hint.

## Engineering principles - the implementation is the portfolio

For a DevOps/SRE portfolio, the implementation itself must demonstrate the judgment being advertised. Every principle below is a concrete commitment with an enforcement mechanism - if it isn't tested or CI-enforced, it doesn't count.

| Principle | Commitment | Enforcement |
|---|---|---|
| Observability | RUM via `PerformanceObserver` (LCP, CLS, INP, long tasks) + `window.onerror`, reported as GA4 events. `status` command prints the visitor's own live session telemetry (load time, LCP, transfer size) in the terminal - observability as a feature. | e2e asserts `status` outputs real measured values |
| Failure handling | Content fetch retry with backoff; highlight.js CDN failure degrades to plain code blocks; contact POST failure/timeout falls back to mailto with honest messaging; unknown routes get a 404 buffer. | e2e simulates blocked CDN and dead endpoint, asserts graceful paths |
| Progressive enhancement | `@supports` fallback for `backdrop-filter`; reduced-motion serves full content without theater; `<noscript>` links directly to raw `posts/*.md` (deployed to S3, human-readable). | Jest test: noscript link list must match `posts/index.json` (extends existing index-consistency pattern) |
| Performance budgets | App JS+CSS ≤ 75KB gzipped; LCP < 2.5s on throttled mobile; zero CLS from the MOTD sequence; wordmark font subset via Google Fonts `text=` parameter. | Playwright perf test reads `performance` entries, fails CI over budget |
| Deterministic content validation | Front-matter schema test (required fields per post/project), internal slug-link checker, image-alt presence check - all offline, no network. | Jest in CI, blocking deploy |
| Accessibility | Keyboard-only journey (MOTD → posts → read → contact) as a first-class e2e test; axe-core scan per buffer route; contrast verified against the glassy background. | Playwright + axe-core, CI-blocking |
| Operational polish | Build-once/deploy-tested-artifact pipeline; GitHub→AWS OIDC (no long-lived keys), pinned action SHAs, least-privilege `permissions:`; Cache-Control on S3 sync (HTML `no-cache`, static assets long max-age) - eliminates the stale-asset bug class seen twice; post-deploy smoke check asserting live build SHA; $1 billing alarm on the contact stack. | CI workflow + Terraform |

## Accessibility

- All navigation reachable by mouse, touch, and keyboard; prompt is optional everywhere.
- Focus management on buffer swap (focus moves to pane heading).
- `prefers-reduced-motion`: skip MOTD typing (render final state), no spinners/blinking cursor animation.
- Semantic roles under the terminal styling (nav for sidebar, main for pane, form for wizard). Skip-link retained.
- Contrast: chrome text stays ≥ 4.5:1 against the glassy background - verify with the blur in place.

## Testing

- **Unit (Jest):** unchanged - utils.js untouched. `posts-index-consistency` stays. Add units for the command parser (pure function: input string → route/action).
- **E2e (Playwright):** rewritten against `dist/`, asserting behaviors (per project rule: behavior, not presence): posts load and are readable, telescope search narrows results, tag filter works, post deep link renders content + share links, project picker opens case study, prompt `open posts` navigates, MOTD skips on interaction, old `post.html?slug=X` URL lands on the post page, contact wizard validates and falls back without endpoint.
- **Locator policy:** user-facing locators (`getByRole`, `getByLabel`, text) over CSS selectors; test IDs only for contracts with no semantic handle. Never hardcode content counts (the current `toHaveCount(6)` pattern makes adding project #7 a test-maintenance event) - derive expected counts from the manifest. This replaces the CLAUDE.md protected-selector inventory with a smaller, sturdier contract.

## Rollout

1. Implementation happens in a git worktree on branch `terminal-ui` (off `redesign`) so `redesign` stays demoable.
2. CI S3 sync excludes tightened (done alongside this spec): `.claude/*`, `.agents/*`, `CLAUDE.md`, `jest.config.js`, `playwright.config.js`, `test-results/*`, `playwright-report/*` no longer deploy. Note: `.claude/settings.local.json` is git-tracked despite being gitignored - consider untracking separately.
3. Merge `terminal-ui` → `redesign` when satisfied; `redesign` → `master` (publishes) only on explicit approval. Push remains manual.

## Out of scope (explicitly deferred)

- Full shell engine (pipes, tab completion, man pages) - layerable on the prompt module later.
- Live CI status in the statusline (would need GitHub API; build-info.json provenance ships first).
- Lighthouse CI (Playwright perf asserts satisfy the budget principle; add LHCI later if the badge is wanted).
- Extensive visual regression (only a few tight component snapshots: prompt line, one card, statusline).
- Light theme.
