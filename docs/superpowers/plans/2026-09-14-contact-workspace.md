# Contact Workspace (mail composer + SES backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the contact stub with a NeoMutt-style composer and shell commands sharing one draft state, delivered for real through CloudFront -> Lambda -> SES.

**Architecture:** A tiny ES-module draft singleton (`app/draft.js`) is imported by both the prompt engine (global) and the composer (contact page), so CLI and form are two views of one state machine. The build emits a static `contactPane()` (finger pane + compose form); `submitDraft()` POSTs to `/api/contact`, a new CloudFront behavior on the existing distribution fronting an OAC-locked Lambda Function URL that relays via SES.

**Tech Stack:** Vanilla ES modules (no new deps), Jest 30, Playwright 1.57, AWS CLI idempotent bash, Lambda Node 22 + AWS SDK v3 (preinstalled in runtime), SES v2.

**Spec:** `docs/superpowers/specs/2026-09-14-contact-workspace-design.md`

## Global Constraints

- No frameworks, no new runtime package dependencies; browser loads plain ES modules from `app/`.
- Build modules are CommonJS `.js`; app modules are ESM.
- E2E locator policy: `getByRole`/`getByLabel`/`getByText` only; counts from manifest, never hardcoded.
- Commit format: `action: description` only. No Co-Authored-By or session lines.
- Never use the em dash in any copy or code; plain dash only.
- No CSS transitions on text color/opacity (axe on slow CI scans mid-fade and fails AA).
- No secrets in the repo. The infra script reads only public identifiers (distribution id, region, function name).
- Verification after every task: `npm test`, then `npm run test:e2e`.
- The permission classifier in this environment blocks IAM/infra mutations for agents: Task 7's script is RUN BY THE USER (`! bash ...`); agents only write and lint it.

---

### Task 1: Draft engine (`app/draft.js`)

**Files:**
- Create: `app/draft.js`
- Test: `tests/unit/draft.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (used by Tasks 3, 4, 5):
  - `getDraft() -> { name, email, subject, message }` (always strings)
  - `updateDraft(patch, source) -> void` - shallow-merges known keys only, notifies subscribers `(draft, source)`; `source` is `'form' | 'shell' | 'system'`
  - `resetDraft(source) -> void`
  - `subscribeDraft(fn) -> unsubscribe()`
  - `validateDraft(d) -> string[]` - terminal-style error lines, `[]` when valid
  - `draftLines(d) -> string[]` - printable `From:/Subject:/...` block for the `draft` command
  - `DRAFT_LIMITS = { name: 100, email: 200, subject: 150, message: 2000 }`
  - `EMAIL_RE` (moved here from prompt.js so client + tests share one copy)

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/draft.test.js
import {
  getDraft, updateDraft, resetDraft, subscribeDraft,
  validateDraft, draftLines, DRAFT_LIMITS,
} from '../../app/draft.js';

beforeEach(() => resetDraft('system'));

test('updateDraft merges known fields and notifies with source', () => {
  const seen = [];
  const off = subscribeDraft((d, source) => seen.push([d.subject, source]));
  updateDraft({ subject: 'SRE role', bogus: 'x' }, 'shell');
  expect(getDraft().subject).toBe('SRE role');
  expect(getDraft()).not.toHaveProperty('bogus');
  expect(seen).toEqual([['SRE role', 'shell']]);
  off();
  updateDraft({ subject: 'other' }, 'form');
  expect(seen).toHaveLength(1); // unsubscribed
});

test('resetDraft clears all fields', () => {
  updateDraft({ name: 'Jane', message: 'hi' }, 'form');
  resetDraft('shell');
  expect(getDraft()).toEqual({ name: '', email: '', subject: '', message: '' });
});

test('validateDraft names the missing field and the set fix', () => {
  const errs = validateDraft({ name: 'Jane', email: '', subject: 's', message: 'm' });
  expect(errs.some((l) => l.includes('set email'))).toBe(true);
  expect(validateDraft({ name: 'J', email: 'j@co.com', subject: 's', message: 'm' })).toEqual([]);
});

test('validateDraft rejects bad email and over-limit message', () => {
  expect(validateDraft({ name: 'J', email: 'nope', subject: 's', message: 'm' })
    .some((l) => l.includes('valid email'))).toBe(true);
  const long = 'x'.repeat(DRAFT_LIMITS.message + 1);
  expect(validateDraft({ name: 'J', email: 'j@co.com', subject: 's', message: long })
    .some((l) => l.includes('too long'))).toBe(true);
});

test('draftLines renders a mail header block', () => {
  updateDraft({ name: 'Jane', email: 'j@co.com', subject: 'SRE', message: 'Hi' }, 'form');
  const lines = draftLines(getDraft());
  expect(lines[0]).toBe('From: Jane <j@co.com>');
  expect(lines).toContain('To: lucas@devops');
  expect(lines).toContain('Subject: SRE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/draft.test.js`
Expected: FAIL - cannot find module `../../app/draft.js`.

- [ ] **Step 3: Write the implementation**

