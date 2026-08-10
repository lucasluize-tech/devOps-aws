// scripts/lib/render.js  (CommonJS - required by Jest and the native-Node build)
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

const MARKER = '<!-- screenshots -->';

function renderMarkdown(md) {
  const raw = marked.parse(md.replace(MARKER, `<div data-screenshot-slot></div>`));
  const clean = sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'div', 'span']),
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'loading'],
      code: ['class'], pre: ['class'], div: ['data-screenshot-slot'], span: ['class'],
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
  });
  // Code fences render as horizontally-scrollable <pre>; make them keyboard-
  // focusable so keyboard users can scroll them (axe scrollable-region-focusable).
  // Added post-sanitize so the tabindex survives.
  return clean.replace(/<pre>/g, '<pre tabindex="0">');
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

module.exports = { renderMarkdown, extractScreenshotSlot, stripLeadingH1, MARKER };
