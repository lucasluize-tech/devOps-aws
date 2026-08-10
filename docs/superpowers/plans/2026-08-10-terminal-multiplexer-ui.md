# Terminal Multiplexer UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild devops.lucasluize.com as a tmux/herdr-style terminal session with a CI content-compile step, per `docs/superpowers/specs/2026-08-10-terminal-multiplexer-ui-design.md`.

**Architecture:** A Node build script compiles markdown → sanitized per-page HTML + manifest into `dist/`; the browser runs a dependency-free terminal shell (sidebar workspaces, prompt line, statusline) that hydrates pre-rendered pages and navigates via pushState. CI builds once, tests the artifact, deploys the tested artifact via OIDC.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules) at runtime. Build-time devDeps: `marked`, `sanitize-html`. Tests: Jest 30, Playwright 1.57, `@axe-core/playwright`.

## Global Constraints

- No frameworks, no runtime package dependencies. Browser never parses markdown or front matter.
- Palette unchanged: violet `#a78bfa` accent, orange `#f97316` secondary, existing `:root` tokens.
- Fonts: Bricolage Grotesque (headings in reader), DM Sans (prose), JetBrains Mono (all chrome). Wordmark: Martian Mono, subset via Google Fonts `text=` param. Never Inter/Space Grotesk/Roboto/system-ui.
- Logo mark: `:wq` (favicon, sidebar header, MOTD ASCII) - pending side-by-side veto at Task 6 checkpoint.
- Commit format: `action: description`, no Co-Authored-By.
- Perf budgets: app JS+CSS ≤ 75KB gzipped, LCP < 2.5s throttled mobile, zero CLS from MOTD.
- E2e locator policy: `getByRole`/`getByLabel`/text over CSS selectors; never hardcode content counts - derive from `dist/manifest.json`.
- All work in `../s3-terminal-ui` worktree (branch `terminal-ui`).
- Every commit leaves `npm test` green; e2e suites must pass at each phase checkpoint.
- Contact endpoint: `CONTACT_ENDPOINT` const in `app/config.js`, empty string = mailto fallback. Backend is a separate sub-project.

## File Structure

```
scripts/
  build-content.js        # orchestrator: clean dist/, compile, copy, emit
  lib/schema.js           # validatePost/validateProject (pure, Jest-tested)
  lib/render.js           # markdown -> sanitized HTML; screenshots marker
  lib/pages.js            # HTML page templates (shell + meta injection)
app/
  config.js                # CONTACT_ENDPOINT, SITE_ORIGIN
  shell.js                 # boot: chrome render, hydration, statusline clock
  router.js                # pushState nav, pane swap (pjax), popstate
  prompt.js                # parseCommand (pure) + prompt UI wiring
  buffers.js               # MOTD typing, telescope picker, contact wizard, status cmd
  terminal.css             # all chrome styling (glass, wordmark, sidebar, statusline)
  reader.css               # nvim reader buffer styling
posts/*.md, projects/*.md  # authoring source (front matter migrated)
dist/                      # build output, gitignored, tested, deployed
tests/unit/                # schema, render, parseCommand, noscript-sync
tests/e2e/                 # terminal.test.js, reader.test.js, a11y.test.js, perf.test.js
.github/workflows/ci-cd.yml  # build -> test -> deploy artifact (OIDC)
```

Legacy files (`index.js`, `post.js`, `project.js`, `styles.css`, `post.css`, `project.css`, old e2e suites) are deleted in Task 12 once replacements pass.

---

### Task 0: Worktree prep

**Files:** none (git/npm only)

- [ ] **Step 1:** Fast-forward the branch and install deps:
```bash
cd ../s3-terminal-ui
git merge --ff-only redesign
npm install
npm install --save-dev marked sanitize-html @axe-core/playwright
```
- [ ] **Step 2:** Verify baseline: `npm test` → 57 passing. Add `dist/` to `.gitignore`.
- [ ] **Step 3:** Commit: `chore: worktree baseline + build devDeps`

---

### Task 1: Content schema validation (pure)

**Files:**
- Create: `scripts/lib/schema.js`
- Test: `tests/unit/schema.test.js`

**Interfaces:**
- Produces: `validatePost(data, filenameSlug) -> string[]` (empty = valid), `validateProject(data, filenameSlug) -> string[]`. Both pure, no I/O.