```js
// app/draft.js - one contact draft, two surfaces (composer form + shell).
// ES-module singleton: prompt.js and compose.js import the same instance,
// so the draft survives pjax navigation and both UIs stay in sync.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DRAFT_LIMITS = { name: 100, email: 200, subject: 150, message: 2000 };
const FIELDS = ['name', 'email', 'subject', 'message'];

let draft = { name: '', email: '', subject: '', message: '' };
const subs = new Set();

export function getDraft() { return { ...draft }; }

export function updateDraft(patch, source) {
  for (const k of FIELDS) if (typeof patch[k] === 'string') draft[k] = patch[k];
  const snap = getDraft();
  for (const fn of subs) fn(snap, source);
}

export function resetDraft(source) {
  draft = { name: '', email: '', subject: '', message: '' };
  const snap = getDraft();
  for (const fn of subs) fn(snap, source);
}

export function subscribeDraft(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Terminal-style validation lines; [] means sendable. Copy per spec:
// name the field AND the shell fix so errors teach the interface.
export function validateDraft(d) {
  const errs = [];
  if (!d.name.trim()) errs.push('x name is required. set it with: set name Jane Smith');
  if (!d.email.trim()) errs.push('x from address is required. set it with: set email you@example.com');
  else if (!EMAIL_RE.test(d.email.trim())) errs.push("x that doesn't look like a valid email. fix it with: set email you@example.com");
  if (!d.subject.trim()) errs.push('x subject is required. set it with: set subject hello');
  if (!d.message.trim()) errs.push('x message is empty. set it with: set message ...');
  for (const [k, max] of Object.entries(DRAFT_LIMITS)) {
    if (d[k] && d[k].length > max) errs.push(`x ${k} too long (max ${max} chars, got ${d[k].length}).`);
  }
  return errs;
}

export function draftLines(d) {
  return [
    `From: ${d.name || '(unset)'} <${d.email || 'unset@nowhere'}>`,
    'To: lucas@devops',
    `Subject: ${d.subject || '(no subject)'}`,
    '',
    d.message || '(empty message)',
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/draft.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Full verification and commit**

Run: `npm test` (all green), then:

```bash
git add app/draft.js tests/unit/draft.test.js
git commit -m "feat: shared contact draft engine - one state, form and shell surfaces"
```

(e2e unaffected - nothing imports draft.js yet; still run `npm run test:e2e` once before commit per verification rule.)

---

### Task 2: Contact page pane (`contactPane()`) + CSS

**Files:**
- Modify: `scripts/lib/pages.js` (add `contactPane()` + `fingerPane()` near `aboutPane()`, export `contactPane`)
- Modify: `scripts/build-content.js` (contact corePage: replace inline stub pane with `contactPane()`; add `contactPane` to the require list at the top)
- Modify: `app/terminal.css` (contact workspace styles, appended after the telescope block)
- Test: `tests/unit/build-output.test.js` (append one test)

**Interfaces:**
- Consumes: nothing new.
- Produces: static DOM contract Task 3 wires to:
  - `<form data-compose aria-label="compose message">` containing inputs
    `#cf-name`, `#cf-email` (type=email), `#cf-subject`, textarea `#cf-message`,
    each with a visible `<label for=...>`; honeypot `<input name="website" data-cf-hp>`;
    submit `<button type="submit">send ⏎</button>`;
    status bar `<p class="cf-status" data-cf-status aria-live="polite">`.
  - Finger pane `<aside class="finger" aria-label="finger lucas">`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/build-output.test.js`:

```js
test('contact page ships the finger pane and an accessible compose form', () => {
  const html = fs.readFileSync('dist/contact.html', 'utf8');
  expect(html).toContain('data-compose');
  for (const id of ['cf-name', 'cf-email', 'cf-subject', 'cf-message']) {
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(`id="${id}"`);
  }
  expect(html).toContain('finger lucas');
  expect(html).toContain('data-cf-hp');   // honeypot present
  expect(html).toContain('via AWS SES');  // status bar transport line
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx jest tests/unit/build-output.test.js`
Expected: FAIL - dist/contact.html still contains the old mailto stub.

- [ ] **Step 3: Implement contactPane() in pages.js**

Add after `aboutPane()` (career facts match aboutPane; links reuse the same
URLs used at pages.js:344-345):

```js
// Contact workspace: finger(1) identity pane + mutt-style compose pane.
// The form is real and accessible; app/compose.js binds it to the shared
// draft so shell commands (set/draft/send) manipulate the same state.
function fingerPane() {
  return `<aside class="finger" aria-label="finger lucas">
<p class="finger-cmd">$ finger lucas</p>
<p class="finger-name">Lucas Luize</p>
<p class="finger-role">Cloud DevOps Engineer</p>
<p class="finger-loc">Tampa, FL - remote friendly</p>
<ul class="finger-links">
<li><a href="https://github.com/lucasluize-tech" rel="noopener">github</a></li>
<li><a href="https://linkedin.com/in/lucasluize" rel="noopener">linkedin</a></li>
<li><a href="mailto:me@lucasluize.com">me@lucasluize.com</a></li>
</ul>
<p class="finger-status"><span class="snap-dot" aria-hidden="true">●</span> accepting mail</p>
</aside>`;
}

function contactPane() {
  const field = (id, label, type) => `<div class="cf-row">
<label for="cf-${id}">${label}</label>
<input id="cf-${id}" name="${id}" type="${type}" autocomplete="off" spellcheck="false" maxlength="200">
</div>`;
  return `<h1 class="tl-h1"><span class="tl-h1-tilde">~/</span>contact</h1>
<section class="contact-grid">
${fingerPane()}
<form data-compose aria-label="compose message" novalidate>
<p class="cf-title" aria-hidden="true">compose</p>
${field('name', 'Name', 'text')}
${field('email', 'From', 'email')}
${field('subject', 'Subject', 'text')}
<div class="cf-row cf-row-msg">
<label for="cf-message">Message</label>
<textarea id="cf-message" name="message" rows="8" maxlength="2000"></textarea>
</div>
<input name="website" data-cf-hp tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="cf-bar">
<p class="cf-status" data-cf-status aria-live="polite">● draft - via AWS SES</p>
<button type="submit" class="cf-send">send ⏎</button>
</div>
</form>
</section>`;
}
```

Export it (`module.exports` block at the bottom of pages.js: add `contactPane`).
In `scripts/build-content.js`, add `contactPane` to the destructured require
and change the contact corePage:

```js
  corePage('contact.html', {
    title: 'Contact - Lucas Luize', bodyClass: 'page-contact', active: 'contact.html',
    description: 'Get in touch with Lucas Luize.',
    pane: contactPane(),
  });
```

- [ ] **Step 4: Add CSS to app/terminal.css**

Append after the telescope section (uses existing tokens only; no text
color/opacity transitions):

```css
/* ---- Contact workspace: finger(1) + mutt compose ------------------- */
.contact-grid {
  display: grid;
  grid-template-columns: minmax(0, 34%) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.finger, form[data-compose] {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 18px;
  background: color-mix(in srgb, var(--surface) 35%, transparent);
}
.finger-cmd { margin: 0 0 12px; color: var(--success); font-size: 12px; }
.finger-name { margin: 0; color: var(--text-bright); font-weight: 700; }
.finger-role { margin: 0 0 8px; color: var(--secondary); font-size: 13px; }
.finger-loc { margin: 0 0 12px; color: var(--muted); font-size: 12.5px; }
.finger-links { list-style: none; margin: 0 0 14px; padding: 0; font-size: 13px; }
.finger-links li { padding: 2px 0; }
.finger-links a { color: var(--link); }
.finger-status { margin: 0; font-size: 12.5px; color: var(--text); }
.finger-status .snap-dot { color: var(--success); }
.cf-title {
  margin: 0 0 12px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.cf-row { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 10px; margin: 0 0 8px; align-items: baseline; }
.cf-row label { color: var(--muted); font-size: 12.5px; }
.cf-row input, .cf-row textarea {
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: color-mix(in srgb, var(--bg) 60%, transparent);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 5px 9px;
  min-width: 0;
  caret-color: var(--accent);
}
.cf-row input:focus-visible, .cf-row textarea:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-glow);
}
.cf-row-msg { border-top: 1px solid var(--border-subtle); padding-top: 10px; }
.cf-row textarea { resize: vertical; }
form[data-compose] [data-cf-hp] { position: absolute; left: -9999px; width: 1px; height: 1px; }
.cf-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
}
.cf-status { margin: 0; font-size: 12px; color: var(--secondary); }
.cf-status.cf-ok { color: var(--success); }
.cf-status.cf-err { color: var(--red); }
.cf-send {
  font: inherit;
  font-size: 12.5px;
  padding: 4px 12px;
  color: var(--accent-bright);
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}
.cf-send:hover { border-color: var(--accent); }
.cf-send:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-glow); }
.cf-sent { font-size: 13px; }
.cf-sent .cf-sent-head { color: var(--success); font-weight: 700; margin: 0 0 10px; }
.cf-sent dl { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 2px 10px; margin: 0 0 12px; }
.cf-sent dt { color: var(--muted); }
.cf-sent dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .contact-grid { grid-template-columns: minmax(0, 1fr); }
}
```

Note: verify `--red` exists in `:root` (used by prompt errors); if the token
is named differently (e.g. `--error`), use the existing name - do not invent
a new token.

- [ ] **Step 5: Run tests**

Run: `npm run build && npm test`
Expected: PASS including the new build-output test.

- [ ] **Step 6: Visual + a11y check via e2e**

Run: `npm run test:e2e`
Expected: PASS - `a11y.test.js` already scans /contact.html; fix any
contrast finding it reports before committing.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/pages.js scripts/build-content.js app/terminal.css tests/unit/build-output.test.js
git commit -m "feat: contact workspace pane - finger identity + mutt-style compose form"
```

