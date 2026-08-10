// app/buffers.js - interactive terminal buffers (ES module, dual-exported for
// Jest like router.js). Pure helpers (fuzzyMatch/filterByTag/getTagsFromManifest)
// are unit-tested; the DOM buffers (runMotd/initTelescope/initStatus/reading
// progress) are guarded so requiring this under Node never touches document.
import { navigate } from './router.js';

// ---- Pure helpers (FLAT manifest shape) ---------------------------------

// getTagsFromManifest: sorted unique tag list across items.
export function getTagsFromManifest(items) {
  const set = new Set();
  for (const it of items || []) for (const t of it.tags || []) set.add(t);
  return Array.from(set).sort();
}

// filterByTag: items carrying `tag`. 'all' or falsy -> all items.
export function filterByTag(items, tag) {
  if (!tag || tag === 'all') return (items || []).slice();
  return (items || []).filter((it) => (it.tags || []).includes(tag));
}

// scoreText: how well `q` (already lowercased) matches `text`.
// Contiguous substring beats scattered subsequence; earlier position wins.
// Returns -Infinity for no match.
function scoreText(q, text) {
  const idx = text.indexOf(q);
  if (idx !== -1) return 1000 - idx; // contiguous
  // greedy subsequence
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    ti = text.indexOf(q[qi], ti);
    if (ti === -1) return -Infinity;
    ti++;
  }
  return 500 - text.length; // scattered: prefer shorter fields
}

// fuzzyMatch: filtered + ranked items. Empty query returns all unchanged.
// `keys` are field names; array fields (e.g. tags) are joined with spaces.
export function fuzzyMatch(query, items, keys) {
  const list = items || [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice();
  const scored = [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    let best = -Infinity;
    for (const k of keys) {
      const v = it[k];
      const text = (Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v)).toLowerCase();
      const s = scoreText(q, text);
      if (s > best) best = s;
    }
    if (best > -Infinity) scored.push({ it, best, i });
  }
  // stable: sort by score desc, then original index asc
  scored.sort((a, b) => b.best - a.best || a.i - b.i);
  return scored.map((s) => s.it);
}

// ---- MOTD login buffer ---------------------------------------------------

