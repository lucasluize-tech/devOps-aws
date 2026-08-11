// app/resize.js - draggable pane dividers (ES module, dual-exported for Jest).
// Every middle-facing border is a real 6px grid track holding a [data-resize]
// separator. Dragging writes a CSS custom property on the owning container;
// sizes persist in localStorage and restore on boot / pane swaps. Keyboard:
// separators are focusable, arrows move 16px. Pure math (nextSize) is
// unit-testable under plain Node.

// Per-divider config. `invert` = the sized element sits on the far side of
// the divider (dragging toward it shrinks the delta-positive direction).
const RESIZERS = {
  side: {
    cssVar: '--side-w', axis: 'x', min: 140, max: 420, invert: false,
    container: '.workspace', sized: 'nav[aria-label="workspaces"]',
  },
  console: {
    cssVar: '--console-h', axis: 'y', min: 60, max: 600, invert: true,
    container: '.workspace', sized: '[data-scrollback]',
  },
  tl: {
    cssVar: '--tl-w', axis: 'x', min: 160, max: 640, invert: false,
    container: '.tl-body', sized: '.tl-results',
  },
  comments: {
    cssVar: '--comments-w', axis: 'x', min: 240, max: 560, invert: true,
    container: '.reader-split', sized: '.comments',
  },
};

const KEY_STEP = 16;

// nextSize: pure drag math. start px + pointer delta -> clamped next size.
export function nextSize(start, delta, { invert, min, max }) {
  const raw = start + (invert ? -delta : delta);
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function store(name, px) {
  try { localStorage.setItem('rz:' + name, String(px)); } catch (_) { /* private mode */ }
}

function stored(name) {
  try {
    const v = parseInt(localStorage.getItem('rz:' + name), 10);
    return Number.isFinite(v) ? v : null;
  } catch (_) { return null; }
}

function containerFor(el, cfg) {
  return el.closest(cfg.container) || document.querySelector(cfg.container);
}

function apply(el, cfg, name, px) {
  const c = containerFor(el, cfg);
  if (c) c.style.setProperty(cfg.cssVar, px + 'px');
  store(name, px);
}

function currentSize(el, cfg) {
  const c = containerFor(el, cfg);
  const sized = c && c.querySelector(cfg.sized);
  if (!sized) return null;
  const rect = sized.getBoundingClientRect();
  return cfg.axis === 'x' ? rect.width : rect.height;
}

// restoreSizes: re-applies persisted sizes to whatever containers exist right
// now. Runs at boot and after every pjax swap (in-pane dividers are rebuilt).
export function restoreSizes() {
  for (const [name, cfg] of Object.entries(RESIZERS)) {
    const px = stored(name);
    if (px == null) continue;
    const el = document.querySelector(`[data-resize="${name}"]`);
    if (!el) continue;
    const c = containerFor(el, cfg);
    if (c) c.style.setProperty(cfg.cssVar, Math.min(cfg.max, Math.max(cfg.min, px)) + 'px');
  }
}

function onPointerDown(event) {
  const el = event.target.closest && event.target.closest('[data-resize]');
  if (!el) return;
  const cfg = RESIZERS[el.dataset.resize];
  if (!cfg) return;
  const start = currentSize(el, cfg);
  if (start == null) return;
  event.preventDefault();
  el.setPointerCapture(event.pointerId);
  el.classList.add('is-dragging');
  const startPos = cfg.axis === 'x' ? event.clientX : event.clientY;

  const onMove = (ev) => {
    const pos = cfg.axis === 'x' ? ev.clientX : ev.clientY;
    apply(el, cfg, el.dataset.resize, nextSize(start, pos - startPos, cfg));
  };
  const onUp = () => {
    el.classList.remove('is-dragging');
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

function onKeyDown(event) {
  const el = event.target.closest && event.target.closest('[data-resize]');
  if (!el) return;
  const cfg = RESIZERS[el.dataset.resize];
  if (!cfg) return;
  const keys = cfg.axis === 'x'
    ? { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }
    : { ArrowUp: -KEY_STEP, ArrowDown: KEY_STEP };
  const delta = keys[event.key];
  if (delta == null) return;
  const start = currentSize(el, cfg);
  if (start == null) return;
  event.preventDefault();
  apply(el, cfg, el.dataset.resize, nextSize(start, delta, cfg));
}

export function initResize() {
  restoreSizes();
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pane:swapped', restoreSizes);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResize);
  } else {
    initResize();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextSize, restoreSizes, initResize };
}