---

### Task 3: Composer wiring (`app/compose.js`)

**Files:**
- Create: `app/compose.js`
- Modify: `app/buffers.js` (bootBuffers: dispatch `[data-compose]`; import at top)
- Test: `tests/e2e/contact.test.js` (create; first test only)

**Interfaces:**
- Consumes: Task 1 draft API; Task 2 DOM contract.
- Produces (Task 5 extends this file):
  - `initCompose(form) -> void` - binds inputs<->draft, ctrl+enter submit, esc cancel.
  - Form submit dispatches `document` CustomEvent `'draft:send'` with no detail
    (Task 5 replaces this stub wiring with the real submitDraft flow; Task 4's
    `send` command dispatches the same event so there is exactly one send path).

- [ ] **Step 1: Write the failing e2e test**

```js
// tests/e2e/contact.test.js - contact workspace behavior (two-surface draft).
const { test, expect } = require('@playwright/test');

test('composer fields persist across pjax navigation (module draft state)', async ({ page }) => {
  await page.goto('/contact.html');
  await page.getByLabel('Name').fill('Jane Smith');
  await page.getByLabel('Subject').fill('SRE opportunity');
  // navigate away and back through the sidebar (pjax, no reload)
  await page.getByRole('navigation', { name: 'workspaces' })
    .getByRole('link', { name: 'about', exact: true }).click();
  await expect(page).toHaveURL(/about\.html$/);
  await page.getByRole('navigation', { name: 'workspaces' })
    .getByRole('link', { name: 'contact', exact: true }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Jane Smith');
  await expect(page.getByLabel('Subject')).toHaveValue('SRE opportunity');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/contact.test.js`
Expected: FAIL - fields come back empty (no compose module yet).

- [ ] **Step 3: Implement app/compose.js**

```js
// app/compose.js - binds the contact page's compose form to the shared
// draft (app/draft.js). The shell (prompt.js) writes the same draft, so
// `set subject x` updates these inputs live and typing here is visible
// to the `draft` command. One send path: form submit and the `send`
// command both dispatch 'draft:send'.
import { getDraft, updateDraft, resetDraft, subscribeDraft } from './draft.js';

const FIELD_IDS = { name: 'cf-name', email: 'cf-email', subject: 'cf-subject', message: 'cf-message' };

export function initCompose(form) {
  if (!form || form.dataset.composeWired) return;
  form.dataset.composeWired = '1';

  const els = {};
  for (const [k, id] of Object.entries(FIELD_IDS)) els[k] = form.querySelector('#' + id);

  // hydrate from the singleton (draft survives pjax away/back)
  const d = getDraft();
  for (const k of Object.keys(els)) if (els[k]) els[k].value = d[k];

  // form -> draft
  for (const [k, el] of Object.entries(els)) {
    if (el) el.addEventListener('input', () => updateDraft({ [k]: el.value }, 'form'));
  }

  // draft -> form (shell edits appear instantly; skip 'form' echoes so the
  // caret is never disturbed while typing)
  const off = subscribeDraft((snap, source) => {
    if (source === 'form' || !document.contains(form)) { if (!document.contains(form)) off(); return; }
    for (const k of Object.keys(els)) if (els[k] && els[k].value !== snap[k]) els[k].value = snap[k];
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('draft:send'));
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('draft:send'));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      resetDraft('form');
      setStatus(form, '● draft discarded - via AWS SES', '');
    }
  });
}

export function setStatus(form, text, cls) {
  const bar = form.querySelector('[data-cf-status]');
  if (!bar) return;
  bar.textContent = text;
  bar.className = 'cf-status' + (cls ? ' ' + cls : '');
}
```

In `app/buffers.js` add to the imports at the top:

```js
import { initCompose } from './compose.js';
```

and inside `bootBuffers()` after the `[data-status]` block:

```js
  const compose = pane.querySelector('form[data-compose]');
  if (compose) initCompose(compose);
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `npx playwright test tests/e2e/contact.test.js`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm test && npm run test:e2e`

```bash
git add app/compose.js app/buffers.js tests/e2e/contact.test.js
git commit -m "feat: compose form bound to shared draft - survives pjax, esc discards"
```

---

### Task 4: Shell vocabulary (mail / draft / set / send / cancel + wizard subject + eggs)

**Files:**
- Modify: `app/prompt.js` (parseCommand cases, completeCommand, wizard subject step, act() handling, HELP_LINES)
- Test: `tests/unit/prompt.test.js` (append parse/complete tests)
- Test: `tests/e2e/contact.test.js` (append two-surface sync tests)

