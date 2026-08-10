// scripts/lib/render.mjs  (CommonJS-compatible via module.exports for Jest)
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

const MARKER = '<!-- screenshots -->';

function renderMarkdown(md) {
  const raw = marked.parse(md.replace(MARKER, `<div data-screenshot-slot></div>`));
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'div', 'span']),
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'loading'],
      code: ['class'], pre: ['class'], div: ['data-screenshot-slot'], span: ['class'],
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
  });
}

function extractScreenshotSlot(html) {
  const [before, after = ''] = html.split(/<div data-screenshot-slot[^>]*><\/div>/);
  return { before, after };
}

module.exports = { renderMarkdown, extractScreenshotSlot, MARKER };