- [ ] **Step 1: Write failing tests**
```js
// tests/unit/schema.test.js
const { validatePost, validateProject } = require('../../scripts/lib/schema.js');

const goodPost = { title: 'T', author: 'Lucas', excerpt: 'E', date: '2026-08-10',
  slug: 'good-post', tags: ['DevOps'] };
const goodProject = { title: 'T', slug: 'good-proj', category: 'infrastructure',
  lifecycle: 'production', goal: 'G', date: '2026-08-10', tech_stack: ['Proxmox'],
  featured_order: 1, repo_visibility: 'private', provenance: 'prod',
  screenshots: [{ file: 'arch.webp', alt: 'Architecture', caption: 'Failover' }] };

test('valid post/project return no errors', () => {
  expect(validatePost(goodPost, 'good-post')).toEqual([]);
  expect(validateProject(goodProject, 'good-proj')).toEqual([]);
});
test('slug must match filename and slug format', () => {
  expect(validatePost({ ...goodPost, slug: 'other' }, 'good-post')).not.toEqual([]);
  expect(validatePost({ ...goodPost, slug: 'Bad_Slug' }, 'Bad_Slug')).not.toEqual([]);
});
test('missing required fields fail', () => {
  for (const f of ['title', 'excerpt', 'date', 'slug'])
    expect(validatePost({ ...goodPost, [f]: undefined }, 'good-post')).not.toEqual([]);
});
test('lifecycle, provenance, date, screenshots are constrained', () => {
  expect(validateProject({ ...goodProject, lifecycle: 'in production' }, 'good-proj')).not.toEqual([]);
  expect(validateProject({ ...goodProject, provenance: 'work' }, 'good-proj')).not.toEqual([]);
  expect(validateProject({ ...goodProject, date: 'yesterday' }, 'good-proj')).not.toEqual([]);
  expect(validateProject({ ...goodProject, screenshots: [{ file: '../../etc/passwd.png', alt: 'x' }] }, 'good-proj')).not.toEqual([]);
  expect(validateProject({ ...goodProject, screenshots: [{ file: 'a.webp' }] }, 'good-proj')).not.toEqual([]); // alt required
});
test('featured_order must be a positive integer', () => {
  expect(validateProject({ ...goodProject, featured_order: 0 }, 'good-proj')).not.toEqual([]);
});
```
- [ ] **Step 2:** Run `npx jest tests/unit/schema.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement**
```js
// scripts/lib/schema.js  (CommonJS-compatible via module.exports for Jest)
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_RE = /^[a-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i;
const LIFECYCLES = ['production', 'maintained', 'archived', 'prototype'];
const PROVENANCE = ['prod', 'personal', 'lab', 'learning'];

const str = (v) => typeof v === 'string' && v.trim().length > 0;

function base(data, filenameSlug, required, errors) {
  for (const f of required) if (!str(data[f]) && typeof data[f] !== 'number') errors.push(`missing field: ${f}`);
  if (str(data.slug)) {
    if (!SLUG_RE.test(data.slug)) errors.push(`bad slug format: ${data.slug}`);
    if (data.slug !== filenameSlug) errors.push(`slug/filename mismatch: ${data.slug} vs ${filenameSlug}`);
  }
  if (str(data.date) && !(DATE_RE.test(data.date) && !isNaN(Date.parse(data.date))))
    errors.push(`bad date: ${data.date}`);
}

function validatePost(data, filenameSlug) {
  const errors = [];
  base(data, filenameSlug, ['title', 'author', 'excerpt', 'date', 'slug'], errors);
  if (data.tags && !Array.isArray(data.tags)) errors.push('tags must be an array');
  return errors;
}

function validateProject(data, filenameSlug) {
  const errors = [];
  base(data, filenameSlug, ['title', 'slug', 'category', 'lifecycle', 'goal', 'date'], errors);
  if (!LIFECYCLES.includes(data.lifecycle)) errors.push(`lifecycle must be one of ${LIFECYCLES}`);
  if (!PROVENANCE.includes(data.provenance)) errors.push(`provenance must be one of ${PROVENANCE}`);
  if (!Number.isInteger(data.featured_order) || data.featured_order < 1) errors.push('featured_order must be integer >= 1');
  if (!Array.isArray(data.tech_stack) || data.tech_stack.length === 0) errors.push('tech_stack required');
  if (data.repo_visibility && !['public', 'private'].includes(data.repo_visibility)) errors.push('repo_visibility: public|private');
  for (const s of data.screenshots || []) {
    if (!s || !FILE_RE.test(s.file || '')) errors.push(`bad screenshot file: ${s && s.file}`);
    if (!str(s.alt)) errors.push('screenshot alt required');
  }
  for (const url of [data.github, data.demo].filter(Boolean))
    if (!/^https:\/\//.test(url)) errors.push(`non-https url: ${url}`);
  return errors;
}

module.exports = { validatePost, validateProject, SLUG_RE };
```
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit: `feat: content schema validators for build step`

---

### Task 2: Markdown rendering + sanitization (pure)

**Files:**
- Create: `scripts/lib/render.js`
- Test: `tests/unit/render.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `renderMarkdown(md) -> string` (sanitized HTML), `extractScreenshotSlot(html) -> {before, after}` splitting at `<!-- screenshots -->` marker.

- [ ] **Step 1: Write failing tests**
```js
// tests/unit/render.test.js
const { renderMarkdown, extractScreenshotSlot } = require('../../scripts/lib/render.js');

test('renders markdown to html', () => {
  expect(renderMarkdown('# Hi\n\nbody')).toContain('<h1');
});
test('strips script tags and event handlers', () => {
  const out = renderMarkdown('hello <script>alert(1)</script> <img src=x onerror=alert(1)>');
  expect(out).not.toContain('<script');
  expect(out).not.toContain('onerror');
});
test('keeps code blocks with language class', () => {
  expect(renderMarkdown('```bash\nls\n```')).toMatch(/class="[^"]*language-bash/);
});
test('screenshot marker splits content', () => {
  const html = renderMarkdown('before\n\n<!-- screenshots -->\n\nafter');
  const { before, after } = extractScreenshotSlot(html);
  expect(before).toContain('before');
  expect(after).toContain('after');
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**
```js
// scripts/lib/render.js
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

const MARKER = '<!-- screenshots -->';

function renderMarkdown(md) {
  const raw = marked.parse(md.replace(MARKER, `<div data-screenshot-slot></div>`));
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'div', 'span']),
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'loading'],
      code: ['class'], pre: ['class'], div: ['data-screenshot-slot'], span: ['class'],
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
  });
}