**Interfaces:**
- Consumes: Task 1 draft API (`getDraft`, `updateDraft`, `resetDraft`, `draftLines`, `EMAIL_RE` - prompt.js's local `EMAIL_RE` is DELETED in favor of the draft.js export); `'draft:send'` event contract from Task 3.
- Produces: new `parseCommand` return kinds handled inside prompt.js's own `act()`:
  - `{ kind: 'mail', subject? }` -> update draft subject if given, then nav to `/contact.html` (or focus `#cf-name` if already there)
  - `{ kind: 'draft-show' }`, `{ kind: 'draft-set', field, value }`, `{ kind: 'draft-send' }`, `{ kind: 'draft-cancel' }`
  - cwd-gating lives in parseCommand (pure, testable): outside `~/contact`, draft/set/send/cancel return `{ kind: 'print', lines: ["no draft here - try 'cd contact' first"] }`; `mail` works anywhere.

- [ ] **Step 1: Write failing unit tests**

Append to `tests/unit/prompt.test.js` (match the file's existing import style
for `parseCommand`/`completeCommand`; `path` argument is the cwd string the
file's existing tests pass, e.g. `'~/contact'` / `'~'`):

```js
describe('contact vocabulary', () => {
  const m = { posts: [], projects: [] };

  test('mail lucas navigates and mail -s prefills subject', () => {
    expect(parseCommand('mail lucas', m, '~')).toEqual({ kind: 'mail' });
    expect(parseCommand('mail -s "SRE role" lucas', m, '~'))
      .toEqual({ kind: 'mail', subject: 'SRE role' });
  });

  test('set parses field + rest-of-line value, quotes optional', () => {
    expect(parseCommand('set subject Platform Engineer role', m, '~/contact'))
      .toEqual({ kind: 'draft-set', field: 'subject', value: 'Platform Engineer role' });
    expect(parseCommand('set email j@co.com', m, '~/contact'))
      .toEqual({ kind: 'draft-set', field: 'email', value: 'j@co.com' });
    expect(parseCommand('set bogus x', m, '~/contact').kind).toBe('print');
  });

  test('draft/set/send/cancel are cwd-gated to ~/contact', () => {
    for (const c of ['draft', 'set subject x', 'send', 'cancel']) {
      const r = parseCommand(c, m, '~/posts');
      expect(r.kind).toBe('print');
      expect(r.lines[0]).toContain('cd contact');
    }
    expect(parseCommand('draft', m, '~/contact')).toEqual({ kind: 'draft-show' });
    expect(parseCommand('send', m, '~/contact')).toEqual({ kind: 'draft-send' });
    expect(parseCommand('cancel', m, '~/contact')).toEqual({ kind: 'draft-cancel' });
  });

  test('easter eggs: ssh and ping', () => {
    expect(parseCommand('ssh lucas@devops', m, '~').lines[0])
      .toBe("Permission denied (publickey). Try 'mail lucas' instead.");
    expect(parseCommand('ping lucas', m, '~').lines.join(' ')).toContain('0% packet loss');
  });

  test('completion covers mail, set fields, draft verbs', () => {
    expect(completeCommand('mail lu', m)).toContain('mail lucas');
    expect(completeCommand('set sub', m)).toContain('set subject');
    expect(completeCommand('dra', m)).toContain('draft');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/prompt.test.js`
Expected: FAIL on every new test.

- [ ] **Step 3: Implement in app/prompt.js**

1. Import at top: `import { getDraft, updateDraft, resetDraft, draftLines, EMAIL_RE } from './draft.js';`
   and delete the local `const EMAIL_RE = ...` (line 10).
2. New cases in `parseCommand` (which already receives `path`); helper:

```js
const IN_CONTACT = (path) => /contact/.test(path || '');
const DRAFT_FIELDS = ['name', 'email', 'subject', 'message'];
const NO_DRAFT_HERE = { kind: 'print', lines: ["no draft here - try 'cd contact' first"] };
```

```js
    case 'mail': {
      // mail lucas | mail -s "subject" lucas | compose
      const sMatch = rest.match(/^-s\s+("([^"]*)"|\S+)\s+lucas$/);
      if (sMatch) return { kind: 'mail', subject: sMatch[2] !== undefined ? sMatch[2] : sMatch[1] };
      if (!rest || rest === 'lucas') return { kind: 'mail' };
      return { kind: 'print', lines: ["usage: mail lucas | mail -s \"subject\" lucas"] };
    }
    case 'compose':
      return { kind: 'mail' };
    case 'draft':
      return IN_CONTACT(path) ? { kind: 'draft-show' } : NO_DRAFT_HERE;
    case 'set': {
      if (!IN_CONTACT(path)) return NO_DRAFT_HERE;
      const m2 = rest.match(/^(\S+)\s+([\s\S]+)$/);
      if (!m2 || !DRAFT_FIELDS.includes(m2[1]))
        return { kind: 'print', lines: [`set: usage: set <${DRAFT_FIELDS.join('|')}> <value>`] };
      return { kind: 'draft-set', field: m2[1], value: m2[2].replace(/^"|"$/g, '') };
    }
    case 'send':
      return IN_CONTACT(path) ? { kind: 'draft-send' } : NO_DRAFT_HERE;
    case 'cancel':
      return IN_CONTACT(path) ? { kind: 'draft-cancel' } : NO_DRAFT_HERE;
    case 'ssh':
      return { kind: 'print', lines: ["Permission denied (publickey). Try 'mail lucas' instead."] };
    case 'ping':
      return { kind: 'print', lines: ['PING lucas (devops.lucasluize.com): 56 data bytes', 'lucas is reachable.', '0% packet loss'] };
```

(`rest` = everything after the verb; if parseCommand currently splits into
`arg`, derive `rest` the same way neighbouring cases derive their argument
string - reuse the existing tokenization, do not add a second parser.)

3. In the DOM layer's `act()` switch, handle the new kinds:

```js
      case 'mail': {
        if (r.subject !== undefined) updateDraft({ subject: r.subject }, 'shell');
        const onContact = /contact/.test(location.pathname);
        if (!onContact) { navigate('/contact.html'); }
        // focus the first empty field once the pane exists
        requestAnimationFrame(() => {
          const f = document.querySelector('#cf-name');
          if (f) f.focus({ preventScroll: true });
        });
        appendLine('composing - fill the form or use: set <field> <value>, draft, send');
        return;
      }
      case 'draft-show':
        appendLines(draftLines(getDraft()));
        return;
      case 'draft-set':
        updateDraft({ [r.field]: r.value }, 'shell');
        appendLine(`${r.field} set.`);
        return;
      case 'draft-send':
        document.dispatchEvent(new CustomEvent('draft:send'));
        return;
      case 'draft-cancel':
        resetDraft('shell');
        appendLine('draft discarded.');
        return;
```

4. Wizard: add `subject` step between `email` and `message` in `stepWizard`
   (same validation pattern as name: non-empty). Every wizard step ALSO calls
   `updateDraft({ <field>: text }, 'shell')` so the composer mirrors it, and
   `finishWizard()` reads from `getDraft()` instead of `wizard.data`.
   Update the confirm block to print the subject line too.
5. `COMPLETABLE`: add `'mail', 'compose', 'draft', 'set', 'send', 'cancel'`.
   In the completion argument switch add:
   `case 'mail': return ['lucas'];` and `case 'set': return DRAFT_FIELDS;`.
6. HELP_LINES: add `'  mail lucas            compose a message (or: contact)'`
   and keep the existing contact line.
7. Until Task 5 lands, `'draft:send'` has no listener in prompt.js - Task 5
   adds it. The wizard's existing `sendContact` path keeps working unchanged
   in this task.

- [ ] **Step 4: Run unit tests**

Run: `npx jest tests/unit/prompt.test.js`
Expected: PASS.

- [ ] **Step 5: Write the two-surface sync e2e test**

Append to `tests/e2e/contact.test.js`:

```js
test('shell and composer share one draft: set updates the form, form feeds draft', async ({ page }) => {
  await page.goto('/contact.html');
  // form -> shell
  await page.getByLabel('Subject').fill('typed in the form');
  const cmd = page.getByRole('textbox', { name: /command/i });
  await cmd.fill('draft');
  await cmd.press('Enter');
  await expect(page.getByText('Subject: typed in the form')).toBeVisible();
  // shell -> form
  await cmd.fill('set subject changed from the shell');
  await cmd.press('Enter');
  await expect(page.getByLabel('Subject')).toHaveValue('changed from the shell');
});
```

(Adjust the command-input locator to the accessible name the prompt input
already has - check `form[data-prompt]` markup in `scripts/lib/pages.js`; the
existing wizard e2e in `tests/e2e/terminal.test.js:120` shows the working
locator - reuse it exactly.)

- [ ] **Step 6: Run e2e, then full verification**

Run: `npx playwright test tests/e2e/contact.test.js`, then `npm test && npm run test:e2e`
Expected: all PASS (the existing wizard e2e still passes - wizard gained a
subject step, so if `terminal.test.js:120` walks the steps, update it to
answer the new `subject:` prompt).

- [ ] **Step 7: Commit**

```bash
git add app/prompt.js tests/unit/prompt.test.js tests/e2e/contact.test.js tests/e2e/terminal.test.js
git commit -m "feat: mail/draft/set/send shell vocabulary + wizard subject step + ssh/ping eggs"
```

---

### Task 5: submitDraft flow - staged states, SENT pane, error copy, payload hash

**Files:**
- Modify: `app/draft.js` (add `submitDraft`, `sha256Hex`)
- Modify: `app/compose.js` (listen for `'draft:send'`, render stages/SENT/errors in the status bar and pane)
- Modify: `app/prompt.js` (replace wizard `sendContact` with `submitDraft`; scrollback staging lines; keep `appendMailtoFallback`)
- Test: `tests/unit/draft.test.js` (submitDraft with mocked fetch), `tests/e2e/contact.test.js` (relay-failure path)

**Interfaces:**
- Consumes: `CONTACT_ENDPOINT` from `app/config.js` (still `''` until Task 7).
- Produces:
  - `submitDraft(extras, onStage) -> Promise<result>` in draft.js where
    `extras = { website: string, t: number }`,
    `onStage(n, label, ok)` fires for `1 validating draft`, `2 submitting to relay`, `3 accepted by SES`;
    result is one of:
    `{ ok: true, messageId }` |
    `{ ok: false, reason: 'validation', errors: string[] }` |
    `{ ok: false, reason: 'unconfigured' }` |
    `{ ok: false, reason: 'rate' }` |
    `{ ok: false, reason: 'relay' }`.
  - Success resets the draft; every failure preserves it.

- [ ] **Step 1: Write failing unit tests**

Append to `tests/unit/draft.test.js`:

```js
describe('submitDraft', () => {
  const fill = () => updateDraft({ name: 'J', email: 'j@co.com', subject: 's', message: 'hi' }, 'form');
  afterEach(() => { delete global.fetch; });

  test('validation failure reports errors, sends nothing, keeps draft', async () => {
    global.fetch = jest.fn();
    const r = await submitDraft({ website: '', t: 9000 }, () => {});
    expect(r).toMatchObject({ ok: false, reason: 'validation' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('success posts JSON with payload hash header and resets draft', async () => {
    fill();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messageId: 'abc' }) });
    const stages = [];
    const r = await submitDraft({ website: '', t: 9000 }, (n, label, ok) => stages.push([n, ok]));
    expect(r).toEqual({ ok: true, messageId: 'abc' });
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(init.body).subject).toBe('s');
    expect(stages.map(([n]) => n)).toEqual([1, 2, 3]);
    expect(getDraft().message).toBe(''); // reset on success
  });

  test('429 maps to rate, 500 maps to relay, draft preserved', async () => {
    fill();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    expect((await submitDraft({ website: '', t: 9000 }, () => {})).reason).toBe('rate');
    global.fetch = jest.fn().mockRejectedValue(new Error('boom'));
    expect((await submitDraft({ website: '', t: 9000 }, () => {})).reason).toBe('relay');
    expect(getDraft().message).toBe('hi');
  });

  test('honeypot filled pretends success without fetching', async () => {
    fill();
    global.fetch = jest.fn();
    const r = await submitDraft({ website: 'bot', t: 100 }, () => {});
    expect(r.ok).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

Note: jsdom lacks `crypto.subtle` in some Jest configs - in submitDraft,
guard: if `crypto?.subtle` is unavailable, skip the hash header (tests get a
deterministic fallback of hashing via a tiny pure JS path is NOT required;
instead expose `sha256Hex` and in the test environment polyfill with
`node:crypto`: add to the top of the describe block

```js
const { webcrypto } = require('node:crypto');
beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto; });
```

so the header assertion is real.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/draft.test.js`
Expected: FAIL - `submitDraft` not exported.

