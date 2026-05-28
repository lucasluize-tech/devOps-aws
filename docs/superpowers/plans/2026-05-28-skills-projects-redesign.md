# Skills + Projects Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale homepage Skills + fake Projects sections with reality-aligned content, introduce a per-project static-rendered detail page system mirroring the existing post system, and apply the CI/CD optimizations identified in the spec audit.

**Architecture:** Vanilla HTML/CSS/JS, no build tools, no new runtime deps. Project content is markdown + YAML front-matter under `projects/`, registered in `projects/index.json`. Client-side rendering via `marked` + `gray-matter` (CDN). Homepage carousel = CSS scroll-snap. Detail page = `project.html?slug=<slug>` mirroring `post.html?slug=<slug>`. Shared render helpers live in `utils.js` with the existing dual-export pattern.

**Tech Stack:** HTML/CSS/JS, marked.js (CDN), gray-matter (CDN + npm for tests), Jest 30 + jest-environment-jsdom (new dev dep), Playwright 1.57, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-05-28-skills-projects-redesign-design.md`.

---

## File Structure

### Files to create

```
project.html                                      # detail page shell
project.js                                        # detail page renderer
project.css                                       # detail page styles
projects/index.json                               # registry
projects/<slug>.md  × 6                           # project content
projects/images/.gitkeep                          # placeholder for screenshots
tests/unit/projects-index-consistency.test.js     # mirrors posts-index-consistency
tests/unit/projects-parsing.test.js               # parsing + enum + required-fields tests
tests/unit/projects-helpers.test.js               # DOM render helpers (jsdom)
tests/unit/project-body-split.test.js             # body splitting (jsdom)
tests/unit/project-screenshots.test.js            # gallery renderer (jsdom)
tests/e2e/projects-carousel.test.js               # carousel + navigation
tests/e2e/project-detail.test.js                  # detail page rendering
tests/e2e/projects-accessibility.test.js          # a11y checks
tests/fixtures/projects/                          # fixture .md files for parsing tests
```

### Files to modify

- `index.html` — skills section (3 → 4 cards, real content); projects section (3 fake cards → carousel container + dots).
- `index.js` — add `loadProjects`, `validateProject`, `renderProjectCarousel`, `attachCarouselDots`; extend `initIndex`.
- `utils.js` — add `renderCategoryTag`, `renderStatusPill`, `renderTechChips`, `renderActionButtons`, `splitBodyByH2`, `renderScreenshotGallery`. Preserve dual-export.
- `styles.css` — add `.projects-carousel`, `.project-card`, `.category-tag`, `.status-pill` (+ semantic color variants), `.tech-chip`; update `#skills` grid breakpoints; update `#projects h2::after` label.
- `jest.config.js` — keep node default; tests that need DOM use per-file `@jest-environment jsdom` docblock.
- `package.json` — add `jest-environment-jsdom` as devDependency.
- `.github/workflows/ci-cd.yml` — apply A–G from spec §9.
- `CLAUDE.md` — extend critical-selectors list.

---

## Task 1: Scaffold `projects/` directory and registry

**Files:**
- Create: `projects/index.json`
- Create: `projects/images/.gitkeep`

- [ ] **Step 1: Create the registry as an empty array**

Create `projects/index.json`:
```json
[]
```

- [ ] **Step 2: Create the screenshots directory placeholder**

Create `projects/images/.gitkeep` as an empty file.

- [ ] **Step 3: Verify directory layout**

Run: `ls projects/`
Expected: `images  index.json`

- [ ] **Step 4: Commit**

```bash
git add projects/
git commit -m "scaffold projects directory and empty registry"
```

---

## Task 2: Add `projects-index-consistency` test (initially passing against empty registry)

**Files:**
- Create: `tests/unit/projects-index-consistency.test.js`

- [ ] **Step 1: Write the test, mirroring `posts-index-consistency`**

Create `tests/unit/projects-index-consistency.test.js`:
```javascript
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

describe('projects/index.json consistency', () => {
  const projectsDir = path.join(__dirname, '..', '..', 'projects');
  const indexPath = path.join(projectsDir, 'index.json');

  it('includes every markdown project slug in projects/index.json', () => {
    const indexEntries = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const indexSlugs = new Set(indexEntries.map((entry) => entry.slug));

    const markdownFiles = fs
      .readdirSync(projectsDir)
      .filter((file) => file.endsWith('.md'));

    const missingSlugs = [];

    for (const fileName of markdownFiles) {
      const markdownPath = path.join(projectsDir, fileName);
      const markdownContent = fs.readFileSync(markdownPath, 'utf8');
      const { data } = matter(markdownContent);
      const slug = data.slug;

      if (!slug || !indexSlugs.has(slug)) {
        missingSlugs.push(fileName);
      }
    }

    expect(missingSlugs).toEqual([]);
  });

  it('does not include slugs in projects/index.json without a matching markdown file', () => {
    const indexEntries = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const markdownSlugs = new Set(
      fs
        .readdirSync(projectsDir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => {
          const markdownPath = path.join(projectsDir, file);
          const markdownContent = fs.readFileSync(markdownPath, 'utf8');
          const { data } = matter(markdownContent);
          return data.slug;
        })
        .filter(Boolean)
    );

    const missingFiles = indexEntries
      .map((entry) => entry.slug)
      .filter((slug) => !markdownSlugs.has(slug));

    expect(missingFiles).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- tests/unit/projects-index-consistency.test.js`
Expected: 2 tests PASS (registry and project dir are both empty — vacuously consistent).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/projects-index-consistency.test.js
git commit -m "test: add projects/index.json consistency check"
```

---

## Task 3: Add `validateProject` with required-field + enum tests

**Files:**
- Create: `tests/unit/projects-parsing.test.js`
- Modify: `utils.js` (append `validateProject`)

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/projects-parsing.test.js`:
```javascript
const { validateProject } = require('../../utils');

const validProject = {
  title: 'Test',
  slug: 'test',
  category: 'Infra',
  status: 'in production',
  goal: 'one liner',
  visibility: 'public',
  date: '2026-05-28',
  tech_stack: ['x'],
};

describe('validateProject', () => {
  it('accepts a fully valid project front-matter object', () => {
    expect(validateProject(validProject)).toEqual({ ok: true, errors: [] });
  });

  describe('required fields', () => {
    const required = ['title', 'slug', 'category', 'status', 'goal', 'visibility', 'date', 'tech_stack'];
    required.forEach((field) => {
      it(`rejects when "${field}" is missing`, () => {
        const { [field]: _omit, ...partial } = validProject;
        const result = validateProject(partial);
        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toMatch(field);
      });
    });
  });

  describe('enum validation', () => {
    it('rejects invalid category', () => {
      const result = validateProject({ ...validProject, category: 'Bogus' });
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(/category/);
    });
    it('rejects invalid status', () => {
      const result = validateProject({ ...validProject, status: 'shipped' });
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(/status/);
    });
    it('rejects invalid visibility', () => {
      const result = validateProject({ ...validProject, visibility: 'hidden' });
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(/visibility/);
    });
  });

  it('accepts tech_stack as an empty array (key must exist, may be empty)', () => {
    const result = validateProject({ ...validProject, tech_stack: [] });
    expect(result.ok).toBe(true);
  });

  it('rejects tech_stack that is not an array', () => {
    const result = validateProject({ ...validProject, tech_stack: 'Python' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/tech_stack/);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- tests/unit/projects-parsing.test.js`
Expected: All tests FAIL with `validateProject is not a function`.

- [ ] **Step 3: Implement `validateProject`**

Append to `utils.js` immediately before the dual-export block at the bottom:
```javascript
const PROJECT_CATEGORIES = ['Infra', 'Apps', 'Dev Tools', 'Other'];
const PROJECT_STATUSES = ['in production', 'published', 'maintained', 'archived'];
const PROJECT_VISIBILITIES = ['public', 'private', 'internal'];
const PROJECT_REQUIRED = ['title', 'slug', 'category', 'status', 'goal', 'visibility', 'date', 'tech_stack'];

function validateProject(data) {
  const errors = [];
  PROJECT_REQUIRED.forEach((field) => {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`missing required field: ${field}`);
    }
  });
  if (data.category && !PROJECT_CATEGORIES.includes(data.category)) {
    errors.push(`invalid category: ${data.category}`);
  }
  if (data.status && !PROJECT_STATUSES.includes(data.status)) {
    errors.push(`invalid status: ${data.status}`);
  }
  if (data.visibility && !PROJECT_VISIBILITIES.includes(data.visibility)) {
    errors.push(`invalid visibility: ${data.visibility}`);
  }
  if (data.tech_stack !== undefined && !Array.isArray(data.tech_stack)) {
    errors.push('tech_stack must be an array');
  }
  return { ok: errors.length === 0, errors };
}
```

