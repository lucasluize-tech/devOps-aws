// app/router.js - pushState router: swaps #pane content between shell pages
// without full reloads (pjax). ES module; auto-inits click/popstate listeners
// on load in the browser. isInternalNav is dual-exported so Jest can require
// it directly under Node (no document/fetch there).
import { markActiveNav } from './shell.js';

// isInternalNav: true for same-origin, http(s), non-.md, non-hash-only page urls.
export function isInternalNav(href, origin) {
  if (typeof href !== 'string' || href === '' || href.startsWith('#')) return false;
  let url;
  try {
    url = new URL(href, origin);
  } catch (_) {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.origin !== origin) return false;
  if (/\.md$/i.test(url.pathname)) return false;
  return true;
}

function errorBlock(url) {
  return `<div class="pane-error">
<h1>curl: (7) failed to fetch</h1>
<p class="muted">${url}</p>
<button type="button" data-retry>[retry]</button>
</div>`;
}

function showError(pane, url) {
  pane.innerHTML = errorBlock(url);
  const btn = pane.querySelector('[data-retry]');
  if (btn) btn.addEventListener('click', () => navigate(url), { once: true });
}

// swapTo: fetches url, swaps #pane + <title>, re-marks active nav, focuses the
// new h1. push=true also pushes history state (skip on popstate replays).
async function swapTo(url, push) {
  const pane = document.getElementById('pane');
  if (!pane) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newPane = doc.getElementById('pane');
    if (!newPane) throw new Error('response missing #pane');

    pane.innerHTML = newPane.innerHTML;
    document.title = doc.title;
    // Refresh window.__PAGE__ from the fetched page so buffers (telescope items,
    // page kind) read the new page's data, then let them re-boot into the pane.
    const m = html.match(/window\.__PAGE__ = (.*);<\/script>/);
    if (m) { try { window.__PAGE__ = JSON.parse(m[1]); } catch (_) { /* keep old */ } }
    if (push) history.pushState({}, '', url);
    markActiveNav(new URL(url, location.origin).pathname);
    document.dispatchEvent(new CustomEvent('pane:swapped', { detail: { url } }));

    const h1 = pane.querySelector('h1');
    if (h1) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus();
    }
    pane.scrollTo({ top: 0 });
  } catch (_) {
    showError(pane, url);
  }
}

export function navigate(url) {
  return swapTo(url, true);
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = event.target.closest && event.target.closest('a');
    if (!a || a.target === '_blank') return;
    if (!isInternalNav(a.href, location.origin)) return;
    event.preventDefault();
    navigate(a.href);
  });

  // popstate replays the swap for the now-current location without pushing
  // history again (the browser already moved the history pointer).
  window.addEventListener('popstate', () => {
    swapTo(location.href, false);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isInternalNav, navigate };
}