- [ ] **Step 3: Implement submitDraft in app/draft.js**

```js
import { CONTACT_ENDPOINT } from './config.js';

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// One send path for both surfaces. Stages mirror the spec copy:
// [1/3] validating draft / [2/3] submitting to relay / [3/3] accepted by SES.
export async function submitDraft(extras, onStage) {
  const d = getDraft();
  const errors = validateDraft(d);
  onStage(1, 'validating draft', errors.length === 0);
  if (errors.length) return { ok: false, reason: 'validation', errors };
  if (extras.website) {
    // bot filled the honeypot - pretend success, never teach it
    onStage(2, 'submitting to relay', true);
    onStage(3, 'accepted by SES', true);
    resetDraft('system');
    return { ok: true, messageId: 'queued' };
  }
  if (!CONTACT_ENDPOINT) return { ok: false, reason: 'unconfigured' };
  const body = JSON.stringify({ ...d, website: '', t: extras.t });
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (globalThis.crypto && crypto.subtle) headers['x-amz-content-sha256'] = await sha256Hex(body);
    onStage(2, 'submitting to relay', true);
    const res = await fetch(CONTACT_ENDPOINT, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) return { ok: false, reason: 'rate' };
    if (!res.ok) return { ok: false, reason: 'relay' };
    const data = await res.json().catch(() => ({}));
    onStage(3, 'accepted by SES', true);
    resetDraft('system');
    return { ok: true, messageId: data.messageId || 'accepted' };
  } catch (_) {
    return { ok: false, reason: 'relay' };
  }
}
```

- [ ] **Step 4: Wire both surfaces**

`app/compose.js` - module-level (inside initCompose, after wiring), one
`'draft:send'` listener per page instance (reuse the `form.dataset` guard):

```js
  const snapshotForSent = () => getDraft(); // captured before reset
  document.addEventListener('draft:send', async () => {
    if (!document.contains(form)) return;
    const sent = snapshotForSent();
    const hp = form.querySelector('[data-cf-hp]');
    setStatus(form, 'sending...', '');
    const r = await submitDraft({ website: hp ? hp.value : '', t: Date.now() - wiredAt }, (n, label, ok) => {
      setStatus(form, `[${n}/3] ${label} ${ok ? 'ok' : 'failed'}`, '');
    });
    if (r.ok) { renderSent(form, sent, r.messageId); return; }
    if (r.reason === 'validation') setStatus(form, r.errors[0], 'cf-err');
    else if (r.reason === 'rate') setStatus(form, '429 too many requests - please wait before sending another message', 'cf-err');
    else setStatus(form, 'relay unavailable - nothing lost, your draft is still here', 'cf-err');
  });
```

with `const wiredAt = Date.now();` set at the top of `initCompose`, and:

```js
function renderSent(form, d, messageId) {
  const sent = document.createElement('div');
  sent.className = 'cf-sent';
  sent.innerHTML = `<p class="cf-sent-head">✓ Message accepted</p>