function extractScreenshotSlot(html) {
  const [before, after = ''] = html.split(/<div data-screenshot-slot[^>]*><\/div>/);
  return { before, after };
}

module.exports = { renderMarkdown, extractScreenshotSlot, MARKER };
```
- [ ] **Step 4:** Run → PASS. (marked wraps `language-*` classes on fenced code by default; assert and adjust `renderer` only if the class is absent.)
- [ ] **Step 5:** Commit: `feat: build-time markdown rendering with sanitization`

---

### Task 3: Front-matter migration of existing content

**Files:**
- Modify: all `projects/*.md` front matter; `posts/*.md` untouched unless invalid
- Test: existing `tests/unit/schema.test.js` + new `tests/unit/content-valid.test.js`

**Interfaces:**
- Produces: every real content file passes the Task 1 validators.

- [ ] **Step 1: Write the content-wide validation test** (this replaces `posts-index-consistency` eventually but keep both green for now)
```js
// tests/unit/content-valid.test.js
const fs = require('fs'); const path = require('path');
const { validatePost, validateProject } = require('../../scripts/lib/schema.js');
const { parseMarkdown } = require('../../utils');

function files(dir) { return fs.readdirSync(dir).filter(f => f.endsWith('.md')); }

test('all posts pass schema', () => {
  for (const f of files('posts')) {
    const { data } = parseMarkdown(fs.readFileSync(path.join('posts', f), 'utf8'));
    expect({ file: f, errors: validatePost(data, f.replace(/\.md$/, '')) })
      .toEqual({ file: f, errors: [] });
  }
});
test('all projects pass schema', () => {
  for (const f of files('projects')) {
    const { data } = parseMarkdown(fs.readFileSync(path.join('projects', f), 'utf8'));
    expect({ file: f, errors: validateProject(data, f.replace(/\.md$/, '')) })
      .toEqual({ file: f, errors: [] });
  }
});
```
- [ ] **Step 2:** Run → FAIL listing exactly which fields each project is missing.
- [ ] **Step 3:** Edit each `projects/*.md` front matter: add `lifecycle` (map from old `status`), `featured_order` (strongest project = 1; agreed recruiter ordering, not date), `provenance` (`prod`/`personal`/`lab`/`learning`), rename `visibility` → `repo_visibility`, convert `screenshots` entries to `{file, alt, caption}` (write real alt text - describe the image, don't copy the caption). Replace the gallery H2 convention with the `<!-- screenshots -->` marker in the body.
- [ ] **Step 4:** Run → PASS. Full `npm test` still green.
- [ ] **Step 5:** Commit: `content: migrate project front matter to build schema`

---

### Task 4: build-content.js - dist generation

**Files:**
- Create: `scripts/build-content.js`, `scripts/lib/pages.js`
- Modify: `package.json` (scripts), `.gitignore` (`dist/` - done Task 0)
- Test: `tests/unit/build-output.test.js` (runs the build into a tmp dir, asserts output)

**Interfaces:**
- Consumes: `validatePost/validateProject` (Task 1), `renderMarkdown/extractScreenshotSlot` (Task 2), `parseMarkdown` from `utils.js`.
- Produces: `npm run build` → `dist/` containing: `index.html`, `about.html`, `posts.html`, `projects.html`, `roadmap.html`, `contact.html`, `posts/<slug>.html`, `projects/<slug>.html`, `post.html`+`project.html` redirect stubs, `404.html`, `manifest.json`, `sitemap.xml`, `build-info.json`, copied `app/`, `posts/*.md` (raw, for noscript), project screenshot assets. Manifest shape:
```json
{ "build": { "sha": "<GITHUB_SHA or dev>", "time": "<ISO>" },
  "posts": [{ "slug", "title", "excerpt", "date", "tags", "readingTime", "url" }],
  "projects": [{ "slug", "title", "goal", "category", "lifecycle", "featured_order",
                 "provenance", "tech_stack", "url" }] }
```
- Page template contract (`pages.js`): `pageHtml({ title, description, canonical, ogType, bodyClass, pane, pageData })` returns a full document containing the shell skeleton (sidebar nav, `<main id="pane">` with pre-rendered `pane` HTML, prompt line, statusline), unique meta, favicon, `<script>window.__PAGE__ = pageData</script>`, `<script type="module" src="/app/shell.js">`, and a `<noscript>` block with plain links (populated from the manifest at build time - deterministic by construction).

- [ ] **Step 1: Write failing test**
```js
// tests/unit/build-output.test.js
const { execSync } = require('child_process');
const fs = require('fs');
jest.setTimeout(30000);

beforeAll(() => { execSync('node scripts/build-content.js', { stdio: 'pipe' }); });

test('dist contains a page per post and project plus core pages', () => {
  const manifest = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  expect(manifest.posts.length).toBeGreaterThan(0);
  for (const p of manifest.posts) expect(fs.existsSync(`dist/posts/${p.slug}.html`)).toBe(true);
  for (const p of manifest.projects) expect(fs.existsSync(`dist/projects/${p.slug}.html`)).toBe(true);
  for (const f of ['index.html', 'posts.html', 'projects.html', 'about.html', 'roadmap.html',
                   'contact.html', '404.html', 'post.html', 'sitemap.xml', 'build-info.json'])
    expect(fs.existsSync(`dist/${f}`)).toBe(true);
});
test('post pages carry unique meta and pre-rendered content', () => {
  const manifest = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  const p = manifest.posts[0];
  const html = fs.readFileSync(`dist/posts/${p.slug}.html`, 'utf8');
  expect(html).toContain(`<title>${p.title}`);
  expect(html).toContain('property="og:title"');
  expect(html).toContain(`rel="canonical" href="https://devops.lucasluize.com/posts/${p.slug}.html"`);
  expect(html).toMatch(/<main id="pane"[\s\S]*<h1/);
});
test('projects in manifest are ordered by featured_order', () => {
  const m = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  const orders = m.projects.map(p => p.featured_order);
  expect(orders).toEqual([...orders].sort((a, b) => a - b));
});
test('noscript block lists every post', () => {
  const m = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  const html = fs.readFileSync('dist/index.html', 'utf8');
  const noscript = html.match(/<noscript>[\s\S]*?<\/noscript>/)[0];
  for (const p of m.posts) expect(noscript).toContain(`/posts/${p.slug}.md`);
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `scripts/lib/pages.js` (template literals; shell skeleton per the Interfaces contract; sidebar `<nav aria-label="workspaces">` with links to the six core pages; statusline `<footer role="contentinfo">` with placeholders `data-clock`, `data-sha`; prompt `<form data-prompt><label>...<input></label></form>`) and `scripts/build-content.js`:
  - clean + mkdir `dist/`
  - read all posts/projects, `parseMarkdown`, run validators; **exit non-zero printing all errors if any file fails** (validation can never be dead code)
  - `renderMarkdown` bodies; for projects, inject `<figure>` gallery at the screenshot slot from front matter (`<img src loading="lazy" alt>` + figcaption)
  - compute readingTime (existing utils logic: words/200)
  - emit pages via `pageHtml`, manifest (posts sorted by date desc, projects by `featured_order`), `sitemap.xml` (all canonical URLs), `build-info.json` `{ sha: process.env.GITHUB_SHA || 'dev', time: new Date().toISOString() }`
  - redirect stubs: `dist/post.html` = tiny document with `<script>var s=new URLSearchParams(location.search).get('slug');location.replace(s?'/posts/'+encodeURIComponent(s)+'.html':'/');</script>` (same for project.html)
  - copy `app/` dir, raw `posts/*.md`, and `projects/screenshots/**` into dist
  - add `package.json` scripts: `"build": "node scripts/build-content.js"`, `"serve": "npm run build && python3 -m http.server 8000 --directory dist"`
- [ ] **Step 4:** Run tests → PASS. Also run `npm run build` and eyeball `dist/posts/<any>.html` in a browser (unstyled content is expected - shell arrives Task 5).
- [ ] **Step 5:** Commit: `feat: content compiler - dist pages, manifest, sitemap, build-info`

---

### Task 5: Terminal shell chrome (glass frame, wordmark, sidebar, statusline)

**Files:**
- Create: `app/terminal.css`, `app/shell.js`, `app/config.js`
- Test: visual (screenshots at 1440px and 390px) - behavioral e2e lands in Task 10

**Interfaces:**
- Consumes: shell skeleton emitted by `pages.js` (Task 4), `window.__PAGE__`, `/build-info.json`.
- Produces: `initShell()` (auto-runs on module load): marks active sidebar item from `location.pathname`, starts statusline clock (1s interval), fetches `build-info.json` into `[data-sha]`, CI badge spinner→check animation. Exports nothing consumed elsewhere; `router.js` (Task 7) imports `swapPane` contract defined there.

- [ ] **Step 1:** Implement `app/config.js`:
```js
export const SITE_ORIGIN = 'https://devops.lucasluize.com';
export const CONTACT_ENDPOINT = ''; // Lambda Function URL - empty = mailto fallback
```
- [ ] **Step 2:** Implement `terminal.css` core (iterate visually after):
```css
:root { /* palette tokens copied verbatim from current styles.css :root */ }
body { margin: 0; min-height: 100dvh; background: var(--bg); font-family: 'JetBrains Mono', monospace; }
/* Background wordmark layer */
body::before {
  content: 'LUCAS LUIZE\A DEVOPS'; white-space: pre;
  position: fixed; inset: 0; display: grid; place-content: center;
  font-family: 'Martian Mono', monospace; font-weight: 800;
  font-size: clamp(3rem, 11vw, 9rem); line-height: 1.05; letter-spacing: -0.03em;
  color: color-mix(in srgb, var(--accent) 16%, transparent);
  z-index: 0; pointer-events: none;
}
/* Glassy terminal window */
.term {
  position: relative; z-index: 1; display: grid;
  grid-template: "side main" 1fr "side prompt" auto "status status" auto / 220px 1fr;
  height: 100dvh; margin: clamp(8px, 2vw, 28px); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
@supports not (backdrop-filter: blur(1px)) { .term { background: var(--bg); } }
@media (prefers-reduced-motion: reduce), (max-width: 767px) {
  .term { backdrop-filter: none; -webkit-backdrop-filter: none;
          background: color-mix(in srgb, var(--bg) 92%, transparent); }
}
/* Sidebar: active item gets tinted background */
.side a { display: flex; gap: 8px; padding: 8px 12px; color: var(--muted); border-radius: 6px; }
.side a:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); color: var(--text); }
.side a[aria-current="page"] {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent-bright); border-left: 2px solid var(--accent);
}
/* Statusline + prompt + mobile bottom-bar: see spec frame; mobile: grid collapses,
   .side becomes a fixed bottom row of icon tabs */
