// app/prompt.js - terminal prompt command engine + contact wizard (ES module,
// dual-exported for Jest like router.js/buffers.js). parseCommand() is pure
// (no DOM/fetch) so it is unit-testable under plain Node; everything with a
// side effect (navigation, rendering, fetch) lives in the DOM wiring below.
import { navigate } from './router.js';
import { initStatus } from './buffers.js';
import { getDraft, updateDraft, resetDraft, draftLines, EMAIL_RE, submitDraft, draftAgeMs } from './draft.js';

const CONTACT_EMAIL = 'me@lucasluize.com';
const MAX_MESSAGE_LEN = 2000;

// Workspace names resolvable by `open <x>` / `cd <x>`, on top of post/project slugs.
const WORKSPACES = {
  index: '/index.html',
  home: '/index.html',
  '~': '/index.html',
  about: '/about.html',
  posts: '/posts.html',
  projects: '/projects.html',
  roadmap: '/roadmap.html',
  contact: '/contact.html',
};
const WORKSPACE_NAMES = ['index', 'about', 'posts', 'projects', 'roadmap', 'contact'];

const FORTUNES = [
  'the best infrastructure is the kind nobody notices.',
  'it works on my machine - so I shipped my machine (a container).',
  'a backup you have never restored is a rumor, not a backup.',
  'DNS. It is always DNS.',
  'automate the boring, keep the interesting.',
  'uptime is a feature. so is sleep.',
];

const HELP_LINES = [
  'available commands:',
  '  help                 this list',
  '  ls [posts|projects]  list workspaces, or slugs in a section',
  '  open <x>, cd <x>     go to a workspace or a post/project slug',
  '  cd .. / cd -         up one level / back (history)',
  '  cat <slug>           open a post or project by slug',
  '  whoami               about page',
  '  status               session telemetry',
  '  contact              start the contact wizard',
  '  mail lucas           compose a message (or: contact)',
  '  eggs                 fun things to try',
  '  clear                clear this scrollback',
  '  tab                  autocomplete commands and slugs',
  '  ctrl+/               focus this prompt from anywhere',
];

const EGG_LINES = [
  'fun things to try:',
  '  sudo hire lucas      fortune      coffee',
  '  rm -rf /             man lucas    uname -a',
  '  sl                   cmatrix      neofetch',
  'more hatching soon.',
];

const TRAIN_LINES = [
  '      ====        ________ ',
  '  _D _|  |_______/        \\__I_I_____===__|____',
  '   |(_)---  |   H\\________/ |   |        =|___ _',
  '   /     |  |   H  |  |     |   |         ||_| |',
  '  |      |  |   H  |__------------------| [___] ',
  '  | ________|___H__/__|_____/[][]~\\_______|     ',
  '  |/ |   |-----------I_____I [][] []  D   |=====',
  'choo choo. (sl: you meant ls, but enjoy the ride)',
];

// submitDraft's fill-time (t); reset on wizard start and `mail`/`compose`.
let composeStart = Date.now();