<dl><dt>From</dt><dd></dd><dt>Subject</dt><dd></dd>
<dt>Queue</dt><dd>accepted</dd><dt>Relay</dt><dd>AWS SES</dd><dt>id</dt><dd class="cf-mid"></dd></dl>
<p>Thanks for reaching out - I'll get back to you.</p>
<button type="button" class="cf-send" data-cf-new>new message</button>`;
  sent.querySelectorAll('dd')[0].textContent = `${d.name} <${d.email}>`;
  sent.querySelectorAll('dd')[1].textContent = d.subject;
  sent.querySelector('.cf-mid').textContent = messageId;
  form.replaceChildren(sent);
  sent.querySelector('[data-cf-new]').addEventListener('click', () => location.reload());
}
```

(Name/subject/messageId set via textContent, never innerHTML interpolation -
user-typed values must not become markup.)

`app/prompt.js` - **single-flight rule (implement exactly this):** only
compose.js ever calls `submitDraft` when a compose form is on the page.

- prompt.js keeps `let composeStart = Date.now();` (module scope), reset by
  `startWizard()` and by the `mail` act case - this is the `t` fill-time.
- prompt.js's `runSend()`: if `document.querySelector('form[data-compose]')`
  exists, dispatch `'draft:send'` and return (compose owns the flight);
  otherwise (wizard used from a non-contact page - possible, the prompt is
  global chrome) call `submitDraft` directly and render the result with the
  same rendering helper below.
- compose.js, after each submitDraft result, dispatches `document`
  CustomEvent `'draft:sent'` with `{ detail: result }`.
- prompt.js listens for `'draft:sent'` and renders the scrollback lines.

Result: exactly one `submitDraft` call per send, both surfaces render.

Shared rendering in prompt.js (used by the `'draft:sent'` listener and the
direct-call fallback):

```js
  function renderSendResult(result) {
    if (result.ok) { appendLine('✓ message sent - thanks, I will get back to you soon.', 'sb-line sb-ok'); return; }
    if (result.reason === 'validation') { appendLines(['send: validation failed', ...result.errors]); return; }
    if (result.reason === 'rate') { appendLines(['send: temporarily unavailable', '429 too many requests - please wait before sending another message.']); return; }
    appendLines(['send: relay unavailable', 'The message was not submitted. Nothing has been lost - your draft is still here.']);
    appendMailtoFallback(getDraft());
  }

  async function runSend() {
    appendLine('sending message...');
    if (document.querySelector('form[data-compose]')) {
      document.dispatchEvent(new CustomEvent('draft:send'));
      return; // compose runs the flight; 'draft:sent' listener renders here
    }
    const hp = honeypot ? honeypot.value : '';
    const result = await submitDraft({ website: hp, t: Date.now() - composeStart }, (n, label, ok) => {
      appendLine(`[${n}/3] ${label.padEnd(22)} ${ok ? 'ok' : 'failed'}`);
    });
    renderSendResult(result);
  }
```

`sendContact()` and its direct callers are replaced by `runSend()`;
`appendMailtoFallback(payload)` now takes the draft shape (`name`, `email`,
`subject`, `message`) and includes the subject in the mailto subject line.
The `'draft-send'` act case and `finishWizard()` both call `runSend()`.
compose.js's `'draft:send'` listener additionally prints its staged
progress into the status bar only (scrollback staging comes from the
`'draft:sent'` summary - do not double-print stages in the scrollback).

- [ ] **Step 5: e2e - relay failure preserves the draft (endpoint still '')**

Append to `tests/e2e/contact.test.js`:

```js
test('send with unconfigured endpoint keeps the draft and offers mailto', async ({ page }) => {
  await page.goto('/contact.html');
  await page.getByLabel('Name').fill('Jane');
  await page.getByLabel('From').fill('j@co.com');
  await page.getByLabel('Subject').fill('SRE');
  await page.getByLabel('Message').fill('hello');
  await page.getByRole('button', { name: /send/ }).click();
  // draft untouched after the failed relay
  await expect(page.getByLabel('Message')).toHaveValue('hello');
  await expect(page.getByText(/draft is still here|relay unavailable/)).toBeVisible();
});
```

(With `CONTACT_ENDPOINT === ''`, submitDraft returns `unconfigured`; render
it identically to `relay` in both surfaces - same copy, since for a visitor
the meaning is the same. Add that mapping in compose.js/prompt.js.)

- [ ] **Step 6: Full verification**

Run: `npm test && npm run test:e2e`
Expected: PASS, including the updated wizard e2e in terminal.test.js (its
old "mailto fallback" assertion should still hold via the relay path).

- [ ] **Step 7: Commit**

```bash
git add app/draft.js app/compose.js app/prompt.js tests/unit/draft.test.js tests/e2e/contact.test.js
git commit -m "feat: single-flight submitDraft - staged send, SENT pane, terminal error copy"
```

---

### Task 6: Lambda handler (pure, testable)

**Files:**
- Create: `scripts/infra/lambda/handler.js` (CommonJS, pure factory)
- Create: `scripts/infra/lambda/index.js` (deployed entry, wires SES)
- Test: `tests/unit/contact-handler.test.js`

**Interfaces:**
- Consumes: nothing from the app (standalone deployment artifact; limits are
  duplicated deliberately - the Lambda must not import browser ESM).
- Produces: `createHandler(sendEmail) -> async (event) -> { statusCode, headers, body }`
  where `sendEmail({ from, to, replyTo, subject, text }) -> Promise<{ messageId }>`.
  Task 7 zips this directory as the function code.

- [ ] **Step 1: Write failing unit tests**

```js
// tests/unit/contact-handler.test.js
const { createHandler } = require('../../scripts/infra/lambda/handler.js');

const valid = { name: 'Jane', email: 'j@co.com', subject: 'SRE', message: 'hi', website: '', t: 9000 };
const ev = (payload) => ({ body: JSON.stringify(payload) });

test('valid payload relays via SES with Reply-To submitter', async () => {
  const sent = [];
  const h = createHandler(async (m) => { sent.push(m); return { messageId: 'mid-1' }; });
  const res = await h(ev(valid));
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body)).toEqual({ messageId: 'mid-1' });
  expect(sent[0].replyTo).toBe('j@co.com');
  expect(sent[0].subject).toBe('[portfolio] SRE');
  expect(sent[0].to).toBe('me@lucasluize.com');
});

test('missing field, bad email, oversize message -> 400, nothing sent', async () => {
  const sendEmail = jest.fn();
  const h = createHandler(sendEmail);
  for (const bad of [
    { ...valid, name: '' },
    { ...valid, email: 'nope' },
    { ...valid, message: 'x'.repeat(2001) },
  ]) expect((await h(ev(bad))).statusCode).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

test('honeypot or too-fast fill -> 200 fake success, nothing sent', async () => {
  const sendEmail = jest.fn();
  const h = createHandler(sendEmail);
  expect((await h(ev({ ...valid, website: 'bot' }))).statusCode).toBe(200);
  expect((await h(ev({ ...valid, t: 500 }))).statusCode).toBe(200);
  expect(sendEmail).not.toHaveBeenCalled();
});

test('malformed JSON and base64 body both handled', async () => {
  const h = createHandler(async () => ({ messageId: 'x' }));
  expect((await h({ body: '{nope' })).statusCode).toBe(400);
  const b64 = { body: Buffer.from(JSON.stringify(valid)).toString('base64'), isBase64Encoded: true };
  expect((await h(b64)).statusCode).toBe(200);
});

test('SES failure -> 500', async () => {
  const h = createHandler(async () => { throw new Error('ses down'); });
  expect((await h(ev(valid))).statusCode).toBe(500);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/contact-handler.test.js`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement handler.js and index.js**

