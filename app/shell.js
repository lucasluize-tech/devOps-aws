// app/shell.js - terminal shell chrome behaviour (ES module, auto-runs on load).
// - marks the active sidebar item from location.pathname (robust for later pjax nav)
// - runs the statusline clock (HH:MM:SS, 1s tick)
// - loads the build SHA into [data-sha]; shows "dev" on any failure, never blank.

// pathToCwd: pathname -> shell-style cwd for the prompt + statusline.
// '/' and '/index.html' -> '~'; '/posts.html' -> '~/posts';
// '/posts/x.html' -> '~/posts/x'. Pure - unit-tested.
function pathToCwd(pathname) {
  let p = (pathname || '/').replace(/\.html$/, '');
  if (p === '/' || p === '/index') return '~';
  return '~' + p.replace(/\/$/, '');
}

// updateCwd: reflect the current path in the prompt label + statusline.
function updateCwd(pathname) {
  const cwd = pathToCwd(pathname || location.pathname);
  for (const el of document.querySelectorAll('[data-cwd], [data-path]')) el.textContent = cwd;
}

// pathname defaults to location.pathname; router.js (Task 7) passes the
// pushState destination explicitly after a pane swap.
function markActiveNav(pathname) {
  const links = document.querySelectorAll('nav[aria-label="workspaces"] a');
  if (!links.length) return;
  // Normalise "/" -> "/index.html" so the home tab lights up at the root path.
  let path = pathname || location.pathname;
  if (path === '/' || path === '') path = '/index.html';
  let matched = null;
  for (const a of links) {
    const href = new URL(a.getAttribute('href'), location.origin).pathname;
    if (href === path) matched = a;
  }
  // Fallback: keep the build-time aria-current if nothing matched (e.g. post pages).
  if (!matched) return;
  for (const a of links) { a.removeAttribute('aria-current'); a.removeAttribute('title'); }
  matched.setAttribute('aria-current', 'page');
  matched.setAttribute('title', 'active workspace');
}

function startClock() {
  const el = document.querySelector('[data-clock]');
  if (!el) return;
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

async function loadSha() {
  const el = document.querySelector('[data-sha]');
  if (!el) return;
  let sha = 'dev';
  try {
    const res = await fetch('/build-info.json', { cache: 'no-cache' });
    if (res.ok) {
      const info = await res.json();
      if (info && typeof info.sha === 'string' && info.sha) sha = info.sha.slice(0, 7);
    }
  } catch (_) {
    // network/parse failure -> keep "dev"
  }
  el.textContent = sha;
}

// One delegated listener wires every .code-copy button (present and future -
// pjax swaps replace pane content, delegation doesn't care).
function initCodeCopy() {
  document.addEventListener('click', async (event) => {
    const btn = event.target.closest && event.target.closest('.code-copy');
    if (!btn) return;
    const pre = btn.closest('.code-window')?.querySelector('pre');
    if (!pre) return;
    // Keep aria-label in sync with the visual state: the emoji glyph has no
    // accessible name of its own.
    const setState = (text, label) => {
      btn.textContent = text;
      btn.setAttribute('aria-label', label);
    };
    try {
      await navigator.clipboard.writeText(pre.textContent.replace(/\n$/, ''));
      setState('✓', 'copied!');
      btn.classList.add('copied');
    } catch (_) {
      setState('✗', 'failed');
    }
    setTimeout(() => {
      setState('📋', 'copy');
      btn.classList.remove('copied');
    }, 1500);
  });
}

function initShell() {
  markActiveNav();
  updateCwd();
  startClock();
  loadSha();
  initCodeCopy();
  // keep prompt cwd + statusline path in step with pjax navigation
  document.addEventListener('pane:swapped', (event) => {
    try { updateCwd(new URL(event.detail.url, location.origin).pathname); }
    catch (_) { updateCwd(); }
  });
}

// Guarded so router.js can `import { markActiveNav }` under Jest (node env,
// no document) without this auto-init running.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
}

export { initShell, markActiveNav, pathToCwd };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initShell, markActiveNav, pathToCwd };
}