```
plus prompt-line segments, statusline segments (session, tabs, sha, clock, CI badge), eza-style color-coded icons (inline SVG sprite in the skeleton: folder=violet, md-file=orange, ok=green), blinking block cursor, `:wq` logo block, Martian Mono `<link>` with `&text=LUCASLUIZEDEVOPS%20` in `pages.js` head.
- [ ] **Step 3:** Implement `app/shell.js` (active-nav marking, clock, `build-info.json` fetch with `response.ok` guard - `[data-sha]` shows `dev` on failure, never blank).
- [ ] **Step 4:** `npm run serve`, screenshot desktop + mobile, fix obvious breakage.
- [ ] **Step 5:** Commit: `feat: terminal shell chrome - glass frame, wordmark, sidebar, statusline`

---

### Task 6: CHECKPOINT - visual direction review with user

- [ ] Present side-by-side screenshots: Martian Mono vs Saira Stencil One wordmark; `:wq` vs `>_` vs `#!` logo in situ (favicon + sidebar). User picks; apply choices. Iterate on glass opacity (spec: 50-60%) until approved.
- [ ] Commit: `style: lock wordmark font and logo mark per review`

---

### Task 7: Router - pushState pane swaps

**Files:**
- Create: `app/router.js`
- Test: `tests/unit/router-paths.test.js` (pure helpers), e2e in Task 10