const MOTD_LINES = [
  'Last login: session start on ttys001',
  '',
  '  __        _____ _     ____ ___  __  __ _____',
  "  \\ \\      / / ____| |   / ___/ _ \\|  \\/  | ____|",
  '   \\ \\ /\\ / /|  _| | |  | |  | | | | |\\/| |  _|',
  '    \\ V  V / | |___| |__| |__| |_| | |  | | |___',
  '     \\_/\\_/  |_____|_____\\____\\___/|_|  |_|_____|',
  '',
  '> whoami',
  'lucas — cloud devops engineer. private-origin infra, CDN, test-gated pipelines.',
  '> motd',
  'Browse posts + projects with the picker. Type a command in the prompt below.',
];

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// runMotd(el): types MOTD into `el` over ~1.3s with rAF batching. Any input
// completes instantly; sessionStorage.motdDone skips; reduced-motion renders
// final state at once. Zero CLS: reserve final height before typing.
export function runMotd(el) {
  if (!el) return;
  const finalText = MOTD_LINES.join('\n');
  // Height is reserved by CSS (.motd min-height, font-relative) so it holds from
  // first paint and survives the web-font swap -> zero CLS. No JS measurement.

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.textContent = finalText;
    try { sessionStorage.setItem('motdDone', '1'); } catch (_) { /* private mode */ }
    teardown();
  };

  const onInterrupt = () => finish();
  const teardown = () => {
    removeEventListener('keydown', onInterrupt);
    removeEventListener('click', onInterrupt);
    removeEventListener('scroll', onInterrupt, { passive: true });
  };

  let skip = false;
  try { skip = !!sessionStorage.getItem('motdDone'); } catch (_) { /* ignore */ }
  if (skip || reducedMotion()) { el.textContent = finalText; return; }

  el.textContent = '';
  addEventListener('keydown', onInterrupt);
  addEventListener('click', onInterrupt);
  addEventListener('scroll', onInterrupt, { passive: true });

  const CHARS_PER_FRAME = Math.max(2, Math.ceil(finalText.length / 78)); // ~1.3s @60fps
  let pos = 0;
  const step = () => {
    if (done) return;
    pos = Math.min(finalText.length, pos + CHARS_PER_FRAME);
    el.textContent = finalText.slice(0, pos);
    if (pos >= finalText.length) return finish();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---- Telescope fuzzy picker ---------------------------------------------

const PICKER_KEYS = ['title', 'excerpt', 'goal', 'tags'];

// initTelescope(el, items, kind): telescope.nvim-style picker inside `el`.
// Results (left, listbox), preview (right), fuzzy input (bottom), tag chips.
export function initTelescope(el, items, kind) {
  if (!el || !items) return;
  el.classList.add('telescope');
  el.innerHTML = `
<div class="tl-body">
  <ul class="tl-results" id="tl-listbox" role="listbox" aria-label="${kind} results"></ul>
  <div class="tl-preview" aria-live="polite"></div>
</div>
<div class="tl-chips" role="group" aria-label="filter by tag"></div>
<div class="tl-input">
  <span class="tl-prompt">&gt;</span>
  <input type="text" class="tl-query" role="combobox" aria-controls="tl-listbox"
         aria-expanded="true" autocomplete="off" spellcheck="false"
         aria-label="fuzzy filter ${kind}" placeholder="type to filter…">
  <span class="tl-count"></span>
</div>`;

  const resultsEl = el.querySelector('.tl-results');
  const previewEl = el.querySelector('.tl-preview');
  const chipsEl = el.querySelector('.tl-chips');
  const inputEl = el.querySelector('.tl-query');
  const countEl = el.querySelector('.tl-count');

  const total = items.length;
  const tags = ['all', ...getTagsFromManifest(items)];
  let activeTag = 'all';
  let current = items.slice();
  let sel = 0;

  // tag chips
  chipsEl.innerHTML = tags
    .map((t) => `<button type="button" class="tl-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
    .join('');
  const markChips = () => {
    for (const b of chipsEl.querySelectorAll('.tl-chip')) {
      const on = b.dataset.tag === activeTag;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  const meta = (item) => {
    if (kind === 'projects') {
      return [item.category, item.lifecycle, item.provenance].filter(Boolean).join(' · ');
    }
    return [item.date, item.readingTime ? item.readingTime + ' min' : '']
      .filter(Boolean).join(' · ');
  };

  const renderPreview = () => {
    const item = current[sel];
    if (!item) { previewEl.innerHTML = '<p class="muted">no matches</p>'; return; }
    const tagline = (item.tags || item.tech_stack || []).join(' ');
    previewEl.innerHTML = `<h3>${escapeHtml(item.title)}</h3>
<p class="tl-meta">${escapeHtml(meta(item))}</p>
<p class="tl-excerpt">${escapeHtml(item.excerpt || item.goal || '')}</p>
${tagline ? `<p class="tl-tags">${escapeHtml(tagline)}</p>` : ''}`;
  };

  const renderResults = () => {
    resultsEl.innerHTML = current
      .map((it, i) => `<li class="tl-option${i === sel ? ' is-selected' : ''}" role="option"
        id="tl-opt-${i}" aria-selected="${i === sel}" data-i="${i}">${escapeHtml(it.title)}</li>`)
      .join('') || '<li class="tl-empty" role="option" aria-selected="false">no matches</li>';
    countEl.textContent = `[${current.length}/${total}]`;
    // Combobox pattern: activedescendant lives on the focused input, not the
    // listbox, so screen readers announce selection changes as arrows move.
    inputEl.setAttribute('aria-activedescendant', current.length ? `tl-opt-${sel}` : '');
    const selEl = resultsEl.querySelector('.is-selected');
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
    renderPreview();
  };

  const refresh = () => {
    const base = filterByTag(items, activeTag);
    current = fuzzyMatch(inputEl.value, base, PICKER_KEYS);
    sel = 0;
    renderResults();
  };

  const go = () => {
    const item = current[sel];
    if (item && item.url) navigate(item.url);
  };

  inputEl.addEventListener('input', refresh);
  const move = (d) => {
    if (!current.length) return;
    sel = (sel + d + current.length) % current.length;
    renderResults();
  };
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); go(); }
  });
  resultsEl.addEventListener('click', (e) => {
    const li = e.target.closest('.tl-option');
    if (!li) return;
    sel = Number(li.dataset.i);
    renderResults();
    go();
  });
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.tl-chip');
    if (!b) return;
    activeTag = b.dataset.tag;
    markChips();
    refresh();
    inputEl.focus();
  });

  markChips();
  refresh();
  inputEl.focus();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Status telemetry ----------------------------------------------------

let lcpValue = null;
if (typeof PerformanceObserver === 'function') {
  try {
    const obs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) lcpValue = last.renderTime || last.loadTime || last.startTime;
    });
    obs.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) { /* unsupported -> stays null */ }
}

function fmtMs(n) { return n == null ? 'n/a' : Math.round(n) + ' ms'; }
function fmtKb(bytes) { return bytes == null ? 'n/a' : (bytes / 1024).toFixed(1) + ' KB'; }

// initStatus(el): the visitor's real session telemetry as an aligned kv table.
export function initStatus(el) {
  if (!el) return;
  const rows = [];
  let nav = null;
  try { nav = performance.getEntriesByType('navigation')[0]; } catch (_) { /* ignore */ }

  if (nav) {
    rows.push(['domContentLoaded', fmtMs(nav.domContentLoadedEventEnd)]);
    rows.push(['load', fmtMs(nav.loadEventEnd || nav.duration)]);
  } else {
    rows.push(['domContentLoaded', 'n/a']);
    rows.push(['load', 'n/a']);
  }

  let bytes = null;
  try {
    const res = performance.getEntriesByType('resource');
    bytes = res.reduce((sum, r) => sum + (r.transferSize || 0), 0);
    if (nav && nav.transferSize) bytes += nav.transferSize;
  } catch (_) { bytes = null; }
  rows.push(['transfer', fmtKb(bytes)]);
  rows.push(['requests', (() => { try { return String(performance.getEntriesByType('resource').length + 1); } catch (_) { return 'n/a'; } })()]);
  rows.push(['LCP', fmtMs(lcpValue)]);

  const pad = Math.max(...rows.map((r) => r[0].length));
  const body = rows
    .map(([k, v]) => `<div class="st-row"><span class="st-key">${escapeHtml(k.padEnd(pad))}</span><span class="st-val">${escapeHtml(v)}</span></div>`)
    .join('');
  el.innerHTML = `<section class="status" aria-label="session telemetry">
<h1>session.status</h1>
<p class="muted st-cmd">$ perf --session</p>
<div class="st-table">${body}</div>
</section>`;
}

// ---- Reading progress ----------------------------------------------------

// #pane is persistent across pjax swaps, so each reader visit must tear down
// the previous scroll listener before adding a new one - otherwise reader ->
// reader -> reader navigation stacks N identical listeners on the same node.
let readingProgressCleanup = null;

// initReadingProgress(): on reader pages, write % scrolled through the article
// into [data-progress]. Passive scroll, rAF-throttled. No-op elsewhere.
export function initReadingProgress() {
  if (readingProgressCleanup) { readingProgressCleanup(); readingProgressCleanup = null; }

  const pane = document.getElementById('pane');
  const out = document.querySelector('[data-progress]');
  const article = pane && pane.querySelector('.post-content, .project-content');
  if (!pane || !out || !article) return;

  let ticking = false;
  const compute = () => {
    ticking = false;
    const max = pane.scrollHeight - pane.clientHeight;
    const pct = max <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((pane.scrollTop / max) * 100)));
    out.textContent = pct + '%';
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(compute);
  };
  pane.addEventListener('scroll', onScroll, { passive: true });
  compute();
  readingProgressCleanup = () => pane.removeEventListener('scroll', onScroll);
  return readingProgressCleanup;
}

// ---- Boot dispatch -------------------------------------------------------

// bootBuffers(): dispatch by what's present in #pane, not by stale globals
// (works on first load AND after a pjax swap). Reads per-page data from
// window.__PAGE__ (router refreshes it before calling this on pjax).
export function bootBuffers() {
  const page = (typeof window !== 'undefined' && window.__PAGE__) || {};
  const pane = document.getElementById('pane');
  if (!pane) return;

  const motd = pane.querySelector('.motd');
  if (motd) runMotd(motd);

  const picker = pane.querySelector('[data-telescope]');
  if (picker && Array.isArray(page.items)) {
    initTelescope(picker, page.items, page.kind);
    const fallback = pane.querySelector('.tl-fallback');
    if (fallback) fallback.hidden = true; // no-JS list not needed once picker boots
  }

  const statusEl = pane.querySelector('[data-status]');
  if (statusEl) initStatus(statusEl);

  if (pane.querySelector('.post-content, .project-content')) {
    initReadingProgress();
  } else if (readingProgressCleanup) {
    // Navigated from a reader page to a non-reader page - drop the stale listener.
    readingProgressCleanup();
    readingProgressCleanup = null;
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootBuffers);
  } else {
    bootBuffers();
  }
  // Re-boot buffers into the new pane after a pjax swap (router.js emits this).
  document.addEventListener('pane:swapped', bootBuffers);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fuzzyMatch, filterByTag, getTagsFromManifest,
    runMotd, initTelescope, initStatus, initReadingProgress, bootBuffers,
  };
}
