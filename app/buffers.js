// app/buffers.js - interactive terminal buffers (ES module, dual-exported for
// Jest like router.js). Pure helpers (fuzzyMatch/filterByTag/getTagsFromManifest)
// are unit-tested; the DOM buffers (runMotd/initTelescope/initStatus/reading
// progress) are guarded so requiring this under Node never touches document.
import { navigate } from './router.js';
import { GISCUS } from './config.js';

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

// Identity first, specifics later: whoami states the role, uname -a states the
// range, help teaches the interface. Keep line count in sync with the .motd
// min-height in terminal.css (lines x 1.35 line-height).
const MOTD_LINES = [
  'Last login: session start on ttys001',
  '',
  '  __        _____ _     ____ ___  __  __ _____',
  "  \\ \\      / / ____| |   / ___/ _ \\|  \\/  | ____|",
  '   \\ \\ /\\ / /|  _| | |  | |  | | | | |\\/| |  _|',
  '    \\ V  V / | |___| |__| |__| |_| | |  | | |___',
  '     \\_/\\_/  |_____|_____\\____\\___/|_|  |_|_____|',
  '',
  '❯ whoami',
  'lucas — cloud devops engineer',
  '❯ printf "$STACK"',
  'aws · terraform · linux · networking · automation · ci/cd',
  '❯ help',
  'click a workspace or use the shell below. try `projects`, `posts`, or `about`.',
];

// Lines 2..6 of MOTD_LINES are the ASCII WELCOME banner - they get the
// .lolcat rainbow at final render (the one lolcat treat, not rainbow-everything).
const BANNER_START = 2;
const BANNER_END = 7;

// First-visit boot theatre, typed before the MOTD (~0.6s, skipped on repeat
// visits and reduced-motion alongside the MOTD itself).
const BOOT_LINES = [
  '❯ ssh lucas@devops.lucasluize.com',
  'connecting... ok',
  'authenticating... ok',
  'starting zsh...',
];

// Final MOTD render: rainbow banner block + green ❯ prompt glyphs (matching
// the real prompt below). The banner span is inline-block with tight
// line-height so the ASCII rows actually touch.
function renderMotdFinal(el) {
  el.textContent = '';
  const frag = document.createDocumentFragment();
  const prose = (lines) => {
    lines.forEach((line, i) => {
      if (i) frag.append('\n');
      if (line.startsWith('❯')) {
        const ps = document.createElement('span');
        ps.className = 'motd-ps';
        ps.textContent = '❯';
        frag.append(ps, line.slice(1));
      } else {
        frag.append(line);
      }
    });
  };
  prose(MOTD_LINES.slice(0, BANNER_START));
  frag.append('\n');
  const banner = document.createElement('span');
  banner.className = 'lolcat motd-banner';
  banner.textContent = MOTD_LINES.slice(BANNER_START, BANNER_END).join('\n');
  frag.append(banner, '\n');
  prose(MOTD_LINES.slice(BANNER_END));
  el.append(frag);
}

// ---- First-visit tour: spotlight nav, then the prompt, then a tip --------

function markTourDone() {
  try { sessionStorage.setItem('tourDone', '1'); } catch (_) { /* private mode */ }
}