const IN_CONTACT = (path) => /contact/.test(path || '');
const DRAFT_FIELDS = ['name', 'email', 'subject', 'message'];
const NO_DRAFT_HERE = { kind: 'print', lines: ["no draft here - try 'cd contact' first"] };

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
// { posts: [{slug,title}], projects: [{slug,title}] }, `path` is the current
// pathname (needed only by `cd ..`).
export function parseCommand(input, manifest, path) {
  const m = manifest || {};
  const parts = String(input || '').trim().split(/\s+/).filter(Boolean);
  const cmd = (parts[0] || '').toLowerCase();
  if (!cmd) return { kind: 'print', lines: [] };
  const arg = parts[1];
  const rest = parts.slice(1).join(' ');

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
      if (arg === '-') return { kind: 'back' };
      if (arg === '..') {
        // reader page -> its section; anywhere else -> home
        const parent = /^\/(posts|projects)\/.+/.exec(path || '');
        return { kind: 'nav', url: parent ? `/${parent[1]}.html` : '/index.html' };
      }
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
    case 'neofetch':
      return { kind: 'nav', url: '/about.html' };

    // ---- easter eggs (deliberately absent from `help` - poke around) ----
    case 'sudo': {
      if (parts.slice(1).join(' ').toLowerCase() === 'hire lucas') {
        return { kind: 'print', lines: ['permission granted. welcome aboard.'], cls: 'sb-line lolcat' };
      }
      return { kind: 'print', lines: ['lucas is not in the sudoers file. This incident will be reported.'] };
    }
    case 'rm':
      return { kind: 'print', lines: [`rm: cannot remove '${arg || '/'}': read-only filesystem (S3 + CloudFront)`] };
    case 'fortune':
      return { kind: 'print', lines: [FORTUNES[Math.floor(Math.random() * FORTUNES.length)]] };
    case 'uptime':
      return { kind: 'print', lines: ['up 3 years, 7 shipped projects, uncountable cups of coffee'] };
    case 'eggs':
      return { kind: 'print', lines: EGG_LINES.slice() };
    case 'coffee':
      return { kind: 'print', cls: 'sb-line lolcat', lines: ['   ( (', '    ) )', '  ........', '  |      |]', '  \\      /', "   `----'", 'brewing...'] };
    case 'sl':
      return { kind: 'print', cls: 'sb-line lolcat', lines: TRAIN_LINES.slice() };
    case 'cmatrix':
      return { kind: 'print', cls: 'sb-line sb-ok', lines: ['wake up, neo...', 'this terminal only rains sixteen colors. try `sl` instead.'] };
    case 'uname':
      return { kind: 'print', lines: ['Linux devops 6.8.0-lucas #1 SMP PREEMPT x86_64 GNU/Linux'] };
    case 'man': {
      // `man lucas` opens the about page - the man page lives there now.
      if (arg && arg.toLowerCase() === 'lucas') return { kind: 'nav', url: '/about.html' };
      return { kind: 'print', lines: [`No manual entry for ${arg || '(none)'}`] };
    }

    case 'status':
      return { kind: 'status' };

    case 'contact':
      return { kind: 'wizard' };

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

    case 'clear':
      return { kind: 'clear' };

    default:
      return { kind: 'print', lines: [`bash: ${cmd}: command not found - try 'help'`] };
  }
}

// ---- tab completion (pure, unit-testable) --------------------------------

// Commands worth completing: the advertised set (eggs stay discoverable).
const COMPLETABLE = ['cancel', 'cat', 'cd', 'clear', 'compose', 'contact', 'draft', 'eggs', 'help', 'ls', 'mail', 'man', 'open', 'send', 'set', 'status', 'whoami'];

function argPool(cmd, manifest) {
  const m = manifest || {};
  const slugs = [...(m.posts || []), ...(m.projects || [])].map((it) => it.slug);
  switch (cmd) {
    case 'open':
    case 'cd': return [...WORKSPACE_NAMES, '..', ...slugs];
    case 'cat': return slugs;
    case 'ls': return ['posts', 'projects'];
    case 'man': return ['lucas'];
    case 'mail': return ['lucas'];
    case 'set': return DRAFT_FIELDS;
    default: return [];
  }
}

function longestCommonPrefix(list) {
  return list.reduce((acc, s) => {
    let i = 0;
    while (i < acc.length && i < s.length && acc[i] === s[i]) i++;
    return acc.slice(0, i);
  });
}