```js
// scripts/infra/lambda/handler.js - pure contact relay handler.
// createHandler(sendEmail) so unit tests inject a fake; index.js wires SES.
// Limits mirror app/draft.js DRAFT_LIMITS (duplicated on purpose: the
// deployed artifact must be dependency-free and not import browser ESM).
'use strict';

const TO = 'me@lucasluize.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { name: 100, email: 200, subject: 150, message: 2000 };
const MIN_FILL_MS = 3000;

const resp = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

function validate(p) {
  if (!p || typeof p !== 'object') return 'bad payload';
  for (const k of Object.keys(LIMITS)) {
    if (typeof p[k] !== 'string' || !p[k].trim()) return `${k} required`;
    if (p[k].length > LIMITS[k]) return `${k} too long`;
  }
  if (!EMAIL_RE.test(p.email.trim())) return 'invalid email';
  return null;
}

function createHandler(sendEmail) {
  return async function handler(event) {
    let payload;
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
      payload = JSON.parse(raw);
    } catch (_) {
      return resp(400, { error: 'invalid JSON' });
    }
    // Honeypot filled or superhuman fill time: fake success, never teach the bot.
    if ((payload && payload.website) || (payload && typeof payload.t === 'number' && payload.t < MIN_FILL_MS)) {
      return resp(200, { messageId: 'queued' });
    }
    const err = validate(payload);
    if (err) return resp(400, { error: err });
    try {
      const { messageId } = await sendEmail({
        from: TO,
        to: TO,
        replyTo: payload.email.trim(),
        subject: `[portfolio] ${payload.subject.trim()}`,
        text: `${payload.message}\n\n- ${payload.name} (${payload.email})`,
      });
      return resp(200, { messageId });
    } catch (_) {
      return resp(500, { error: 'relay failure' });
    }
  };
}

module.exports = { createHandler };
```

```js
// scripts/infra/lambda/index.js - deployed Lambda entry (Node 22 runtime,
// AWS SDK v3 preinstalled in the runtime - nothing to bundle).
'use strict';
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { createHandler } = require('./handler.js');

const ses = new SESv2Client({});

exports.handler = createHandler(async ({ from, to, replyTo, subject, text }) => {
  const out = await ses.send(new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: [replyTo],
    Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
  }));
  return { messageId: out.MessageId };
});
```

(`index.js` is NOT unit-tested - it would require the SDK locally. Keep it
thin enough that the smoke test in Task 7 is its test.)

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/contact-handler.test.js` then `npm test`
Expected: PASS. If Jest tries to parse `index.js` and fails on the missing
SDK, confirm jest.config.js `testMatch` only picks up `tests/unit/` (it does;
index.js is only `require`d by Lambda, never by tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/infra/lambda/handler.js scripts/infra/lambda/index.js tests/unit/contact-handler.test.js
git commit -m "feat: contact relay lambda - pure handler with honeypot, limits, SES injection"
```

---

### Task 7: Idempotent infra script + deploy + wire endpoint

**Files:**
- Create: `scripts/infra/contact-backend.sh`
- Modify: `app/config.js` (`CONTACT_ENDPOINT = '/api/contact'`)
- Test: `bash -n` lint + the script's built-in smoke test (run by the USER; classifier blocks agent IAM mutations)

**Interfaces:**
- Consumes: Task 6 lambda directory; existing distribution `E1XPOJ09AWDJIN`; verified SES identity `me@lucasluize.com`.
- Produces: live POST `https://devops.lucasluize.com/api/contact`.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# scripts/infra/contact-backend.sh - idempotent provisioning for the contact
# relay: IAM role -> Lambda (reserved concurrency 1) -> Function URL (AWS_IAM)
# -> CloudFront OAC + /api/contact behavior on the existing distribution.
# Safe to re-run: every step diffs current state before writing.
# Style: matches the CloudFront error-page scripts (aws cli + jq, no state).
set -euo pipefail

REGION="us-east-1"
FUNC="portfolio-contact"
ROLE="portfolio-contact-role"
DIST_ID="E1XPOJ09AWDJIN"
SES_IDENTITY="me@lucasluize.com"
LAMBDA_DIR="$(cd "$(dirname "$0")/lambda" && pwd)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

say() { printf '\n== %s\n' "$*"; }

# --- 0. preflight: SES identity must be verified ---------------------------
say "checking SES identity"
STATUS=$(aws sesv2 get-email-identity --email-identity "$SES_IDENTITY" --region "$REGION" \
  --query 'VerifiedForSendingStatus' --output text 2>/dev/null || echo "MISSING")
if [ "$STATUS" != "True" ]; then
  echo "SES identity $SES_IDENTITY not verified. Run:"
  echo "  aws sesv2 create-email-identity --email-identity $SES_IDENTITY --region $REGION"
  echo "then click the verification link in your inbox and re-run this script."
  exit 1
fi

# --- 1. IAM role ------------------------------------------------------------
say "ensuring IAM role $ROLE"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam wait role-exists --role-name "$ROLE"
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name contact-relay --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"ses:SendEmail\",\"Resource\":\"arn:aws:ses:${REGION}:${ACCOUNT_ID}:identity/${SES_IDENTITY}\"},
    {\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:*\"}
  ]}"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}"

# --- 2. Lambda function ------------------------------------------------------
say "packaging lambda"
ZIP="$(mktemp -t contact-lambda-XXXX).zip"
(cd "$LAMBDA_DIR" && zip -q -j "$ZIP" index.js handler.js)

if aws lambda get-function --function-name "$FUNC" --region "$REGION" >/dev/null 2>&1; then
  say "updating function code"
  aws lambda update-function-code --function-name "$FUNC" --zip-file "fileb://$ZIP" --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNC" --region "$REGION"
else
  say "creating function"
  # role propagation can lag right after create-role; retry briefly
  for i in 1 2 3 4 5; do
    if aws lambda create-function --function-name "$FUNC" --runtime nodejs22.x \
      --handler index.handler --role "$ROLE_ARN" --zip-file "fileb://$ZIP" \
      --timeout 10 --memory-size 128 --region "$REGION" >/dev/null 2>&1; then break; fi
    echo "  role not ready yet, retrying ($i/5)"; sleep 10
  done
  aws lambda wait function-active --function-name "$FUNC" --region "$REGION"
fi
rm -f "$ZIP"
say "reserved concurrency = 1 (hard abuse/cost cap)"
aws lambda put-function-concurrency --function-name "$FUNC" --reserved-concurrent-executions 1 --region "$REGION" >/dev/null