Update the dual-export block at the bottom of `utils.js`:
```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseMarkdown, calculateReadingTime, collectTags, filterPosts, searchPosts, getTotalPages, getPostsForPage, validateProject, PROJECT_CATEGORIES, PROJECT_STATUSES, PROJECT_VISIBILITIES };
} else {
  window.parseMarkdown = parseMarkdown;
  window.calculateReadingTime = calculateReadingTime;
  window.collectTags = collectTags;
  window.filterPosts = filterPosts;
  window.searchPosts = searchPosts;
  window.getTotalPages = getTotalPages;
  window.getPostsForPage = getPostsForPage;
  window.validateProject = validateProject;
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- tests/unit/projects-parsing.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Confirm no regression in existing tests**

Run: `npm test`
Expected: All existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add utils.js tests/unit/projects-parsing.test.js
git commit -m "feat: add validateProject with required-field and enum checks"
```

---

## Task 4: Install `jest-environment-jsdom` (needed by DOM render helper tests)

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the package**

Run: `npm install --save-dev jest-environment-jsdom`
Expected: package.json devDependencies gains `jest-environment-jsdom`.

- [ ] **Step 2: Sanity check that existing tests still run**

Run: `npm test`
Expected: All existing tests PASS (no env switch yet — only added the dep).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add jest-environment-jsdom for DOM helper tests"
```

---

## Task 5: Add `renderCategoryTag` and `renderStatusPill` helpers

**Files:**
- Create: `tests/unit/projects-helpers.test.js`
- Modify: `utils.js`

- [ ] **Step 1: Write the failing tests with jsdom env**

Create `tests/unit/projects-helpers.test.js`:
```javascript
/**
 * @jest-environment jsdom
 */
const { renderCategoryTag, renderStatusPill } = require('../../utils');

describe('renderCategoryTag', () => {
  it('appends a span.category-tag with the category text', () => {
    const container = document.createElement('div');
    renderCategoryTag('Infra', container);
    const span = container.querySelector('span.category-tag');
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('Infra');
  });

  it('uses textContent (no HTML injection)', () => {
    const container = document.createElement('div');
    renderCategoryTag('<img src=x onerror=alert(1)>', container);
    expect(container.innerHTML).not.toMatch(/<img/);
  });
});

