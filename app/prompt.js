// app/prompt.js - terminal prompt command engine + contact wizard (ES module,
// dual-exported for Jest like router.js/buffers.js). parseCommand() is pure
// (no DOM/fetch) so it is unit-testable under plain Node; everything with a
// side effect (navigation, rendering, fetch) lives in the DOM wiring below.
import { navigate } from './router.js';
import { initStatus } from './buffers.js';
import { CONTACT_ENDPOINT } from './config.js';

const CONTACT_EMAIL = 'me@lucasluize.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LEN = 2000;

// Workspace names resolvable by `open <x>` / `cd <x>`, on top of post/project slugs.
const WORKSPACES = {
  index: '/index.html',
  home: '/index.html',
  about: '/about.html',
  posts: '/posts.html',
  projects: '/projects.html',
  roadmap: '/roadmap.html',
  contact: '/contact.html',
};
const WORKSPACE_NAMES = ['index', 'about', 'posts', 'projects', 'roadmap', 'contact'];

const HELP_LINES = [
  'available commands:',
  '  help                 this list',
  '  ls [posts|projects]  list workspaces, or slugs in a section',
  '  open <x>, cd <x>     go to a workspace or a post/project slug',
  '  cat <slug>           open a post or project by slug',
  '  whoami               about page',
  '  status               session telemetry',
  '  contact              start the contact wizard',
  '  clear                clear this scrollback',
];

function findSlug(list, slug) {
  return (list || []).find((it) => it.slug === slug) || null;
}

// resolveTarget: workspace names first, then post slugs, then project slugs.
// Returns a url string, or null if nothing matches.
function resolveTarget(target, manifest) {
  if (!target) return WORKSPACES.index;
  const t = target.toLowerCase();
  if (WORKSPACES[t]) return WORKSPACES[t];
  const post = findSlug(manifest.posts, t);
  if (post) return `/posts/${post.slug}.html`;
  const project = findSlug(manifest.projects, t);
  if (project) return `/projects/${project.slug}.html`;
  return null;
}

function lsSection(list, label) {
  if (!list || !list.length) return [`${label}: (none)`];
  return list.map((it) => `${it.slug} - ${it.title}`);
}

// parseCommand: pure. `input` is the raw prompt text, `manifest` is
// { posts: [{slug,title}], projects: [{slug,title}] }.
export function parseCommand(input, manifest) {
  const m = manifest || {};
  const parts = String(input || '').trim().split(/\s+/).filter(Boolean);
  const cmd = (parts[0] || '').toLowerCase();
  if (!cmd) return { kind: 'print', lines: [] };
  const arg = parts[1];

  switch (cmd) {
    case 'help':
      return { kind: 'print', lines: HELP_LINES.slice() };

    case 'ls': {
      const section = arg ? arg.toLowerCase() : '';
      if (section === 'posts') return { kind: 'print', lines: lsSection(m.posts, 'posts') };
      if (section === 'projects') return { kind: 'print', lines: lsSection(m.projects, 'projects') };
      return {
        kind: 'print',
        lines: [`workspaces: ${WORKSPACE_NAMES.join(' ')}`, "run 'ls posts' or 'ls projects' to list content"],
      };
    }

    case 'open':
    case 'cd': {
      const url = resolveTarget(arg, m);
      if (url) return { kind: 'nav', url };
      return { kind: 'print', lines: [`${cmd}: ${arg}: No such file or directory - try 'help'`] };
    }

    case 'cat': {
      if (!arg) return { kind: 'print', lines: ["cat: missing operand - try 'cat <slug>'"] };
      const slug = arg.toLowerCase();
      const post = findSlug(m.posts, slug);
      if (post) return { kind: 'nav', url: `/posts/${post.slug}.html` };
      const project = findSlug(m.projects, slug);
      if (project) return { kind: 'nav', url: `/projects/${project.slug}.html` };
      return { kind: 'print', lines: [`cat: ${arg}: No such file or directory`] };
    }

    case 'whoami':
      return { kind: 'nav', url: '/about.html' };

    case 'status':
      return { kind: 'status' };

    case 'contact':
      return { kind: 'wizard' };

    case 'clear':
      return { kind: 'clear' };

    default:
      return { kind: 'print', lines: [`bash: ${cmd}: command not found - try 'help'`] };
  }
}

// ---- DOM wiring (not unit-tested here; Task 10 covers this end-to-end) ---

function scrollbackEl() {
  return document.querySelector('[data-scrollback]');
}

function appendLine(text, cls) {
  const sb = scrollbackEl();
  if (!sb) return null;
  const div = document.createElement('div');
  div.className = cls || 'sb-line';
  div.textContent = text;
  sb.appendChild(div);
  sb.scrollTop = sb.scrollHeight;
  return div;
}

function appendLines(lines, cls) {
  for (const l of lines || []) appendLine(l, cls);
}

function appendEcho(text) {
  appendLine('> ' + text, 'sb-line sb-echo');
}

function appendStatus() {
  const sb = scrollbackEl();
  if (!sb) return;
  const div = document.createElement('div');
  div.className = 'sb-line sb-status';
  sb.appendChild(div);
  initStatus(div);
  sb.scrollTop = sb.scrollHeight;
}

function clearScrollback() {
  const sb = scrollbackEl();
  if (sb) sb.textContent = '';
}