# --- 3. Function URL (AWS_IAM) + CloudFront invoke permission ----------------
say "ensuring function URL (auth AWS_IAM)"
FURL=$(aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" \
  --query FunctionUrl --output text 2>/dev/null || true)
if [ -z "$FURL" ] || [ "$FURL" = "None" ]; then
  FURL=$(aws lambda create-function-url-config --function-name "$FUNC" \
    --auth-type AWS_IAM --region "$REGION" --query FunctionUrl --output text)
fi
FURL_DOMAIN=$(echo "$FURL" | sed -E 's|https://([^/]+)/?|\1|')
echo "  $FURL_DOMAIN"

say "granting CloudFront permission to invoke the URL"
aws lambda add-permission --function-name "$FUNC" --region "$REGION" \
  --statement-id cloudfront-oac-invoke \
  --action lambda:InvokeFunctionUrl \
  --principal cloudfront.amazonaws.com \
  --source-arn "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}" \
  >/dev/null 2>&1 || echo "  permission already present"

# --- 4. CloudFront OAC -------------------------------------------------------
say "ensuring lambda OAC"
OAC_ID=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='portfolio-contact-oac'].Id | [0]" --output text)
if [ -z "$OAC_ID" ] || [ "$OAC_ID" = "None" ]; then
  OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
    'Name=portfolio-contact-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=lambda' \
    --query 'OriginAccessControl.Id' --output text)
fi
echo "  OAC: $OAC_ID"

# --- 5. Distribution: origin + behavior (diff-and-apply) ---------------------
say "patching distribution $DIST_ID"
TMP=$(mktemp -d -t contact-cf-XXXX)
aws cloudfront get-distribution-config --id "$DIST_ID" > "$TMP/full.json"
ETAG=$(jq -r '.ETag' "$TMP/full.json")
jq '.DistributionConfig' "$TMP/full.json" > "$TMP/config.json"

# CachingDisabled + AllViewerExceptHostHeader are AWS managed policy ids.
jq --arg dom "$FURL_DOMAIN" --arg oac "$OAC_ID" '
  .Origins.Items |= (map(select(.Id != "contact-lambda")) + [{
    "Id":"contact-lambda","DomainName":$dom,"OriginPath":"",
    "CustomHeaders":{"Quantity":0},
    "CustomOriginConfig":{"HTTPPort":80,"HTTPSPort":443,"OriginProtocolPolicy":"https-only",
      "OriginSslProtocols":{"Quantity":1,"Items":["TLSv1.2"]},
      "OriginReadTimeout":30,"OriginKeepaliveTimeout":5},
    "ConnectionAttempts":3,"ConnectionTimeout":10,
    "OriginShield":{"Enabled":false},
    "OriginAccessControlId":$oac
  }]) |
  .Origins.Quantity = (.Origins.Items | length) |
  .CacheBehaviors.Items = ((.CacheBehaviors.Items // []) | map(select(.PathPattern != "/api/contact")) + [{
    "PathPattern":"/api/contact","TargetOriginId":"contact-lambda",
    "ViewerProtocolPolicy":"https-only",
    "AllowedMethods":{"Quantity":7,"Items":["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods":{"Quantity":2,"Items":["GET","HEAD"]}},
    "Compress":false,
    "CachePolicyId":"4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId":"b689b0a8-53d0-40ab-baf2-68738e2966ac",
    "SmoothStreaming":false,
    "FieldLevelEncryptionId":"",
    "LambdaFunctionAssociations":{"Quantity":0},
    "FunctionAssociations":{"Quantity":0},
    "TrustedSigners":{"Enabled":false,"Quantity":0},
    "TrustedKeyGroups":{"Enabled":false,"Quantity":0}
  }]) |
  .CacheBehaviors.Quantity = (.CacheBehaviors.Items | length)
' "$TMP/config.json" > "$TMP/desired.json"

if jq -e -n --slurpfile a "$TMP/config.json" --slurpfile b "$TMP/desired.json" '$a == $b' >/dev/null; then
  echo "  distribution already up to date"
else
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" \
    --distribution-config "file://$TMP/desired.json" >/dev/null
  echo "  update submitted, waiting for deploy (a few minutes)..."
  aws cloudfront wait distribution-deployed --id "$DIST_ID"
fi
rm -rf "$TMP"

# --- 6. smoke test -----------------------------------------------------------
say "smoke test"
BODY='{"name":"Smoke Test","email":"smoke@lucasluize.com","subject":"contact-backend smoke","message":"provisioning smoke test - ignore","website":"","t":9999}'
HASH=$(python3 -c "import hashlib,sys;print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" "$BODY")
HTTP=$(curl -s -o /tmp/contact-smoke.json -w '%{http_code}' \
  -X POST "https://devops.lucasluize.com/api/contact" \
  -H "Content-Type: application/json" -H "x-amz-content-sha256: $HASH" \
  --data "$BODY")
cat /tmp/contact-smoke.json; echo
[ "$HTTP" = "200" ] && echo "OK: contact backend live" || { echo "FAIL: HTTP $HTTP"; exit 1; }
```

- [ ] **Step 2: Lint the script**

Run: `bash -n scripts/infra/contact-backend.sh && chmod +x scripts/infra/contact-backend.sh`
Expected: no output (syntax OK).

- [ ] **Step 3: USER runs the script**

The user runs (agents cannot - IAM mutations are classifier-blocked):

```
! bash scripts/infra/contact-backend.sh
```

If SES preflight fails, run the printed `create-email-identity` command,
click the link SES emails, re-run. Expected final output: `OK: contact
backend live` and a real `[portfolio] contact-backend smoke` email arriving.

- [ ] **Step 4: Wire the endpoint**

In `app/config.js`:

```js
export const CONTACT_ENDPOINT = '/api/contact'; // CloudFront -> OAC -> Lambda -> SES
```

- [ ] **Step 5: Full verification**

Run: `npm test && npm run test:e2e`
Expected: PASS. Note the Task 5 e2e ("unconfigured endpoint") now exercises
the relay-failure path instead (local server has no /api/contact -> 404 ->
`relay`); the assertion text covers both, so it stays green - confirm it does.

- [ ] **Step 6: Commit**

```bash
git add scripts/infra/contact-backend.sh app/config.js
git commit -m "feat: contact backend infra - idempotent lambda+oac+behavior script, live endpoint"
```

---

### Task 8: Ship

**Files:**
- Modify: none new (final pass only)

- [ ] **Step 1: Full suite** - `npm test && npm run test:e2e`, all green.
- [ ] **Step 2: Manual pixel pass** - build + serve, screenshot /contact.html at 1440x900 and 390x844; check pane geometry, focus rings, SENT pane, mobile stacking. Fix anything visually off.
- [ ] **Step 3: Update project memory** - contact workspace shipped; note the one-time SES verification state and that the smoke email is expected in the inbox.
- [ ] **Step 4: Commit any polish, then hand to user to push master** (deploy is automatic; after deploy, send a real message from the live site and confirm it arrives with Reply-To set).