**Interfaces:**
- Consumes: pages all share the shell skeleton (Task 4).
- Produces: `navigate(url)` - fetches the target page, checks `response.ok`, extracts `#pane` innerHTML + `<title>` (via `DOMParser`), swaps into current `#pane`, `history.pushState`, updates sidebar `aria-current`, moves focus to `#pane h1` (a11y), scrolls pane to top. `popstate` handler reuses the same swap. Fetch failure → terminal-styled error block in pane (`curl: (7) failed to fetch - [retry]` with a real retry button) - never a blank pane. Intercepts same-origin `<a>` clicks. Pure helper `isInternalNav(href, origin) -> boolean` exported for Jest.

- [ ] **Step 1:** Jest test for `isInternalNav` (internal pages true; external, mailto, raw `.md`, hash-only false).
- [ ] **Step 2:** Run → FAIL. Implement `router.js` per contract. Run → PASS.
- [ ] **Step 3:** Manual check on `npm run serve`: sidebar click swaps pane without reload (network tab shows document fetch, no full navigation), back/forward work, direct URL load renders identically.
- [ ] **Step 4:** Commit: `feat: pushState router with pjax pane swaps`

---

### Task 8: Buffers - MOTD, telescope picker, themed sections

**Files:**
- Create: `app/buffers.js`, `app/reader.css`
- Modify: `scripts/lib/pages.js` (buffer-specific pane content: MOTD pane for index, picker panes, neofetch about, systemd roadmap)
- Test: unit for picker filtering glue; e2e in Task 10

