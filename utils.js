// utils.js - Shared utility functions

// Parses markdown with front-matter
function parseMarkdown(md) {
  const parts = md.split(/^---$/m);
  let data = {};
  let content = md;
  if (parts.length >= 3) {
    const front = parts[1].trim();
    content = parts.slice(2).join('---').trim();
    try {
      data = jsyaml.load(front);
    } catch (e) {
      console.error('Error parsing front-matter:', e);
    }
  }
  return { data, content };
}

// Calculates reading time
function calculateReadingTime(content) {
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / 200);
}

// If in Node.js, export; else, attach to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseMarkdown, calculateReadingTime };
} else {
  window.parseMarkdown = parseMarkdown;
  window.calculateReadingTime = calculateReadingTime;
}