describe('renderStatusPill', () => {
  const cases = [
    ['in production', 'status-production'],
    ['published',     'status-published'],
    ['maintained',    'status-maintained'],
    ['archived',      'status-archived'],
  ];
  cases.forEach(([status, cls]) => {
    it(`maps "${status}" to .${cls}`, () => {
      const container = document.createElement('div');
      renderStatusPill(status, container);
      const span = container.querySelector('span.status-pill');
      expect(span).not.toBeNull();
      expect(span.classList.contains(cls)).toBe(true);
      expect(span.textContent).toBe(status);
    });
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- tests/unit/projects-helpers.test.js`
Expected: All tests FAIL with `renderCategoryTag is not a function`.

- [ ] **Step 3: Implement both helpers in `utils.js`**

Append (still above the dual-export block):
```javascript
const STATUS_CLASS_MAP = {
  'in production': 'status-production',
  'published':     'status-published',
  'maintained':    'status-maintained',
  'archived':      'status-archived',
};

function renderCategoryTag(category, container) {
  const span = document.createElement('span');
  span.className = 'category-tag';
  span.textContent = category;
  container.appendChild(span);
  return span;
}

function renderStatusPill(status, container) {
  const span = document.createElement('span');
  span.className = 'status-pill ' + (STATUS_CLASS_MAP[status] || '');
  span.textContent = status;
  container.appendChild(span);
  return span;
}
```

Update the dual-export block to include `renderCategoryTag`, `renderStatusPill` in both branches.

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- tests/unit/projects-helpers.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Run full suite — no regressions**

Run: `npm test`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add utils.js tests/unit/projects-helpers.test.js
git commit -m "feat: add renderCategoryTag and renderStatusPill helpers"
```

---

## Task 6: Add `renderTechChips` helper

**Files:**
- Modify: `tests/unit/projects-helpers.test.js`
- Modify: `utils.js`

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/projects-helpers.test.js`:
```javascript
const { renderTechChips } = require('../../utils');

describe('renderTechChips', () => {
  it('renders one .tech-chip per item in card variant', () => {
    const container = document.createElement('div');
    renderTechChips(['Proxmox', 'Debian', 'Bash'], container, { variant: 'card' });
    const chips = container.querySelectorAll('.tech-chip');
    expect(chips.length).toBe(3);
    expect(chips[0].textContent).toBe('Proxmox');
  });

  it('renders a single .tech-list with "·" separator in detail variant', () => {
    const container = document.createElement('div');
    renderTechChips(['Proxmox', 'Debian', 'Bash'], container, { variant: 'detail' });
    const list = container.querySelector('.tech-list');
    expect(list).not.toBeNull();
    expect(list.textContent).toBe('Proxmox · Debian · Bash');
  });

  it('renders nothing when techArray is empty', () => {
    const container = document.createElement('div');
    renderTechChips([], container, { variant: 'card' });
    expect(container.children.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run, confirm new tests fail**

Run: `npm test -- tests/unit/projects-helpers.test.js`
Expected: 3 new tests FAIL.

- [ ] **Step 3: Implement `renderTechChips`**

Append to `utils.js`:
```javascript
function renderTechChips(techArray, container, { variant }) {
  if (!Array.isArray(techArray) || techArray.length === 0) return;
  if (variant === 'card') {
    const wrap = document.createElement('div');
    wrap.className = 'tech-chips';
    techArray.forEach((tech) => {
      const chip = document.createElement('span');
      chip.className = 'tech-chip';
      chip.textContent = tech;
      wrap.appendChild(chip);
    });
    container.appendChild(wrap);
  } else if (variant === 'detail') {
    const list = document.createElement('span');
    list.className = 'tech-list';
    list.textContent = techArray.join(' · ');
    container.appendChild(list);
  }
}
```

Add `renderTechChips` to both branches of the dual-export block.

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- tests/unit/projects-helpers.test.js`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add utils.js tests/unit/projects-helpers.test.js
git commit -m "feat: add renderTechChips with card and detail variants"
```

---

## Task 7: Add `renderActionButtons` helper

**Files:**
- Modify: `tests/unit/projects-helpers.test.js`
- Modify: `utils.js`

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/projects-helpers.test.js`:
```javascript
const { renderActionButtons } = require('../../utils');

describe('renderActionButtons', () => {
  it('renders both GitHub and Demo buttons for public project with both URLs', () => {
    const container = document.createElement('div');
    renderActionButtons(
      { visibility: 'public', github: 'https://github.com/x/y', demo: 'https://example.com' },
      container
    );
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0].href).toBe('https://github.com/x/y');
    expect(links[0].rel).toMatch(/noopener/);
    expect(links[0].rel).toMatch(/noreferrer/);
    expect(links[0].target).toBe('_blank');
    expect(links[1].href).toBe('https://example.com/');
  });

  it('renders only GitHub button when demo is absent', () => {
    const container = document.createElement('div');
    renderActionButtons({ visibility: 'public', github: 'https://github.com/x/y' }, container);
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(1);
  });

  it('renders private muted note for visibility=private', () => {
    const container = document.createElement('div');
    renderActionButtons({ visibility: 'private' }, container);
    expect(container.querySelectorAll('a').length).toBe(0);
    expect(container.textContent).toMatch(/private repo/i);
  });

  it('renders internal muted note for visibility=internal', () => {
    const container = document.createElement('div');
    renderActionButtons({ visibility: 'internal' }, container);
    expect(container.querySelectorAll('a').length).toBe(0);
    expect(container.textContent).toMatch(/internal/i);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- tests/unit/projects-helpers.test.js`
Expected: 4 new tests FAIL.

- [ ] **Step 3: Implement `renderActionButtons`**

Append to `utils.js`:
```javascript
function renderActionButtons(project, container) {
  const wrap = document.createElement('div');
  wrap.className = 'project-action-buttons';

  if (project.visibility === 'private' || project.visibility === 'internal') {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = project.visibility === 'private'
      ? 'private repo — see case study below'
      : 'internal EPL deployment — case study below';
    wrap.appendChild(note);
    container.appendChild(wrap);
    return;
  }

  if (project.github) {
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = project.github;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'GitHub ↗';
    wrap.appendChild(a);
  }
  if (project.demo) {
    const a = document.createElement('a');
    a.className = 'btn primary';
    a.href = project.demo;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Live demo ↗';
    wrap.appendChild(a);
  }
  container.appendChild(wrap);
}
```

Add `renderActionButtons` to both branches of the dual-export block.

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- tests/unit/projects-helpers.test.js`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add utils.js tests/unit/projects-helpers.test.js
git commit -m "feat: add renderActionButtons with visibility-aware rendering"
```

---

## Task 8: Add `splitBodyByH2` helper

**Files:**
- Create: `tests/unit/project-body-split.test.js`
- Modify: `utils.js`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/project-body-split.test.js`:
```javascript
const { splitBodyByH2 } = require('../../utils');

const sample = `Intro line.

## Why
why prose

## Architecture
arch prose

## CIA
cia prose

## Notes
notes prose`;

describe('splitBodyByH2', () => {
  it('identifies all four expected H2 sections', () => {
    const sections = splitBodyByH2(sample);
    expect(sections.why).toMatch(/why prose/);
    expect(sections.architecture).toMatch(/arch prose/);
    expect(sections.cia).toMatch(/cia prose/);
    expect(sections.notes).toMatch(/notes prose/);
  });

  it('returns empty strings for missing sections without crashing', () => {
    const sections = splitBodyByH2('Just intro, no H2 sections.');
    expect(sections.why).toBe('');
    expect(sections.architecture).toBe('');
    expect(sections.cia).toBe('');
    expect(sections.notes).toBe('');
  });

  it('reports galleryAfter = "architecture" when present', () => {
    const sections = splitBodyByH2(sample);
    expect(sections.galleryAfter).toBe('architecture');
  });

  it('reports galleryAfter = "why" when Architecture is missing but Why is present', () => {
    const md = `## Why\nwhy only\n\n## CIA\ncia`;
    const sections = splitBodyByH2(md);
    expect(sections.galleryAfter).toBe('why');
  });

  it('reports galleryAfter = "top" when both Why and Architecture are missing', () => {
    const md = `Some text only.`;
    const sections = splitBodyByH2(md);
    expect(sections.galleryAfter).toBe('top');
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- tests/unit/project-body-split.test.js`
Expected: All FAIL with `splitBodyByH2 is not a function`.

- [ ] **Step 3: Implement `splitBodyByH2`**

Append to `utils.js`:
```javascript
function splitBodyByH2(content) {
  const out = { why: '', architecture: '', cia: '', notes: '', galleryAfter: 'top' };
  const headings = ['Why', 'Architecture', 'CIA', 'Notes'];
  const keys =     ['why', 'architecture', 'cia', 'notes'];
  const positions = headings.map((h) => {
    const idx = content.search(new RegExp(`^##\\s+${h}\\s*$`, 'm'));
    return { heading: h, idx };
  });
  const present = positions
    .filter((p) => p.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  present.forEach((p, i) => {
    const start = p.idx + content.slice(p.idx).indexOf('\n') + 1;
    const end = i + 1 < present.length ? present[i + 1].idx : content.length;
    const body = content.slice(start, end).trim();
    const key = keys[headings.indexOf(p.heading)];
    out[key] = body;
  });
  if (out.architecture) out.galleryAfter = 'architecture';
  else if (out.why) out.galleryAfter = 'why';
  else out.galleryAfter = 'top';
  return out;
}
```

Add `splitBodyByH2` to both branches of the dual-export block.

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- tests/unit/project-body-split.test.js`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add utils.js tests/unit/project-body-split.test.js
git commit -m "feat: add splitBodyByH2 with gallery placement fallback"
```

---

## Task 9: Add `renderScreenshotGallery` helper

**Files:**
- Create: `tests/unit/project-screenshots.test.js`
- Modify: `utils.js`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/project-screenshots.test.js`:
```javascript
/**
 * @jest-environment jsdom
 */
const { renderScreenshotGallery } = require('../../utils');

describe('renderScreenshotGallery', () => {
  it('renders one figure per screenshot with lazy loading', () => {
    const container = document.createElement('div');
    renderScreenshotGallery(
      [
        { file: 'a.png', caption: 'A' },
        { file: 'b.png', caption: 'B' },
      ],
      'my-slug',
      container
    );
    const figures = container.querySelectorAll('figure');
    expect(figures.length).toBe(2);
    figures.forEach((fig) => {
      expect(fig.querySelector('img').getAttribute('loading')).toBe('lazy');
    });
  });

  it('builds src as projects/images/<slug>/<file>', () => {
    const container = document.createElement('div');
    renderScreenshotGallery([{ file: 'arch.png', caption: 'x' }], 'foo', container);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe('projects/images/foo/arch.png');
  });

  it('renders caption text inside figcaption', () => {
    const container = document.createElement('div');
    renderScreenshotGallery([{ file: 'a.png', caption: 'My caption' }], 'slug', container);
    expect(container.querySelector('figcaption').textContent).toBe('My caption');
  });

  it('renders no figcaption when caption is missing', () => {
    const container = document.createElement('div');
    renderScreenshotGallery([{ file: 'a.png' }], 'slug', container);
    expect(container.querySelector('figcaption')).toBeNull();
    expect(container.querySelector('figure')).not.toBeNull();
  });

  it('skips entries with invalid file extensions', () => {
    const container = document.createElement('div');
    renderScreenshotGallery(
      [
        { file: 'a.png', caption: 'good' },
        { file: 'evil.exe', caption: 'bad' },
      ],
      'slug',
      container
    );
    expect(container.querySelectorAll('figure').length).toBe(1);
  });

  it('renders nothing when screenshots is empty or undefined', () => {
    const container1 = document.createElement('div');
    renderScreenshotGallery([], 'slug', container1);
    expect(container1.children.length).toBe(0);

    const container2 = document.createElement('div');
    renderScreenshotGallery(undefined, 'slug', container2);
    expect(container2.children.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- tests/unit/project-screenshots.test.js`
Expected: All FAIL with `renderScreenshotGallery is not a function`.

- [ ] **Step 3: Implement `renderScreenshotGallery`**

Append to `utils.js`:
```javascript
const SCREENSHOT_EXT_RE = /\.(png|jpg|jpeg|webp|gif)$/i;

function renderScreenshotGallery(screenshots, slug, container) {
  if (!Array.isArray(screenshots) || screenshots.length === 0) return;
  const wrap = document.createElement('div');
  wrap.className = 'project-screenshots';
  screenshots.forEach((shot) => {
    if (!shot || typeof shot.file !== 'string' || !SCREENSHOT_EXT_RE.test(shot.file)) {
      if (typeof console !== 'undefined') console.warn('skip screenshot:', shot);
      return;
    }
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.setAttribute('loading', 'lazy');
    img.setAttribute('src', `projects/images/${slug}/${shot.file}`);
    img.setAttribute('alt', shot.caption || '');
    fig.appendChild(img);
    if (shot.caption) {
      const cap = document.createElement('figcaption');
      cap.className = 'muted';
      cap.textContent = shot.caption;
      fig.appendChild(cap);
    }
    wrap.appendChild(fig);
  });
  if (wrap.children.length > 0) container.appendChild(wrap);
}
```

Add `renderScreenshotGallery` and `SCREENSHOT_EXT_RE` to both branches of the dual-export block (only `renderScreenshotGallery` needs to be exposed; the regex is internal — leave it module-local).

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- tests/unit/project-screenshots.test.js`
Expected: All PASS.

- [ ] **Step 5: Run full suite — no regressions**

Run: `npm test`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add utils.js tests/unit/project-screenshots.test.js
git commit -m "feat: add renderScreenshotGallery with extension validation"
```

---

## Task 10: Author project markdown — Proxmox HA Infrastructure

**Files:**
- Create: `projects/proxmox-ha-infrastructure.md`
- Modify: `projects/index.json`

- [ ] **Step 1: Create the markdown file**

Create `projects/proxmox-ha-infrastructure.md`:
```markdown
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
```

- [ ] **Step 2: Register in `projects/index.json`**

Update `projects/index.json`:
```json
[
  { "slug": "proxmox-ha-infrastructure" }
]
```

- [ ] **Step 3: Run consistency + parsing tests**

Run: `npm test`
Expected: All PASS, including projects-index-consistency.

- [ ] **Step 4: Commit**

```bash
git add projects/proxmox-ha-infrastructure.md projects/index.json
git commit -m "content: add Proxmox HA Infrastructure project"
```

---

## Task 11: Author project markdown — IT Wiki + CMS

**Files:**
- Create: `projects/it-wiki-cms.md`
- Modify: `projects/index.json`

- [ ] **Step 1: Create the markdown file**

Create `projects/it-wiki-cms.md`:
```markdown
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
```

- [ ] **Step 2: Register in `projects/index.json`**

Update `projects/index.json`:
```json
[
  { "slug": "proxmox-ha-infrastructure" },
  { "slug": "it-wiki-cms" }
]
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add projects/it-wiki-cms.md projects/index.json
git commit -m "content: add IT Wiki + CMS project"
```

---

## Task 12: Author project markdown — devops.lucasluize.com

**Files:**
- Create: `projects/devops-lucasluize-com.md`
- Modify: `projects/index.json`

- [ ] **Step 1: Create the markdown file**

Create `projects/devops-lucasluize-com.md`:
```markdown
---
title: "devops.lucasluize.com"
slug: "devops-lucasluize-com"
category: "Infra"
status: "in production"
goal: "Static-hosted DevOps blog and portfolio on private S3 behind CloudFront with HTTPS"
visibility: "public"
date: "2026-05-28"
github: "https://github.com/lucasluize-tech/s3-bucket-landing"
demo: "https://devops.lucasluize.com"
tech_stack:
  - "AWS S3"
  - "CloudFront"
  - "ACM"
  - "Origin Access Control"
  - "Route 53"
  - "GitHub Actions"
  - "Jest"
  - "Playwright"
screenshots: []
---

## Why

I needed a personal site that demonstrates the same patterns I use professionally: private origin, CDN-fronted, automated test gates, idempotent deploy. Off-the-shelf platforms (Vercel, Netlify) abstract away the parts that I actually want to show recruiters I can do.

## Architecture

Static HTML/CSS/JS with markdown blog posts parsed client-side (marked + gray-matter). No build step, no framework — intentional for S3 static hosting and for showing that "vanilla" is still a viable architecture when scope is bounded.

Origin: private S3 bucket. Distribution: CloudFront with Origin Access Control so the bucket is never publicly readable. TLS via ACM certificate. Custom 403/404 error responses patched on the distribution via idempotent AWS-CLI scripts that diff and update only when the ETag has drifted.

CI/CD: GitHub Actions runs Jest unit tests and Playwright e2e tests on every push to `master`. Deploy step syncs to S3, then issues a CloudFront invalidation. Deploy only fires from `master` push events; PRs run tests only.

## CIA

- **Confidentiality:** Not a security-critical site, but the S3 origin is private — bucket policy denies all public access, OAC is the only allowed reader.
- **Integrity:** Unit + e2e tests gate every deploy. Tagged commits, no force-push to master.
- **Availability:** CloudFront global CDN. S3 11-nines durability. Static site has no runtime dependencies that can fail.

## Notes

The carousel + project detail page system you're reading this on was built using the same TDD + spec-driven workflow as the rest of the repo. Spec and plan documents are in `docs/superpowers/`.
```

- [ ] **Step 2: Register**

Update `projects/index.json`:
```json
[
  { "slug": "proxmox-ha-infrastructure" },
  { "slug": "it-wiki-cms" },
  { "slug": "devops-lucasluize-com" }
]
```

- [ ] **Step 3: Test + commit**

Run: `npm test` (expect PASS).
```bash
git add projects/devops-lucasluize-com.md projects/index.json
git commit -m "content: add devops.lucasluize.com project"
```

---

## Task 13: Author project markdown — EPL Magazine Tracker

**Files:**
- Create: `projects/magazine-tracker.md`
- Modify: `projects/index.json`

- [ ] **Step 1: Create the markdown file**

Create `projects/magazine-tracker.md`:
```markdown
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
```

- [ ] **Step 2: Register**

Update `projects/index.json`:
```json
[
  { "slug": "proxmox-ha-infrastructure" },
  { "slug": "it-wiki-cms" },
  { "slug": "devops-lucasluize-com" },
  { "slug": "magazine-tracker" }
]
```

- [ ] **Step 3: Test + commit**

Run: `npm test`.
```bash
git add projects/magazine-tracker.md projects/index.json
git commit -m "content: add EPL Magazine Tracker project"
```

---

## Task 14: Author project markdown — todo-cli-tool

**Files:**
- Create: `projects/todo-cli-tool.md`
- Modify: `projects/index.json`

- [ ] **Step 1: Create the markdown file**

Create `projects/todo-cli-tool.md`:
```markdown
---
title: "todo-cli-tool"
slug: "todo-cli-tool"
category: "Dev Tools"
status: "published"
goal: "Project-aware TODO command-line tool, published to PyPI"
visibility: "public"
date: "2026-02-14"
github: "https://github.com/lucasluize-tech/todo-cli-tool"
demo: "https://pypi.org/project/todo-cli-tool/"
tech_stack:
  - "Python 3.11+"
  - "Typer"
  - "Rich"
  - "Pydantic v2"
  - "PyYAML"
  - "hatchling + uv"
  - "pytest"
  - "ruff"
  - "mypy (strict)"
  - "GitHub Actions"
screenshots: []
---

## Why

I wanted a TODO tool that picked the right list based on which project directory I was sitting in, without having to remember to switch contexts. Existing tools were either too heavy (full task managers) or too dumb (single global file). I also wanted an excuse to publish to PyPI properly with trusted publishing, signed releases, and a real CI matrix.

## Architecture

Single binary CLI built on Typer + Rich for output. State lives in YAML files keyed by the active project directory — detection is "walk up from CWD until you find a marker file or hit `$HOME`." Pydantic v2 schemas validate every read from disk so a hand-edited YAML file can't corrupt the tool.

Packaged with hatchling + uv. Distributed via PyPI with trusted publishing — the GitHub Actions release workflow is tag-triggered, no API tokens stored.

CI matrix runs lint (ruff), type check (mypy strict), and tests (pytest) across Python 3.11, 3.12, and 3.13.

## CIA

- **Confidentiality:** Local-only, no network calls, no telemetry.
- **Integrity:** Pydantic validation on every read. TDD on later features. 188 tests, 84% coverage.
- **Availability:** Distributed via PyPI with trusted publishing — releases reproduce from tags without manual intervention.

## Notes

This was my "learn the Python packaging story properly" project. Trusted publishing eliminates the long-tail risk of a leaked PyPI token.
```

- [ ] **Step 2: Register**

Update `projects/index.json`:
```json
[
  { "slug": "proxmox-ha-infrastructure" },
  { "slug": "it-wiki-cms" },
  { "slug": "devops-lucasluize-com" },
  { "slug": "magazine-tracker" },
  { "slug": "todo-cli-tool" }
]
```

- [ ] **Step 3: Test + commit**

Run: `npm test`.
```bash
git add projects/todo-cli-tool.md projects/index.json
git commit -m "content: add todo-cli-tool project"
```

---

## Task 15: Author project markdown — Agentic Engagement Specialist

**Files:**
- Create: `projects/agentic-engagement-specialist.md`
- Modify: `projects/index.json`

- [ ] **Step 1: Create the markdown file**

Create `projects/agentic-engagement-specialist.md`:
```markdown
---
title: "Agentic Engagement Specialist"
slug: "agentic-engagement-specialist"
category: "Dev Tools"
status: "maintained"
goal: "Multi-agent Claude pipeline that turns work sessions into published blog posts and social content"
visibility: "private"
date: "2026-05-14"
tech_stack:
  - "Node.js"
  - "Claude Code CLI"
  - "Playwright"
  - "personal Twitter/Instagram/LinkedIn CLIs"
  - "GitHub Actions"
screenshots: []
---

## Why

Most of what I learn at work never gets written down. The blog posts on this site that DO exist were the result of forcing myself to sit down after-hours and write them. I wanted a pipeline that would notice an interesting session ended, generate a draft from memory + git history, critique itself, and ship the post — leaving me as the approval gate, not the author of every word.

## Architecture

Three-stage pipeline (Writer → Critic → Deployer), each implemented as a Claude subagent invoked from the orchestrator skill. Writer pulls context from the memory store and git log of the session; Critic runs a tone + accuracy pass tuned to the voice of this blog; Deployer commits, runs CI, and (if the flag is set) generates social cards via a Playwright + HTML/CSS engine and queues posts to LinkedIn, Instagram, and Twitter via personal CLI tools.

Git push is a deliberate manual boundary — the deployer commits, the human pushes. This is the SSH-passphrase trust boundary; no automated agent has the passphrase.

Social cards are rendered HTML/CSS screenshot via Playwright with 5 templates per platform. Brand-consistent with the site itself (same `:root` tokens).

## CIA

- **Confidentiality:** No secrets in the repo. SSH passphrase required for push. Social-media CLIs are auth-bounded by per-tool credentials stored outside the agent's view.
- **Integrity:** Critic stage rejects drafts that fail tone or accuracy checks. Commits are sign-off-able before push.
- **Availability:** Pipeline is deliberately not 24/7; it runs on demand at session-end. Human-in-the-loop by design.

## Notes

This blog post you're reading was almost certainly generated by this pipeline. The system that builds the blog is the same system that builds the posts about it building the blog. Recursion-aware portfolio.
```

- [ ] **Step 2: Register**

Update `projects/index.json`:
```json
[
  { "slug": "proxmox-ha-infrastructure" },
  { "slug": "it-wiki-cms" },
  { "slug": "devops-lucasluize-com" },
  { "slug": "magazine-tracker" },
  { "slug": "todo-cli-tool" },
  { "slug": "agentic-engagement-specialist" }
]
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All PASS. Consistency test covers all 6.

- [ ] **Step 4: Commit**

```bash
git add projects/agentic-engagement-specialist.md projects/index.json
git commit -m "content: add Agentic Engagement Specialist project"
```

---

## Task 16: Create `project.html` shell

**Files:**
- Create: `project.html`

- [ ] **Step 1: Create the file as a structural mirror of post.html**

Create `project.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Project – Lucas Luize</title>
  <meta name="description" content="Project case study." />
  <meta http-equiv="x-ua-compatible" content="IE=edge" />
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-X11D57HZM9"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-X11D57HZM9');
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="post.css">
  <link rel="stylesheet" href="project.css">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gray-matter/index.js"></script>
  <script src="utils.js"></script>
  <script src="project.js"></script>
</head>
<body>
  <div id="progress-bar"></div>
  <div class="wrap">
    <header>
      <a href="/" class="brand">
        <div class="logo">D9</div>
        <div>
          <div style="font-weight:800; font-family: 'Bricolage Grotesque', sans-serif;">Cloud DevOps</div>
          <div class="muted" style="font-size:0.8rem; font-family: 'JetBrains Mono', monospace;">cd /projects</div>
        </div>
      </a>
    </header>

    <article id="project-article">
      <div class="project-header">
        <div class="project-pills"></div>
        <h1 class="project-title">Loading...</h1>
        <p class="project-goal muted">Loading...</p>
        <div class="project-tech"></div>
        <div class="project-actions"></div>
      </div>
      <div class="project-content"></div>
      <a href="/#projects" class="back-to-top">^ back to all projects</a>
    </article>

    <div id="disqus_thread"></div>
    <script>
      var disqus_config = function () {
        this.page.url = window.location.href;
        var slug = new URLSearchParams(window.location.search).get('slug');
        this.page.identifier = 'project-' + slug;
      };
      (function() {
        var d = document, s = d.createElement('script');
        s.src = 'https://devopsd9.disqus.com/embed.js';
        s.setAttribute('data-timestamp', +new Date());
        (d.head || d.body).appendChild(s);
      })();
    </script>
    <noscript>Please enable JavaScript to view the <a href="https://disqus.com/?ref_noscript">comments powered by Disqus.</a></noscript>

    <footer>
      &copy; <span id="y"></span> Cloud DevOps Portfolio
    </footer>
  </div>

  <script>
    document.getElementById('y').textContent = new Date().getFullYear();
    (function() {
      var bar = document.getElementById('progress-bar');
      window.addEventListener('scroll', function() {
        var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        bar.style.width = (docHeight > 0 ? (scrollTop / docHeight) * 100 : 0) + '%';
      });
    })();
  </script>
  <script id="dsq-count-scr" src="//devopsd9.disqus.com/count.js" async></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add project.html
git commit -m "feat: add project.html detail page shell"
```

---

## Task 17: Create `project.css`

**Files:**
- Create: `project.css`

- [ ] **Step 1: Create with structural styles only (visual polish comes in Task 22)**

Create `project.css`:
```css
/* project.css — detail page styles. Inherits base + post.css. */

.wrap { max-width: 880px; }

.project-header { margin-bottom: 32px; padding-top: 16px; }

.project-pills {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.project-title {
  margin: 0 0 8px;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--text-bright);
}

.project-goal {
  margin: 0 0 16px;
  font-size: 1rem;
}

.project-tech {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 16px;
}

.project-tech .tech-list { color: var(--muted); }

.project-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.project-actions .muted { margin: 0; font-style: italic; }

.project-content {
  line-height: 1.85;
  font-size: 1.05rem;
}

.project-content h2 {
  text-transform: none;
  letter-spacing: normal;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-bright);
  margin: 40px 0 16px;
  padding-left: 16px;
  position: relative;
}
.project-content h2::before {
  content: '';
  position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 3px;
  background: var(--accent);
  border-radius: 2px;
}
.project-content p { margin: 0 0 16px; color: var(--text); }

.project-screenshots { display: grid; gap: 24px; margin: 24px 0; }
.project-screenshots figure { margin: 0; }
.project-screenshots img {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  display: block;
}
.project-screenshots figcaption {
  font-size: 0.85rem;
  text-align: center;
  margin-top: 8px;
}

/* Pills + chips shared via styles.css; defined there to be reusable on homepage carousel. */

@media (max-width: 600px) {
  .project-title { font-size: clamp(1.5rem, 4vw, 2rem); }
}
```

- [ ] **Step 2: Commit**

```bash
git add project.css
git commit -m "feat: add project.css with structural styles"
```

---

## Task 18: Implement `project.js`

**Files:**
- Create: `project.js`

- [ ] **Step 1: Create the file**

Create `project.js`:
```javascript
// project.js — Detail page loader and renderer.

function renderProjectHeader(data) {
  document.title = data.title + ' – Lucas Luize';
  document.querySelector('.project-title').textContent = data.title;
  document.querySelector('.project-goal').textContent = data.goal;

  const pills = document.querySelector('.project-pills');
  pills.innerHTML = '';
  renderCategoryTag(data.category, pills);
  renderStatusPill(data.status, pills);

  const techContainer = document.querySelector('.project-tech');
  techContainer.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = 'Tech: ';
  techContainer.appendChild(label);
  renderTechChips(data.tech_stack || [], techContainer, { variant: 'detail' });

  const actions = document.querySelector('.project-actions');
  actions.innerHTML = '';
  renderActionButtons(data, actions);
}

function renderProjectBody(data, content) {
  const sections = splitBodyByH2(content);
  const root = document.querySelector('.project-content');
  root.innerHTML = '';

  function addSection(heading, body) {
    if (!body) return;
    const h = document.createElement('h2');
    h.textContent = heading;
    root.appendChild(h);
    const html = marked.parse(body);
    const div = document.createElement('div');
    div.innerHTML = html;
    while (div.firstChild) root.appendChild(div.firstChild);
  }

  function maybeInjectGallery(after) {
    if (sections.galleryAfter === after) {
      renderScreenshotGallery(data.screenshots, data.slug, root);
    }
  }

  if (sections.galleryAfter === 'top') {
    renderScreenshotGallery(data.screenshots, data.slug, root);
  }

  addSection('Why', sections.why);
  maybeInjectGallery('why');

  addSection('Architecture', sections.architecture);
  maybeInjectGallery('architecture');

  addSection('CIA', sections.cia);
  addSection('Notes', sections.notes);
}

function renderProject(data, content) {
  renderProjectHeader(data);
  renderProjectBody(data, content);
}

async function loadProject(slug) {
  const response = await fetch(`/projects/${slug}.md`);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const md = await response.text();
  const { data, content } = parseMarkdown(md);
  if (!data.slug) data.slug = slug;
  renderProject(data, content);
}

function initProject() {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');
  if (!slug) {
    document.querySelector('.project-title').textContent = 'Project not found';
    document.querySelector('.project-goal').textContent = 'Invalid slug';
    return;
  }
  loadProject(slug).catch((err) => {
    console.error('Error loading project:', err);
    document.querySelector('.project-title').textContent = 'Error loading project';
    document.querySelector('.project-goal').textContent = 'Please try again later';
  });
}

document.addEventListener('DOMContentLoaded', initProject);
```

- [ ] **Step 2: Manually verify in the browser**

Run: `python3 -m http.server 8000` (in another shell).
Open: `http://localhost:8000/project.html?slug=todo-cli-tool`
Expected: page renders title, goal, pills, tech list, GitHub + Demo buttons, then Why/Architecture/CIA/Notes sections from the markdown.

Open: `http://localhost:8000/project.html?slug=agentic-engagement-specialist`
Expected: same shape but with the muted "private repo — see case study below" note instead of buttons.

Kill the server (Ctrl-C) when done.

- [ ] **Step 3: Commit**

```bash
git add project.js
git commit -m "feat: add project.js detail page renderer"
```

---

## Task 19: Update `index.html` skills section

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the 3-card skills section with 4 cards of real content**

In `index.html`, replace the entire `<section id="skills">…</section>` block with:
```html
<section id="skills">
  <h2>Core Skills</h2>
  <div class="grid grid-4">
    <div class="card">
      <h3>Cloud &amp; Containers</h3>
      <ul class="list">
        <li>AWS: EC2, S3, Lambda, RDS, IAM, CloudFront, Route 53, VPC, ACM, OAC</li>
        <li>Docker: multi-stage builds, Compose</li>
        <li>GitOps pull-from-main on production hosts</li>
        <li>Container hardening</li>
      </ul>
    </div>
    <div class="card">
      <h3>Infrastructure &amp; Networking</h3>
      <ul class="list">
        <li>Proxmox VE + LXC + keepalived</li>
        <li>SonicWall TZ680 HA pair (VLANs, DHCP, zones)</li>
        <li>UniFi controller / APs / PoE switches</li>
        <li>Tailscale (exit nodes, ACLs)</li>
        <li>Windows Server (AD / DC / DNS)</li>
      </ul>
    </div>
    <div class="card">
      <h3>Code &amp; Automation</h3>
      <ul class="list">
        <li>Python: Pydantic v2, FastAPI, Typer</li>
        <li>Bash and shell scripting</li>
        <li>Node.js / Next.js</li>
        <li>SQL: Postgres, SQLite</li>
        <li>Cron / scripted reporting</li>
      </ul>
    </div>
    <div class="card">
      <h3>Testing &amp; Quality</h3>
      <ul class="list">
        <li>pytest + hypothesis (property-based)</li>
        <li>Jest + Playwright (e2e)</li>
        <li>mypy strict, ruff</li>
        <li>Coverage gates</li>
        <li>TDD discipline</li>
      </ul>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Smoke-check the homepage**

Run: `python3 -m http.server 8000`
Open: `http://localhost:8000`
Expected: 4 cards render in the Skills section. Layout may overflow until Task 21 adds the `.grid-4` rule — that's fine, content is the priority here.

Kill the server.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: rewrite skills section with 4 real-content cards"
```

---

## Task 20: Update `index.html` projects section (carousel container)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the 3 fake project cards with a carousel container**

In `index.html`, replace the entire `<section id="projects">…</section>` block with:
```html
<section id="projects" aria-label="Featured projects">
  <h2>Featured Projects</h2>
  <div id="projects-carousel" role="region" aria-label="Project carousel" tabindex="0">
    <!-- cards rendered by index.js -->
  </div>
  <div id="projects-dots" class="pagination-dots" aria-hidden="true"></div>
</section>
```

- [ ] **Step 2: Smoke check**

Run: `python3 -m http.server 8000` and open homepage.
Expected: Section header renders, carousel container is empty (rendering comes in Task 21). No JS errors in console.

Kill the server.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: replace fake project cards with carousel container shell"
```

---

## Task 21: Implement carousel rendering in `index.js` + carousel CSS

**Files:**
- Modify: `index.js`
- Modify: `styles.css`

- [ ] **Step 1: Add `loadProjects`, `renderProjectCarousel`, `attachCarouselDots` to `index.js`**

Append to `index.js` (above the `document.addEventListener('DOMContentLoaded', initIndex)` line):
```javascript
// ─── Projects ───
async function loadProjects() {
  const response = await fetch('/projects/index.json');
  const registry = await response.json();
  const promises = registry.map(async (entry) => {
    const res = await fetch(`/projects/${entry.slug}.md`);
    const md = await res.text();
    const parsed = parseMarkdown(md);
    if (!parsed.data.slug) parsed.data.slug = entry.slug;
    return parsed;
  });
  const projectData = await Promise.all(promises);
  return projectData.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
}

function renderProjectCard({ data }) {
  const a = document.createElement('a');
  a.className = 'project-card';
  a.href = `/project.html?slug=${data.slug}`;

  const pills = document.createElement('div');
  pills.className = 'project-card-pills';
  renderCategoryTag(data.category, pills);
  renderStatusPill(data.status, pills);
  a.appendChild(pills);

  const title = document.createElement('h3');
  title.className = 'project-title';
  title.textContent = data.title;
  a.appendChild(title);

  const goal = document.createElement('p');
  goal.className = 'project-goal';
  goal.textContent = data.goal;
  a.appendChild(goal);

  renderTechChips(data.tech_stack || [], a, { variant: 'card' });

  const cta = document.createElement('div');
  cta.className = 'project-card-cta muted';
  cta.textContent = 'view case study →';
  a.appendChild(cta);

  return a;
}

function renderProjectCarousel(projects, container) {
  container.innerHTML = '';
  projects.forEach((p) => container.appendChild(renderProjectCard(p)));
}

function attachCarouselDots(container, dotsContainer, count) {
  dotsContainer.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.textContent = '●';
    dotsContainer.appendChild(dot);
  }
  const cards = Array.from(container.querySelectorAll('.project-card'));
  if (cards.length === 0) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
        const idx = cards.indexOf(entry.target);
        if (idx >= 0) {
          dotsContainer.querySelectorAll('.dot').forEach((d, i) => {
            d.classList.toggle('active', i === idx);
          });
        }
      }
    });
  }, { root: container, threshold: [0.6] });
  cards.forEach((c) => observer.observe(c));
}
```

- [ ] **Step 2: Wire `loadProjects` into `initIndex`**

In `index.js`, find `async function initIndex()` and add project loading in parallel with posts loading. Insert near the top of the function (right after the existing posts-related variable declarations):

```javascript
  // Load projects in parallel
  const carouselContainer = document.getElementById('projects-carousel');
  const dotsContainer = document.getElementById('projects-dots');
  if (carouselContainer) {
    loadProjects()
      .then((projects) => {
        renderProjectCarousel(projects, carouselContainer);
        attachCarouselDots(carouselContainer, dotsContainer, projects.length);
      })
      .catch((err) => {
        console.error('Error loading projects:', err);
        carouselContainer.textContent = 'Error loading projects.';
      });
  }
```

- [ ] **Step 3: Add the carousel + card + pill + chip CSS to `styles.css`**

Append to `styles.css`:
```css
/* ─── Skills 4-col grid ─── */
@media (min-width: 1101px) {
  .grid.grid-4 { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 1100px) and (min-width: 701px) {
  .grid.grid-4 { grid-template-columns: repeat(2, 1fr); }
}

/* ─── Projects carousel ─── */
#projects-carousel {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  padding: 4px 4px 16px;
  -webkit-overflow-scrolling: touch;
}
#projects-carousel::-webkit-scrollbar { display: none; }

#projects-dots {
  justify-content: center;
  margin-top: 4px;
}

.project-card {
  scroll-snap-align: start;
  flex: 0 0 320px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.project-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(167, 139, 250, 0.08);
  border-left-color: var(--secondary);
  color: var(--text);
  text-decoration: none;
}
.project-card-pills { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.project-card .project-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-bright);
}
.project-card .project-goal {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.5;
}
.project-card .tech-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: auto;
}
.project-card-cta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  margin-top: 6px;
}

/* ─── Category tag + status pill ─── */
.category-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  color: var(--muted);
}
.status-pill {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.status-pill.status-production  { color: var(--success); }
.status-pill.status-published   { color: var(--accent); }
.status-pill.status-maintained  { color: var(--secondary); }
.status-pill.status-archived    { color: var(--muted); }

/* ─── Tech chips ─── */
.tech-chip {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--code-bg);
  color: var(--muted);
  border: 1px solid var(--border-subtle);
}

/* ─── Mobile: full-width project cards ─── */
@media (max-width: 900px) {
  .project-card { flex: 0 0 min(85vw, 360px); }
}
```

- [ ] **Step 4: Update `#projects h2::after` label**

Find in `styles.css`:
```css
#projects h2::after {
  content: '[deployed]';
```
Change to:
```css
#projects h2::after {
  content: '[6 active]';
```

- [ ] **Step 5: Smoke-check the homepage**

Run: `python3 -m http.server 8000` and open `http://localhost:8000`.
Expected: Skills section shows 4 cards. Projects section shows 6 cards in a horizontal scroll-snap row with pagination dots beneath. Clicking a card navigates to `/project.html?slug=...` and the detail page renders.

Kill the server.

- [ ] **Step 6: Run full unit suite — no regressions**

Run: `npm test`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add index.js styles.css
git commit -m "feat: implement projects carousel + skills 4-col + pill/chip styles"
```

---

## Task 22: Visual polish via `ui-ux-pro-max`

**Files:**
- Modify (likely): `styles.css`, `project.css`, possibly `index.html`, `project.html`

- [ ] **Step 1: Invoke the skill with a focused brief**

Invoke `ui-ux-pro-max:ui-ux-pro-max` via the Skill tool with this brief:

> Polish the visual layer of the new project card components and project detail page on the devops.lucasluize.com portfolio site. Existing design tokens are in `styles.css :root`: violet `#a78bfa`, orange `#f97316`, dark surfaces, Bricolage Grotesque / DM Sans / JetBrains Mono. Maintain consistency with the existing post detail page (`post.css`) and skill cards.
>
> Focus areas:
> - Project carousel card spacing rhythm, hover micro-interaction, status-pill treatment (currently a flat outline ring; could be more interesting), category tag, tech-chip treatment.
> - Detail page header — pill + title + goal + tech list + action buttons — currently functional but flat.
> - Screenshot gallery — empty state needs to feel intentional (since most projects have no screenshots yet); when present, gallery should feel deliberate, not pasted-in.
> - Carousel pagination dots — currently `●` glyphs reused from posts; may want something more distinctive for project navigation.
>
> Constraints:
> - Do NOT change DOM structure or class names (e2e tests depend on them — see `tests/e2e/projects-carousel.test.js`, `tests/e2e/project-detail.test.js` once written).
> - Do NOT introduce new fonts.
> - Do NOT add new dependencies (no Tailwind, no CSS-in-JS, no build tools).
> - Output CSS additions/edits to `styles.css` and `project.css`.

- [ ] **Step 2: Iterate via the skill until satisfied**

Apply the skill's suggested edits via Edit/Write. Run `python3 -m http.server 8000` between iterations to visually verify in the browser.

- [ ] **Step 3: Run all tests — make sure polish didn't break selectors**

Run: `npm test && npm run test:e2e`
Expected: All PASS. If a polish change broke a selector, revert that change and stick to CSS-only polish.

- [ ] **Step 4: Commit**

```bash
git add styles.css project.css index.html project.html
git commit -m "style: ui-ux-pro-max polish for project cards + detail page"
```

---

## Task 23: Write e2e test for project detail page

**Files:**
- Create: `tests/e2e/project-detail.test.js`

- [ ] **Step 1: Write the test**

Create `tests/e2e/project-detail.test.js`:
```javascript
const { test, expect } = require('@playwright/test');
const { exec, execSync } = require('child_process');
const path = require('path');

test.describe('Project detail page', () => {
  let server;

  test.beforeAll(async () => {
    try { execSync('pkill -f "python3 -m http.server 8000" || true'); } catch (e) {}
    const projectRoot = path.join(__dirname, '..', '..');
    server = exec('python3 -m http.server 8000', { cwd: projectRoot });
    await new Promise((resolve) => setTimeout(resolve, 4000));
  });

  test.afterAll(() => { if (server) server.kill(); });

  test('renders title, goal, pills, tech list, and action buttons for a public project', async ({ page }) => {
    await page.goto('http://localhost:8000/project.html?slug=todo-cli-tool');
    await expect(page.locator('.project-title')).toContainText('todo-cli-tool');
    await expect(page.locator('.project-goal')).toContainText('Project-aware');
    await expect(page.locator('.project-pills .category-tag')).toContainText('Dev Tools');
    await expect(page.locator('.project-pills .status-pill')).toContainText('published');
    await expect(page.locator('.project-tech .tech-list')).toContainText('Python');
    await expect(page.locator('.project-actions a').first()).toHaveAttribute('href', /github\.com/);
  });

  test('hides action buttons and shows muted note for private project', async ({ page }) => {
    await page.goto('http://localhost:8000/project.html?slug=agentic-engagement-specialist');
    await expect(page.locator('.project-actions a')).toHaveCount(0);
    await expect(page.locator('.project-actions .muted')).toContainText(/private repo/i);
  });

  test('hides action buttons and shows internal note for internal project', async ({ page }) => {
    await page.goto('http://localhost:8000/project.html?slug=proxmox-ha-infrastructure');
    await expect(page.locator('.project-actions a')).toHaveCount(0);
    await expect(page.locator('.project-actions .muted')).toContainText(/internal/i);
  });

  test('renders body sections from markdown', async ({ page }) => {
    await page.goto('http://localhost:8000/project.html?slug=todo-cli-tool');
    const content = page.locator('.project-content');
    await expect(content.locator('h2', { hasText: 'Why' })).toBeVisible();
    await expect(content.locator('h2', { hasText: 'Architecture' })).toBeVisible();
    await expect(content.locator('h2', { hasText: 'CIA' })).toBeVisible();
  });

  test('handles invalid slug gracefully', async ({ page }) => {
    await page.goto('http://localhost:8000/project.html?slug=does-not-exist');
    await expect(page.locator('.project-title')).toContainText(/Error|not found/);
  });
});
```

- [ ] **Step 2: Run, confirm pass**

Run: `npm run test:e2e -- tests/e2e/project-detail.test.js`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/project-detail.test.js
git commit -m "test: e2e for project detail rendering and visibility branches"
```

---

## Task 24: Write e2e test for projects carousel

**Files:**
- Create: `tests/e2e/projects-carousel.test.js`

- [ ] **Step 1: Write the test**

Create `tests/e2e/projects-carousel.test.js`:
```javascript
const { test, expect } = require('@playwright/test');
const { exec, execSync } = require('child_process');
const path = require('path');

test.describe('Projects carousel', () => {
  let server;

  test.beforeAll(async () => {
    try { execSync('pkill -f "python3 -m http.server 8000" || true'); } catch (e) {}
    const projectRoot = path.join(__dirname, '..', '..');
    server = exec('python3 -m http.server 8000', { cwd: projectRoot });
    await new Promise((resolve) => setTimeout(resolve, 4000));
  });

  test.afterAll(() => { if (server) server.kill(); });

  test('renders 6 project cards', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    const cards = page.locator('#projects-carousel .project-card');
    await expect(cards).toHaveCount(6);
  });

  test('each card is a clickable anchor with /project.html?slug=... href', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    const firstCard = page.locator('#projects-carousel .project-card').first();
    await expect(firstCard).toHaveAttribute('href', /\/project\.html\?slug=.+/);
  });

  test('clicking a card navigates to detail page', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    await page.locator('#projects-carousel .project-card').first().click();
    await page.waitForURL(/project\.html\?slug=.+/);
    await expect(page.locator('.project-title')).toBeVisible();
  });

  test('renders 6 pagination dots with first active', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-dots .dot');
    const dots = page.locator('#projects-dots .dot');
    await expect(dots).toHaveCount(6);
    await expect(dots.nth(0)).toHaveClass(/active/);
  });

  test('each card renders category tag, status pill, title, goal, tech chips', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    const card = page.locator('#projects-carousel .project-card').first();
    await expect(card.locator('.category-tag')).toBeVisible();
    await expect(card.locator('.status-pill')).toBeVisible();
    await expect(card.locator('.project-title')).toBeVisible();
    await expect(card.locator('.project-goal')).toBeVisible();
    await expect(card.locator('.tech-chip').first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run, confirm pass**

Run: `npm run test:e2e -- tests/e2e/projects-carousel.test.js`
Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/projects-carousel.test.js
git commit -m "test: e2e for projects carousel rendering and navigation"
```

---

## Task 25: Write e2e accessibility test for projects

**Files:**
- Create: `tests/e2e/projects-accessibility.test.js`

- [ ] **Step 1: Write the test**

Create `tests/e2e/projects-accessibility.test.js`:
```javascript
const { test, expect } = require('@playwright/test');
const { exec, execSync } = require('child_process');
const path = require('path');

test.describe('Projects accessibility', () => {
  let server;

  test.beforeAll(async () => {
    try { execSync('pkill -f "python3 -m http.server 8000" || true'); } catch (e) {}
    const projectRoot = path.join(__dirname, '..', '..');
    server = exec('python3 -m http.server 8000', { cwd: projectRoot });
    await new Promise((resolve) => setTimeout(resolve, 4000));
  });

  test.afterAll(() => { if (server) server.kill(); });

  test('carousel has role=region and tabindex=0', async ({ page }) => {
    await page.goto('http://localhost:8000');
    const carousel = page.locator('#projects-carousel');
    await expect(carousel).toHaveAttribute('role', 'region');
    await expect(carousel).toHaveAttribute('tabindex', '0');
  });

  test('section has accessible name', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await expect(page.locator('#projects')).toHaveAttribute('aria-label', /projects/i);
  });

  test('project cards are real anchors (not div onclick)', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .project-card');
    const cards = page.locator('#projects-carousel .project-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const tag = await cards.nth(i).evaluate((el) => el.tagName);
      expect(tag).toBe('A');
    }
  });

  test('status pills have semantic text content for screen readers', async ({ page }) => {
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#projects-carousel .status-pill');
    const pill = page.locator('#projects-carousel .status-pill').first();
    const text = (await pill.textContent()).toLowerCase();
    expect(['in production', 'published', 'maintained', 'archived']).toContain(text.trim());
  });
});
```

- [ ] **Step 2: Run, confirm pass**

Run: `npm run test:e2e -- tests/e2e/projects-accessibility.test.js`
Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/projects-accessibility.test.js
git commit -m "test: e2e accessibility checks for projects section"
```

---

## Task 26: Apply CI/CD optimizations

**Files:**
- Modify: `.github/workflows/ci-cd.yml`

- [ ] **Step 1: Rewrite the workflow file with all 7 optimizations**

Replace the contents of `.github/workflows/ci-cd.yml` with:
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    - name: Install dependencies
      run: npm ci
    - uses: actions/cache@v4
      id: playwright-cache
      with:
        path: ~/.cache/ms-playwright
        key: pw-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    - name: Install Playwright browsers
      if: steps.playwright-cache.outputs.cache-hit != 'true'
      run: npx playwright install --with-deps
    - name: Run unit tests
      run: npm test
    - name: Run e2e tests
      run: npm run test:e2e
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: |
          playwright-report/
          test-results/
        retention-days: 14

  deploy:
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: production
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    concurrency:
      group: deploy-master
      cancel-in-progress: false
    steps:
    - uses: actions/checkout@v4
    - name: Configure AWS
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    - name: Sync to S3
      run: |
        aws s3 sync . s3://${{ secrets.AWS_S3_BUCKET }} --delete \
          --exclude "node_modules/*" \
          --exclude ".git/*" \
          --exclude ".github/*" \
          --exclude "tests/*" \
          --exclude "docs/*" \
          --exclude ".gitignore" \
          --exclude "package.json" \
          --exclude "package-lock.json" \
          --exclude "skills-lock.json"
    - name: Invalidate CloudFront
      run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"
```

- [ ] **Step 2: Validate YAML locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd.yml'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-cd.yml
git commit -m "ci: optimize workflow (Node 20, npm + playwright cache, concurrency, timeout, artifacts, docs exclude)"
```

---

## Task 27: Update CLAUDE.md with new critical selectors

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Extend the `Don't change e2e test selectors` line in CLAUDE.md**

Find in `CLAUDE.md`:
```
- Don't change e2e test selectors without updating both CSS and `tests/e2e/blog.test.js` — critical selectors: `#posts-list .card`, `#pagination-controls`, `.dot.active`, `.pagination-arrows button`, `#search-input`, `h1.post-title`, `.post-content`, `#share-twitter`
```

Replace with:
```
- Don't change e2e test selectors without updating both CSS and the corresponding `tests/e2e/*.test.js` file — critical selectors: `#posts-list .card`, `#pagination-controls`, `.dot.active`, `.pagination-arrows button`, `#search-input`, `h1.post-title`, `.post-content`, `#share-twitter`, `#projects-carousel`, `#projects-carousel .project-card`, `.project-card .category-tag`, `.project-card .status-pill`, `.project-card .tech-chips`, `.project-card .project-title`, `.project-card .project-goal`, `#projects-dots .dot`, `#project-article`, `.project-header`, `.project-pills`, `.project-tech`, `.project-actions`, `.project-content`, `.project-screenshots`
```

- [ ] **Step 2: Verify CLAUDE.md still renders cleanly**

Run: `head -80 CLAUDE.md`
Expected: First 80 lines render, no broken markdown.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: register new project selectors in CLAUDE.md guard list"
```

---

## Task 28: Full-suite final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: All PASS, including existing posts tests, projects-index-consistency, projects-parsing, projects-helpers, project-body-split, project-screenshots.

- [ ] **Step 2: Run all e2e tests**

Run: `npm run test:e2e`
Expected: All PASS, including existing blog tests, projects-carousel, project-detail, projects-accessibility.

- [ ] **Step 3: Manual smoke in the browser**

Run: `python3 -m http.server 8000`
Open: `http://localhost:8000`
Check:
- 4 skill cards render with real content.
- 6 project cards in horizontal scroll-snap carousel.
- Pagination dots visible, first active.
- Click first card → routes to `/project.html?slug=...`.
- Detail page renders pills, title, goal, tech, action buttons, markdown body.
- Click a private-visibility project → no GitHub button, muted note instead.
- Posts section still renders normally (no regression).

Kill the server.

- [ ] **Step 4: If everything passes, tag a checkpoint commit**

```bash
git log --oneline -10
```

No new commit needed — this task is verification only. If any check fails, fix in a new commit referencing the broken step.

---

## Self-Review

**Spec coverage check** (every spec section maps to at least one task):

- §1 Goals — covered across all tasks.
- §2 Information Architecture — Tasks 1, 16–18.
- §3 Content Model + front-matter — Task 3 (validation), Tasks 10–15 (authoring).
- §4 Homepage UI — Tasks 19 (skills), 20–21 (projects carousel), 22 (polish).
- §5 Detail Page UI — Tasks 16–18 (shell + JS), 22 (polish).
- §6 JS Architecture — Tasks 5–9, 18, 21.
- §7 Security (informational only) — no tasks per user direction.
- §8 Testing Strategy — Tasks 2, 3, 5–9 (unit), 23–25 (e2e).
- §9 CI/CD — Task 26.
- §10 Migration — entire plan is the migration; ordering matches §10 step list.
- §11 Out of scope — respected (no screenshot content, no security mitigations, no Job Search project).

**Placeholder scan:** No "TBD", "TODO", "implement later", or "similar to Task N" references. Every code block contains full content.

**Type consistency:** Helper names (`renderCategoryTag`, `renderStatusPill`, `renderTechChips`, `renderActionButtons`, `splitBodyByH2`, `renderScreenshotGallery`, `validateProject`) used consistently across all tasks. Card class names (`.project-card`, `.category-tag`, `.status-pill`, `.tech-chip`, `.tech-chips`, `.project-card-pills`, `.project-card-cta`) used consistently between Tasks 19–21 and the e2e tests in 23–25. Status class map (`status-production` / `status-published` / `status-maintained` / `status-archived`) consistent between Task 5 implementation and CSS in Task 21.

**Spec items added or revised after plan-write:** None — plan matches spec as written.