**Interfaces:**
- Consumes: manifest embedded per-page as `window.__PAGE__.manifest` (add in Task 4's `pageData` for picker pages), `searchPosts`/`filterPosts` logic ported into `buffers.js` (browser has no `utils.js` require - copy the two small pure functions, keep them exported for Jest via the established dual-export pattern).
- Produces:
  - `runMotd(el)`: types the login+MOTD text (~1.5s, `requestAnimationFrame` batches); any keydown/click/scroll completes instantly; `sessionStorage.motdDone` skips; `prefers-reduced-motion` renders final state immediately. Fixed-height container (zero CLS - reserve the full block height up front).
  - `initTelescope(el, items, kind)`: fuzzy input (bottom), results list (left, `role="listbox"`, arrow-key + click selection), preview pane (right, excerpt/goal). Tag filter chips from manifest tags. Enter/click navigates via `router.navigate`. Counts shown as `[n/total]`.
  - `initStatus(el)`: renders the visitor's real session telemetry (nav timing, transfer sum via `performance.getEntriesByType`, LCP via buffered `PerformanceObserver`) as an aligned key-value table.
  - About pane = neofetch layout (ASCII `:wq` logo left; key-values incl. skills with provenance labels `[prod]`/`[lab]`); roadmap pane = systemd unit list - both are build-time HTML in `pages.js`, no JS needed.
- [ ] Steps: TDD the pure parts (fuzzy match + tag filter given manifest fixtures), implement, visual pass, commit per buffer: `feat: MOTD buffer`, `feat: telescope pickers`, `feat: status + themed section buffers`.

---

### Task 9: Prompt engine + contact wizard

**Files:**
- Create: `app/prompt.js`
- Test: `tests/unit/prompt.test.js`

**Interfaces:**
- Consumes: `router.navigate`, manifest, `CONTACT_ENDPOINT` (Task 5), `runMotd` clear behavior.
- Produces: `parseCommand(input, manifest) -> { kind: 'nav', url } | { kind: 'print', lines: string[] } | { kind: 'clear' } | { kind: 'wizard' }` (pure, dual-exported). Commands: `help`, `ls [posts|projects]`, `open <x>`/`cd <x>` (workspace names + slugs), `cat <slug>`, `whoami`, `status`, `contact`, `clear`. Unknown → `print` with `bash: <cmd>: command not found - try 'help'`. Wiring: form submit → parse → act; ArrowUp/Down history (in-memory array).
- Contact wizard: sequential prompts in the pane (name → email → message → `send? [Y/n]`); validates email shape and message ≤ 2000 chars client-side; POST JSON `{name, email, message, website: '', t: msSinceStart}` to `CONTACT_ENDPOINT` with 8s `AbortSignal.timeout`; on success prints delivery confirmation; on failure or empty endpoint prints honest fallback + `mailto:` link prefilled with the composed message. Esc cancels.

- [ ] **Step 1: Failing tests** for `parseCommand`:
```js
const { parseCommand } = require('../../app/prompt.js');
const m = { posts: [{ slug: 'proxmox-lab', title: 'P' }], projects: [{ slug: 'ha-proxmox', title: 'H' }] };
test('nav commands', () => {
  expect(parseCommand('open posts', m)).toEqual({ kind: 'nav', url: '/posts.html' });
  expect(parseCommand('cd projects', m)).toEqual({ kind: 'nav', url: '/projects.html' });
  expect(parseCommand('cat proxmox-lab', m)).toEqual({ kind: 'nav', url: '/posts/proxmox-lab.html' });
  expect(parseCommand('whoami', m)).toEqual({ kind: 'nav', url: '/about.html' });
});
test('ls prints slugs', () => {
  expect(parseCommand('ls posts', m).lines.join(' ')).toContain('proxmox-lab');
});
test('unknown command', () => {
  expect(parseCommand('sudo rm -rf /', m).lines[0]).toMatch(/command not found/);
});
test('contact starts wizard; clear clears', () => {
  expect(parseCommand('contact', m)).toEqual({ kind: 'wizard' });
  expect(parseCommand('clear', m)).toEqual({ kind: 'clear' });
});
```
- [ ] **Step 2:** FAIL → implement → PASS → wire UI → manual pass (`npm run serve`).
- [ ] **Step 3:** Commit: `feat: prompt command engine + interactive contact wizard`

---

### Task 10: E2e suite rewrite (behavior, getByRole, manifest-derived counts)

**Files:**
- Create: `tests/e2e/terminal.test.js`, `tests/e2e/reader.test.js`, `tests/e2e/a11y.test.js`, `tests/e2e/perf.test.js`
- Delete: `tests/e2e/blog.test.js`, `tests/e2e/projects-carousel.test.js` (and other old suites)
- Modify: `playwright.config.js` webServer → `npm run build && python3 -m http.server 8000 --directory dist`

**Covers (each is a test, all using role/text locators):** MOTD completes on click and is skipped for deep links; sidebar click swaps pane without full reload (assert via `window.__marker = 1` surviving navigation); telescope search narrows results and Enter opens the post; tag chip filters; post deep link `/posts/<slug>.html` renders h1 + share links; `post.html?slug=X` redirects to it; prompt `open posts` navigates and `sudo x` prints command-not-found; contact wizard validates bad email, and with `CONTACT_ENDPOINT` empty prints the mailto fallback; keyboard-only journey (Tab/Enter from load → posts → open post → back); 404 page for unknown URL; counts derived by reading `dist/manifest.json` in the test, never literals.

**a11y.test.js:** `new AxeBuilder({ page }).analyze()` on `/`, `/posts.html`, one post, `/contact.html` - zero `serious`/`critical` violations.

**perf.test.js:** sum `encodedBodySize` of same-origin JS+CSS resources ≤ 75KB; LCP (buffered observer) < 2500ms with CPU throttling 4x; `layout-shift` entries during MOTD sum < 0.02.

- [ ] Write suites → run against dist → fix app bugs until green → delete old suites → full `npm run test:all` green → Commit: `test: e2e rewrite for terminal UI - behavior, axe, perf budgets`

---

### Task 11: CI/CD workflow - build once, test artifact, OIDC deploy, smoke check

**Files:**
- Modify: `.github/workflows/ci-cd.yml`

**Interfaces:**
- Consumes: `npm run build` (Task 4). New repo secret `AWS_DEPLOY_ROLE_ARN` (role created by the Terraform sub-project; until it exists this workflow change stays on the branch - which it does anyway until merge).

- [ ] **Step 1:** Rewrite workflow:
  - `permissions: { contents: read }` top-level; deploy job adds `id-token: write`.
  - **test job:** checkout → setup-node → `npm ci` → `npx playwright install --with-deps` (cache step deleted) → `npm run build` (fails CI on schema violations) → `npm test` → `npm run test:e2e` → `actions/upload-artifact` of `dist/` (always, not just on failure - it's the deployable) + playwright-report on failure.
  - **deploy job:** `needs: test`, master-push only → `actions/download-artifact` dist → `aws-actions/configure-aws-credentials` with `role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}` (no static keys) → two syncs:
    ```bash
    aws s3 sync dist/ "s3://$BUCKET" --delete \
      --exclude "*.html" --exclude "manifest.json" --exclude "build-info.json" \
      --cache-control "public,max-age=31536000,immutable"
    aws s3 sync dist/ "s3://$BUCKET" \
      --exclude "*" --include "*.html" --include "manifest.json" --include "build-info.json" \
      --cache-control "no-cache"
    ```
    (dist/ is the whole artifact - the exclude-list of repo files disappears entirely)
  - CloudFront invalidation → smoke check:
    ```bash
    DEPLOYED=$(curl -fsS https://devops.lucasluize.com/build-info.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["sha"])')
    test "$DEPLOYED" = "$GITHUB_SHA"
    ```
  - Pin all third-party actions by full commit SHA (`actions/checkout@<sha>`, etc. - look up current SHAs at implementation time via `gh api`).
- [ ] **Step 2:** Validate with `actionlint` locally (`npx actionlint` or binary). PR-run the test job on the branch to confirm green.
- [ ] **Step 3:** Commit: `ci: build-once artifact pipeline, OIDC deploy, cache-control, smoke check`

---

### Task 12: Legacy teardown + docs

**Files:**
- Delete: `index.js`, `post.js`, `project.js`, `styles.css`, `post.css`, `project.css`, root `index.html`/`post.html`/`project.html`/`404.html` sources (all replaced by `pages.js` output), `tests/unit/` suites that tested deleted code (`load-posts`, `post-unit`, `project-body-split`, `project-screenshots`, old filtering/search if superseded by ported versions)
- Modify: `CLAUDE.md` (commands: build/serve; structure; locator policy replaces the selector inventory; conventions: front-matter schema, screenshots marker), `utils.js` (keep only what build + tests consume)

- [ ] **Step 1:** Delete legacy files; run `npm run build && npm run test:all` → everything green with no references to deleted files (grep for them).
- [ ] **Step 2:** Update CLAUDE.md sections listed above. Remove Disqus include from project page template if it snuck in (spec: posts only).
- [ ] **Step 3:** Commit: `refactor: remove legacy runtime renderers and stale docs`

---

### Task 13: FINAL CHECKPOINT - full review with user

- [ ] Serve `dist/`, walk desktop + mobile: MOTD, every workspace, a post (typography, code highlight - note: syntax highlighting is build-time via marked + a highlight pass only if Task 8 visual review demanded it; otherwise `language-*` classes styled by `reader.css`), prompt commands, contact fallback, `status`.
- [ ] Iterate on visual feedback (this is the "reiterate many times until satisfied" phase - budget for several rounds).
- [ ] After approval: merge `terminal-ui` → `redesign` (user pushes; master merge = publish decision stays manual). Contact backend sub-project (Lambda+SES+OIDC role Terraform) gets its own brainstorm→spec→plan next.

## Self-review notes

- Spec coverage: build step (T4), pushState+hydration (T7), MOTD (T8), telescope (T8), nvim reader styling (T8 reader.css + T13), prompt+wizard (T9), provenance labels/neofetch/systemd roadmap (T8 via pages.js), OIDC/cache-control/smoke (T11), perf/axe/keyboard (T10), noscript sync (T4 test), content model (T1/T3), teardown+CLAUDE.md (T12). Gap check: reading-progress % in reader statusline - folded into T8 reader.css scroll listener; share links on post pages - emitted by pages.js template (T4).
- Deferred to sub-projects: Lambda+SES contact backend; OIDC IAM role Terraform (workflow consumes its ARN via secret).
- Type consistency: `parseCommand` return kinds match T9 tests; manifest field names consistent across T4/T8/T10.
