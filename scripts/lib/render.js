// scripts/lib/render.js  (CommonJS - required by Jest and the native-Node build)
const { Marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

const MARKER = '<!-- screenshots -->';

// Languages actually used by content fences (grep '^```' posts/ projects/).
const SHIKI_LANGS = ['bash', 'hcl', 'yaml', 'javascript', 'toml', 'python', 'json', 'ini', 'powershell'];

// Custom textmate theme built from the site palette (terminal.css :root):
// violet keywords, cyan functions, green strings, orange numbers, pink
// tags/properties, muted italic comments - the lazyvim look, at build time.
const THEME = {
  name: 'lucas-terminal',
  type: 'dark',
  colors: { 'editor.background': '#14121a', 'editor.foreground': '#ece9f1' },
  settings: [
    { settings: { background: '#14121a', foreground: '#ece9f1' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#8b8697', fontStyle: 'italic' } },
    { scope: ['string', 'punctuation.definition.string'], settings: { foreground: '#34d399' } },
    { scope: ['keyword', 'storage.type', 'storage.modifier', 'keyword.control'], settings: { foreground: '#c4b5fd' } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call.generic'], settings: { foreground: '#67e8f9' } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character'], settings: { foreground: '#f97316' } },
    { scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.class'], settings: { foreground: '#fbbf24' } },
    { scope: ['entity.name.tag', 'support.type.property-name', 'variable.other.property', 'meta.object-literal.key'], settings: { foreground: '#f472b6' } },
    { scope: ['variable', 'variable.other', 'variable.parameter'], settings: { foreground: '#ece9f1' } },
    { scope: ['keyword.operator'], settings: { foreground: '#f472b6' } },
    { scope: ['punctuation'], settings: { foreground: '#8b8697' } },
  ],
};

// Module-level highlighter: null until initHighlighter() resolves (the build
// awaits it; Jest never calls it, so tests exercise the escaped fallback).
let highlighter = null;

// initHighlighter: dynamic import because shiki is ESM-only and this file is
// CommonJS. codeToHtml is synchronous once the highlighter exists.
async function initHighlighter() {
  const { createHighlighter } = await import('shiki');
  highlighter = await createHighlighter({ themes: [THEME], langs: SHIKI_LANGS });
  return highlighter;
}

function escapeCode(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Every fence renders as a mini terminal window: title bar with the language
// name + a copy button (wired by one delegated listener in app/shell.js),
// then the (highlighted, when shiki is up) <pre>.
function codeRenderer({ text, lang }) {
  const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
  let inner;
  if (highlighter && language && SHIKI_LANGS.includes(language)) {
    inner = highlighter
      .codeToHtml(text, { lang: language, theme: 'lucas-terminal' })
      .replace('<pre class="shiki', `<pre class="shiki language-${language}`);
  } else {
    const cls = language ? ` class="language-${language}"` : '';
    inner = `<pre><code${cls}>${escapeCode(text)}\n</code></pre>`;
  }
  return `<div class="code-window"><div class="code-bar"><span class="code-lang">${language || 'text'}</span><button class="code-copy" type="button" aria-label="copy" title="copy">📋</button></div>${inner}</div>\n`;
}

const md = new Marked({ renderer: { code: codeRenderer } });

function renderMarkdown(input) {
  const raw = md.parse(input.replace(MARKER, `<div data-screenshot-slot></div>`));
  const clean = sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'div', 'span', 'button']),
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'loading'],
      code: ['class'],
      pre: ['class', 'style'],
      span: ['class', 'style'],
      button: ['class', 'type', 'aria-label', 'title'],
      div: ['data-screenshot-slot', 'class'],
      h2: ['id'],
    },
    // shiki emits inline token styles; allow only color-ish declarations.
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-fA-F]{3,8}$/],
        'background-color': [/^#[0-9a-fA-F]{3,8}$/],
        'font-style': [/^italic$/],
        'font-weight': [/^(bold|[1-9]00)$/],
      },
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
  });
  // Code fences render as horizontally-scrollable <pre>; make them keyboard-
  // focusable so keyboard users can scroll them (axe scrollable-region-focusable).
  // Added post-sanitize so the tabindex survives. \b variant also catches
  // shiki's attributed <pre class=... style=...>.
  return clean
    .replace(/<pre\b(?![^>]*tabindex)/g, '<pre tabindex="0"')
    // anchor ids on h2s so the telescope preview's CONTENTS can deep-link
    .replace(/<h2>([\s\S]*?)<\/h2>/g, (m, inner) => `<h2 id="${slugifyHeading(inner)}">${inner}</h2>`);
}

// slugifyHeading: shared by the h2-id pass above and build-content.js's
// manifest headings, so preview TOC hrefs always match the rendered ids.
function slugifyHeading(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractScreenshotSlot(html) {
  const [before, after = ''] = html.split(/<div data-screenshot-slot[^>]*><\/div>/);
  return { before, after };
}

// Drop a leading <h1> from a rendered body: the pane already emits the
// front-matter title as its own <h1>, so a body that opens with "# Title"
// would double-title the page.
function stripLeadingH1(html) {
  return html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '');
}

module.exports = { renderMarkdown, extractScreenshotSlot, stripLeadingH1, slugifyHeading, initHighlighter, MARKER };
