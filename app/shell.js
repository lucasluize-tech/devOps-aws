// app/shell.js - terminal shell chrome behaviour (ES module, auto-runs on load).
// - marks the active sidebar item from location.pathname (robust for later pjax nav)
// - runs the statusline clock (HH:MM:SS, 1s tick)
// - loads the build SHA into [data-sha]; shows "dev" on any failure, never blank.

function markActiveNav() {
  const links = document.querySelectorAll('nav[aria-label="workspaces"] a');
  if (!links.length) return;
  // Normalise "/" -> "/index.html" so the home tab lights up at the root path.
  let path = location.pathname;
  if (path === '/' || path === '') path = '/index.html';
  let matched = null;
  for (const a of links) {
    const href = new URL(a.getAttribute('href'), location.origin).pathname;
    if (href === path) matched = a;
  }
  // Fallback: keep the build-time aria-current if nothing matched (e.g. post pages).
  if (!matched) return;
  for (const a of links) a.removeAttribute('aria-current');
  matched.setAttribute('aria-current', 'page');
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

function initShell() {
  markActiveNav();
  startClock();
  loadSha();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShell);
} else {
  initShell();
}

export { initShell };