// completeCommand(input, manifest) -> null (nothing to do),
// { value } (input replaced), or { candidates } (ambiguous, bash-style list).
export function completeCommand(input, manifest) {
  const text = String(input || '');
  if (!text.trim()) return null;
  const parts = text.split(/\s+/).filter(Boolean);
  const completingCmd = parts.length === 1 && !text.endsWith(' ');
  const prefix = text.endsWith(' ') ? '' : parts[parts.length - 1].toLowerCase();
  const pool = completingCmd ? COMPLETABLE : argPool((parts[0] || '').toLowerCase(), manifest);
  const matches = pool.filter((c) => c.startsWith(prefix)).sort();
  if (!matches.length) return null;
  const head = text.slice(0, text.length - prefix.length);
  if (matches.length === 1) return { value: head + matches[0] + (completingCmd ? ' ' : '') };
  const lcp = longestCommonPrefix(matches);
  if (lcp.length > prefix.length) return { value: head + lcp };
  return { candidates: matches };
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
// via DOM APIs (never innerHTML) - draft shape (name, email, subject, message).
function appendMailtoFallback(payload) {
  appendLine('could not reach the contact service right now - email me directly:');
  const sb = scrollbackEl();
  if (!sb) return;
  const subject = encodeURIComponent(payload.subject || `Contact from ${payload.name}`);
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

function renderSendResult(result) {
  if (result.ok) { appendLine('✓ message sent - thanks, I will get back to you soon.', 'sb-line sb-ok'); return; }
  if (result.reason === 'validation') { appendLines(['send: validation failed', ...result.errors]); return; }
  if (result.reason === 'rate') { appendLines(['send: temporarily unavailable', '429 too many requests - please wait before sending another message.']); return; }
  appendLines(['send: relay unavailable', 'The message was not submitted. Nothing has been lost - your draft is still here.']);
  appendMailtoFallback(getDraft());
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
  let sendInFlight = false; // guards the direct-call fallback (no compose form on the page)

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
    wizard = { step: 'name' };
    composeStart = Date.now();
    appendLines(['starting contact wizard - Esc to cancel', 'name:']);
  }

  function cancelWizard() {
    wizard = null;
    appendLine('wizard cancelled.');
  }

  // runSend reads the shared draft (app/draft.js) - the single source of
  // truth both the wizard and the composer form write through.
  async function finishWizard() {
    wizard = null;
    await runSend();
  }

  // single-flight: compose owns it when its form is on the page (dispatches
  // 'draft:sent' when done, rendered below); otherwise call submitDraft direct.
  async function runSend() {
    if (document.querySelector('form[data-compose]')) {
      appendLine('sending message...');
      document.dispatchEvent(new CustomEvent('draft:send'));
      return; // compose runs the flight (its own re-entry guard applies); 'draft:sent' listener renders here
    }
    if (sendInFlight) return; // re-entry guard: wizard confirm / `send` can't double-fire
    sendInFlight = true;
    appendLine('sending message...');
    try {
      const hp = honeypot ? honeypot.value : '';
      const age = draftAgeMs();
      const result = await submitDraft({ website: hp, t: age === null ? Date.now() - composeStart : age }, (n, label, ok) => {
        appendLine(`[${n}/3] ${label.padEnd(22)} ${ok ? 'ok' : 'failed'}`);
      });
      renderSendResult(result);
    } finally {
      sendInFlight = false;
    }
  }

  function stepWizard(raw) {
    const text = raw.trim();
    appendEcho(text);
    switch (wizard.step) {
      case 'name':
        if (!text) { appendLine('name cannot be empty. name:'); return; }
        updateDraft({ name: text }, 'shell');
        wizard.step = 'email';
        appendLine('email:');
        return;
      case 'email':
        if (!EMAIL_RE.test(text)) { appendLine("that doesn't look like a valid email. email:"); return; }
        updateDraft({ email: text }, 'shell');
        wizard.step = 'subject';
        appendLine('subject:');
        return;
      case 'subject':
        if (!text) { appendLine('subject cannot be empty. subject:'); return; }
        updateDraft({ subject: text }, 'shell');
        wizard.step = 'message';
        appendLine('message:');
        return;
      case 'message': {
        if (!text) { appendLine('message cannot be empty. message:'); return; }
        if (text.length > MAX_MESSAGE_LEN) {
          appendLine(`message too long (max ${MAX_MESSAGE_LEN} chars, got ${text.length}). message:`);
          return;
        }
        updateDraft({ message: text }, 'shell');
        wizard.step = 'confirm';
        const d = getDraft();
        appendLines([
          `name:    ${d.name}`,
          `email:   ${d.email}`,
          `subject: ${d.subject}`,
          `message: ${d.message}`,
          'send? [Y/n]',
        ]);
        return;
      }
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
      case 'back': history.back(); break;
      case 'print': appendLines(result.lines, result.cls); break;
      case 'clear': clearScrollback(); break;
      case 'status': appendStatus(); break;
      case 'wizard': startWizard(); break;
      case 'mail': {
        composeStart = Date.now();
        if (result.subject !== undefined) updateDraft({ subject: result.subject }, 'shell');
        const onContact = /contact/.test(location.pathname);
        if (!onContact) { navigate('/contact.html'); }
        // focus the first empty field once the pane exists
        requestAnimationFrame(() => {
          const f = document.querySelector('#cf-name');
          if (f) f.focus({ preventScroll: true });
        });
        appendLine('composing - fill the form or use: set <field> <value>, draft, send');
        break;
      }
      case 'draft-show':
        appendLines(draftLines(getDraft()));
        break;
      case 'draft-set':
        updateDraft({ [result.field]: result.value }, 'shell');
        appendLine(`${result.field} set.`);
        break;
      case 'draft-send':
        runSend();
        break;
      case 'draft-cancel':
        resetDraft('shell');
        appendLine('draft discarded.');
        break;
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
    act(parseCommand(text, manifest, location.pathname));
  });

  // Ctrl+/ focuses the prompt from anywhere (advertised in `help`).
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === '/') {
      event.preventDefault();
      input.focus({ preventScroll: true });
    }
  });

  // compose.js dispatches this after its own submitDraft result - scrollback
  // summary for a form-initiated send (no staging lines duplicated here).
  document.addEventListener('draft:sent', (event) => {
    renderSendResult(event.detail);
  });

  // Tour handoff (buffers.js): print the tip + hand focus to the prompt.
  document.addEventListener('prompt:tip', (event) => {
    if (event.detail && event.detail.text) appendLine(event.detail.text, 'sb-line sb-ok');
    input.focus({ preventScroll: true });
  });

  // Autofocus on landing (desktop only - mobile would pop the keyboard), but
  // never steal focus from a buffer that claimed it first (telescope query).
  if (
    typeof matchMedia === 'function' && matchMedia('(min-width: 768px)').matches &&
    (!document.activeElement || document.activeElement === document.body)
  ) {
    input.focus({ preventScroll: true });
  }

  // Click echo: clicking any internal navigation prints the equivalent
  // command - the mouse-first way visitors discover the hidden command
  // interface. Runs after router.js's own click listener (listener order).
  document.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = event.target.closest && event.target.closest('a');
    if (!a || a.target === '_blank') return;
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('/') || href.startsWith('//')) return; // internal only
    const path = href.split('#')[0];
    const reader = /^\/(posts|projects)\/(.+)\.html$/.exec(path);
    if (reader) { appendEcho(`open ${reader[2]}`); return; }
    const name = path.replace(/^\//, '').replace(/\.html$/, '');
    appendEcho(!name || name === 'index' ? 'cd ~' : `cd ${name}`);
  });
  // Telescope picks echo `open <slug>` (buffers.js dispatches, no import cycle).
  document.addEventListener('cmd:echo', (event) => {
    if (event.detail && event.detail.text) appendEcho(event.detail.text);
  });

  input.addEventListener('keydown', (event) => {
    if (wizard && event.key === 'Escape') {
      event.preventDefault();
      cancelWizard();
      return;
    }
    // Tab completes commands and slugs (empty input keeps Tab's normal focus
    // move; browsers reserve ctrl+tab, so plain Tab is the terminal way).
    if (event.key === 'Tab' && !event.ctrlKey && !wizard && input.value.trim()) {
      event.preventDefault();
      const manifest = (window.__PAGE__ && window.__PAGE__.manifest) || { posts: [], projects: [] };
      const r = completeCommand(input.value, manifest);
      if (!r) return;
      if (r.value) { input.value = r.value; sizeInput(); }
      else if (r.candidates) appendLine(r.candidates.join('   '), 'sb-line');
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
  module.exports = { parseCommand, completeCommand, initPrompt };
}