// appendMailtoFallback: honest failure message + a real mailto: link, built
// via DOM APIs (never innerHTML) so user-entered name/email/message can never
// break out as markup.
function appendMailtoFallback(payload) {
  appendLine('could not reach the contact service right now - email me directly:');
  const sb = scrollbackEl();
  if (!sb) return;
  const subject = encodeURIComponent(`Contact from ${payload.name}`);
  const body = encodeURIComponent(`${payload.message}\n\n- ${payload.name} (${payload.email})`);
  const a = document.createElement('a');
  a.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  a.className = 'sb-mailto';
  a.textContent = `mailto:${CONTACT_EMAIL}`;
  const div = document.createElement('div');
  div.className = 'sb-line';
  div.appendChild(a);
  sb.appendChild(div);
  sb.scrollTop = sb.scrollHeight;
}

async function sendContact(payload) {
  if (!CONTACT_ENDPOINT) { appendMailtoFallback(payload); return; }
  appendLine('sending...');
  try {
    const res = await fetch(CONTACT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    appendLine('message sent - thanks, I will get back to you soon.', 'sb-line sb-ok');
  } catch (_) {
    appendMailtoFallback(payload);
  }
}

// initPrompt: wires form[data-prompt] on every page (chrome, outside #pane,
// so it survives pjax swaps - init once). Reads window.__PAGE__.manifest
// fresh on each submit since the router replaces it after every pane swap.
export function initPrompt() {
  const form = document.querySelector('form[data-prompt]');
  if (!form) return;
  const input = form.querySelector('input[name="cmd"]');
  const honeypot = form.querySelector('[data-hp]');
  if (!input) return;

  const history = [];
  let histIdx = -1;
  let wizard = null;

  // Keep the input exactly as wide as its content so the blinking block
  // cursor (label::after) sits right after the typed text. Programmatic
  // value changes (history recall, submit clear) call this explicitly
  // because they don't fire 'input'.
  const sizeInput = () => {
    input.style.width = Math.max(1, input.value.length + 1) + 'ch';
  };
  input.addEventListener('input', sizeInput);
  sizeInput();

  function startWizard() {
    wizard = { step: 'name', data: {}, start: Date.now() };
    appendLines(['starting contact wizard - Esc to cancel', 'name:']);
  }

  function cancelWizard() {
    wizard = null;
    appendLine('wizard cancelled.');
  }

  async function finishWizard() {
    const { name, email, message } = wizard.data;
    const t = Date.now() - wizard.start;
    const spam = !!(honeypot && honeypot.value);
    wizard = null;
    if (spam) {
      // Silently pretend success - never let a bot learn the honeypot worked.
      appendLine('message sent - thanks, I will get back to you soon.', 'sb-line sb-ok');
      return;
    }
    await sendContact({ name, email, message, website: '', t });
  }

  function stepWizard(raw) {
    const text = raw.trim();
    appendEcho(text);
    switch (wizard.step) {
      case 'name':
        if (!text) { appendLine('name cannot be empty. name:'); return; }
        wizard.data.name = text;
        wizard.step = 'email';
        appendLine('email:');
        return;
      case 'email':
        if (!EMAIL_RE.test(text)) { appendLine("that doesn't look like a valid email. email:"); return; }
        wizard.data.email = text;
        wizard.step = 'message';
        appendLine('message:');
        return;
      case 'message':
        if (!text) { appendLine('message cannot be empty. message:'); return; }
        if (text.length > MAX_MESSAGE_LEN) {
          appendLine(`message too long (max ${MAX_MESSAGE_LEN} chars, got ${text.length}). message:`);
          return;
        }
        wizard.data.message = text;
        wizard.step = 'confirm';
        appendLines([
          `name:    ${wizard.data.name}`,
          `email:   ${wizard.data.email}`,
          `message: ${wizard.data.message}`,
          'send? [Y/n]',
        ]);
        return;
      case 'confirm': {
        const yes = text === '' || /^y(es)?$/i.test(text);
        if (!yes) { cancelWizard(); return; }
        finishWizard();
        return;
      }
      default:
        wizard = null;
    }
  }

  function act(result) {
    switch (result.kind) {
      case 'nav': navigate(result.url); break;
      case 'print': appendLines(result.lines); break;
      case 'clear': clearScrollback(); break;
      case 'status': appendStatus(); break;
      case 'wizard': startWizard(); break;
      default: break;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = input.value;
    input.value = '';
    sizeInput();
    histIdx = -1;
    if (wizard) { stepWizard(raw); return; }
    const text = raw.trim();
    if (!text) return;
    history.push(text);
    appendEcho(text);
    const manifest = (window.__PAGE__ && window.__PAGE__.manifest) || { posts: [], projects: [] };
    act(parseCommand(text, manifest));
  });

  input.addEventListener('keydown', (event) => {
    if (wizard && event.key === 'Escape') {
      event.preventDefault();
      cancelWizard();
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!history.length) return;
      event.preventDefault();
      histIdx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      input.value = history[histIdx];
      sizeInput();
    } else if (event.key === 'ArrowDown') {
      if (histIdx < 0) return;
      event.preventDefault();
      histIdx += 1;
      if (histIdx >= history.length) { histIdx = -1; input.value = ''; }
      else input.value = history[histIdx];
      sizeInput();
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPrompt);
  } else {
    initPrompt();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseCommand, initPrompt };
}