// runTour(): two quick focus-lens beats (sidebar, then prompt - everything
// else blurs) ending with a durable tip line in the scrollback + prompt focus.
// Any interaction cancels it; runs once per session; skipped on reduced-motion.
function runTour() {
  let seen = false;
  try { seen = !!sessionStorage.getItem('tourDone'); } catch (_) { /* ignore */ }
  if (seen || reducedMotion()) return;
  markTourDone();
  const body = document.body;
  const timers = [];
  const cleanup = () => {
    body.classList.remove('tour-nav', 'tour-prompt');
    for (const t of timers) clearTimeout(t);
    removeEventListener('keydown', cleanup);
    removeEventListener('pointerdown', cleanup);
  };
  addEventListener('keydown', cleanup);
  addEventListener('pointerdown', cleanup);
  body.classList.add('tour-nav');
  timers.push(setTimeout(() => {
    body.classList.remove('tour-nav');
    body.classList.add('tour-prompt');
  }, 1100));
  timers.push(setTimeout(() => {
    cleanup();
    document.dispatchEvent(new CustomEvent('prompt:tip', {
      detail: { text: 'tip: ctrl+/ focuses the prompt - try `help` or `eggs`.' },
    }));
  }, 2400));
}

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// runMotd(el): first visit types a short ssh boot sequence (~0.6s), clears,
// then types the MOTD (~1.3s), then runs the one-time tour. Any input
// completes instantly (and skips the tour - the visitor is already driving);
// sessionStorage.motdDone skips; reduced-motion renders final state at once.
// Zero CLS: height is reserved by CSS (.motd min-height, font-relative).
export function runMotd(el) {
  if (!el) return;
  const finalText = MOTD_LINES.join('\n');

  let done = false;
  const finish = (interrupted) => {
    if (done) return;
    done = true;
    renderMotdFinal(el);
    try { sessionStorage.setItem('motdDone', '1'); } catch (_) { /* private mode */ }
    teardown();
    if (interrupted) markTourDone();
    else runTour();
  };

  const onInterrupt = () => finish(true);
  const teardown = () => {
    removeEventListener('keydown', onInterrupt);
    removeEventListener('click', onInterrupt);
    removeEventListener('scroll', onInterrupt, { passive: true });
  };

  let skip = false;
  try { skip = !!sessionStorage.getItem('motdDone'); } catch (_) { /* ignore */ }
  if (skip || reducedMotion()) { renderMotdFinal(el); return; }

  el.textContent = '';
  addEventListener('keydown', onInterrupt);
  addEventListener('click', onInterrupt);
  addEventListener('scroll', onInterrupt, { passive: true });

  // rAF typing stepper: `frames` budgets the duration (~frames/60 seconds).
  const typeInto = (text, frames, cb) => {
    const cpf = Math.max(1, Math.ceil(text.length / frames));
    let pos = 0;
    const step = () => {
      if (done) return;
      pos = Math.min(text.length, pos + cpf);
      el.textContent = text.slice(0, pos);
      if (pos >= text.length) { if (cb) cb(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  typeInto(BOOT_LINES.join('\n'), 36, () => {
    setTimeout(() => {
      if (done) return;
      typeInto(finalText, 78, () => finish(false));
    }, 250);
  });
}

// ---- Telescope fuzzy picker ---------------------------------------------

const PICKER_KEYS = ['title', 'excerpt', 'goal', 'tags'];

// Deterministic tag -> palette color bucket for the list's topic column.
// Keep in sync with the build-time copy in scripts/lib/pages.js.
function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h % 5;
}

// "2026-07-02" -> "07-02-26"
function fmtDate(date) {
  const [y, m, d] = String(date || '').split('-');
  return y && m && d ? `${m}-${d}-${y.slice(2)}` : String(date || '');
}

// initTelescope(el, items, kind): yazi/fzf-style content browser inside `el`.
// eza-like column list (left, listbox), Glow-like preview (right), fuzzy
// input + tag/sort controls (bottom), keyboard hints strip. j/k etc. work
// once focus leaves the input (Escape); '/' returns to it.
export function initTelescope(el, items, kind) {
  if (!el || !items) return;
  const isPosts = kind === 'posts';
  el.classList.add('telescope', isPosts ? 'tl-posts' : 'tl-projects');
  const tags = ['all', ...getTagsFromManifest(items)];
  const tagOptions = tags
    .map((t) => `<option value="${escapeHtml(t)}">${t === 'all' ? 'all tags' : escapeHtml(t)}</option>`)
    .join('');
  const cols = isPosts
    ? '<span class="tlo-mark"></span><span class="tlo-date">date</span><span class="tlo-cat">topic</span><span class="tlo-read">read</span><span class="tlo-title">title</span>'
    : '<span class="tlo-mark"></span><span class="tlo-cat">category</span><span class="tlo-read">state</span><span class="tlo-title">title</span>';
  el.innerHTML = `
<div class="tl-body">
  <div class="tl-list">
    <div class="tl-cols" aria-hidden="true">${cols}</div>
    <ul class="tl-results" id="tl-listbox" role="listbox" tabindex="0" aria-label="${kind} results"></ul>
  </div>
  <div class="rz rz-tl" data-resize="tl" role="separator" aria-orientation="vertical" tabindex="0" aria-label="resize results"></div>
  <div class="tl-preview" aria-live="polite"></div>
</div>
<div class="tl-input">
  <span class="tl-prompt">/</span>
  <input type="text" class="tl-query" role="combobox" aria-controls="tl-listbox"
         aria-expanded="true" autocomplete="off" spellcheck="false"
         aria-label="fuzzy filter ${kind}" placeholder="type to filter…">
  <select class="tl-tag" aria-label="filter by tag">${tagOptions}</select>
  <button type="button" class="tl-sort" aria-label="toggle sort order"></button>
  <span class="tl-count"></span>
</div>
<div class="tl-keys" aria-hidden="true"><b>j/k</b> move  <b>↵</b> open  <b>/</b> filter  <b>t/T</b> tag  <b>s</b> sort  <b>esc</b> list</div>`;

  const resultsEl = el.querySelector('.tl-results');
  const previewEl = el.querySelector('.tl-preview');
  const tagEl = el.querySelector('.tl-tag');
  const inputEl = el.querySelector('.tl-query');
  const countEl = el.querySelector('.tl-count');
  const sortEl = el.querySelector('.tl-sort');

  const total = items.length;
  const sortLabels = isPosts ? ['sort:newest', 'sort:oldest'] : ['sort:featured', 'sort:reversed'];
  let activeTag = 'all';
  let sortFlipped = false;
  let current = items.slice();
  let sel = 0;
  sortEl.textContent = sortLabels[0];

  const meta = (item) => {
    if (!isPosts) {
      return [item.category, item.lifecycle, item.provenance].filter(Boolean).join(' · ');
    }
    return [item.date, item.readingTime ? item.readingTime + ' min read' : '']
      .filter(Boolean).join(' · ');
  };

  const renderPreview = () => {
    const item = current[sel];
    if (!item) { previewEl.innerHTML = '<p class="muted">no matches</p>'; return; }
    const tagline = (item.tags || item.tech_stack || []).join(' · ');
    const base = item.url ? `/${String(item.url).replace(/^\//, '')}` : '';
    const toc = (item.headings || []).slice(0, 8)
      .map((h, i) => `<li><a href="${base}#${escapeHtml(h.id)}"><span class="tlp-n">${String(i + 1).padStart(2, '0')}</span>${escapeHtml(h.t)}</a></li>`)
      .join('');
    previewEl.innerHTML = `<p class="tlp-file">${escapeHtml(item.slug)}.md</p>
<h3>${escapeHtml(item.title)}</h3>
<p class="tl-meta">${escapeHtml(meta(item))}</p>
${tagline ? `<p class="tl-tags">${escapeHtml(tagline)}</p>` : ''}
<p class="tl-excerpt">${escapeHtml(item.excerpt || item.goal || '')}</p>
${toc ? `<div class="tlp-toc"><p class="tlp-label">contents</p><ol>${toc}</ol></div>` : ''}
${base ? `<p class="tlp-open"><a href="${base}">open ↵</a></p>` : ''}`;
  };

  const rowCells = (it) => {
    const title = `<span class="tlo-title">${escapeHtml(it.title)}</span>`;
    const mark = '<span class="tlo-mark" aria-hidden="true">▸</span>';
    if (!isPosts) {
      const catCls = `cat-${String(it.category || '').toLowerCase().replace(/\s+/g, '-')}`;
      return `${mark}<span class="tlo-cat ${catCls}">${escapeHtml(it.category || '')}</span><span class="tlo-read st-${escapeHtml(it.lifecycle || '')}">${escapeHtml(it.lifecycle || '')}</span>${title}`;
    }
    const topic = (it.tags || [])[0] || '';
    return `${mark}<span class="tlo-date">${escapeHtml(fmtDate(it.date))}</span><span class="tlo-cat tlo-c${tagColor(topic)}">${escapeHtml(topic)}</span><span class="tlo-read">${it.readingTime ? it.readingTime + 'm' : ''}</span>${title}`;
  };

  const renderResults = () => {
    resultsEl.innerHTML = current
      .map((it, i) => `<li class="tl-option${i === sel ? ' is-selected' : ''}" role="option"
        id="tl-opt-${i}" aria-selected="${i === sel}" data-i="${i}">${rowCells(it)}</li>`)
      .join('') || '<li class="tl-empty" role="option" aria-selected="false">no matches</li>';
    countEl.textContent = `${current.length}/${total}`;
    // Combobox pattern: activedescendant lives on the focused element (input
    // or listbox), so screen readers announce selection changes as keys move.
    const active = current.length ? `tl-opt-${sel}` : '';
    inputEl.setAttribute('aria-activedescendant', active);
    resultsEl.setAttribute('aria-activedescendant', active);
    const selEl = resultsEl.querySelector('.is-selected');
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
    renderPreview();
  };

  const refresh = () => {
    const base = filterByTag(sortFlipped ? items.slice().reverse() : items, activeTag);
    current = fuzzyMatch(inputEl.value, base, PICKER_KEYS);
    sel = 0;
    renderResults();
  };

  const go = () => {
    const item = current[sel];
    if (!item || !item.url) return;
    // echo the equivalent command into the scrollback (prompt.js listens)
    document.dispatchEvent(new CustomEvent('cmd:echo', { detail: { text: `open ${item.slug}` } }));
    navigate(item.url);
  };

  const toggleSort = () => {
    sortFlipped = !sortFlipped;
    sortEl.textContent = sortLabels[+sortFlipped];
    refresh();
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
    else if (e.key === 'Escape') { e.preventDefault(); resultsEl.focus({ preventScroll: true }); }
  });
  // vim-style keys anywhere in the browser once focus leaves the input
  el.addEventListener('keydown', (e) => {
    if (e.target === inputEl || e.target === tagEl || e.target.closest('.rz')) return;
    const k = e.key;
    if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (k === 'Enter') { e.preventDefault(); go(); }
    else if (k === '/') { e.preventDefault(); inputEl.focus({ preventScroll: true }); }
    else if (k === 't' || k === 'T') {
      // t cycles forward, T backward - passing a tag is not a dead end
      e.preventDefault();
      const n = tagEl.options.length;
      tagEl.selectedIndex = (tagEl.selectedIndex + (k === 't' ? 1 : n - 1)) % n;
      tagEl.dispatchEvent(new Event('change'));
    } else if (k === 's') { e.preventDefault(); toggleSort(); }
    else if (k === 'g') { e.preventDefault(); sel = 0; renderResults(); }
    else if (k === 'G') { e.preventDefault(); sel = Math.max(0, current.length - 1); renderResults(); }
  });
  resultsEl.addEventListener('click', (e) => {
    const li = e.target.closest('.tl-option');
    if (!li) return;
    sel = Number(li.dataset.i);
    renderResults();
    go();
  });
  tagEl.addEventListener('change', () => {
    activeTag = tagEl.value;
    refresh();
  });
  sortEl.addEventListener('click', toggleSort);

  refresh();
  // preventScroll: on mobile, autofocusing the input otherwise scrolls #pane
  // down into view (~390px jump). Focus lands here without moving the pane.
  inputEl.focus({ preventScroll: true });
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

// ---- Comments (giscus) ---------------------------------------------------

// initComments(): unhide the reader comments aside and lazy-load giscus when
// it scrolls into view. No-op when GISCUS.repo is unconfigured - the aside
// stays hidden and the reader keeps its full width.
function initComments() {
  const aside = document.querySelector('#pane [data-giscus]');
  if (!aside || !GISCUS || !GISCUS.repo) return;
  aside.hidden = false;
  const slot = aside.querySelector('.giscus-slot') || aside;
  const load = () => {
    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    const data = {
      repo: GISCUS.repo, 'repo-id': GISCUS.repoId, category: GISCUS.category,
      'category-id': GISCUS.categoryId, mapping: 'pathname', strict: '0',
      'reactions-enabled': '1', 'emit-metadata': '0', 'input-position': 'top',
      theme: 'transparent_dark', lang: 'en', loading: 'lazy',
    };
    for (const [k, v] of Object.entries(data)) s.setAttribute('data-' + k, String(v));
    slot.appendChild(s);
  };
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
    });
    io.observe(aside);
  } else {
    load();
  }
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
    initComments();
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
