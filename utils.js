// utils.js - Markdown parsing helpers consumed by the build step (scripts/build-content.js)
// and content-valid unit tests. Runtime rendering lives in app/ (ES modules); markdown is
// an authoring format compiled at build time, never parsed in the browser.

// Parses markdown with front-matter
function parseMarkdown(md) {
  // Normalize line endings
  const normalizedMd = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedMd.split('\n');
  let data = {};
  let content = normalizedMd;
  if (lines[0] === '---') {
    const endIndex = lines.indexOf('---', 1);
    if (endIndex > 0) {
      const front = lines.slice(1, endIndex).join('\n');
      content = lines.slice(endIndex + 1).join('\n').trim();
      try {
        if (typeof module !== 'undefined' && module.exports) {
          const matter = require('gray-matter');
          const result = matter(normalizedMd);
          return { data: result.data, content: result.content };
        } else {
          // Manual parsing fallback for browser without gray-matter
          const frontLines = front.split('\n');
          let currentArrayKey = null;
          let currentArray = null;
          frontLines.forEach(line => {
            const arrayItemMatch = line.match(/^\s+-\s+(.*)$/);
            if (currentArrayKey && arrayItemMatch) {
              let item = arrayItemMatch[1].trim();
              if (item.startsWith('"') && item.endsWith('"')) item = item.slice(1, -1);
              currentArray.push(item);
              return;
            }
            currentArrayKey = null;
            currentArray = null;
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
              const trimmedKey = key.trim();
              let value = valueParts.join(':').trim();
              if (value === '') {
                currentArrayKey = trimmedKey;
                currentArray = [];
                data[trimmedKey] = currentArray;
                return;
              }
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              } else if (value.startsWith('[') && value.endsWith(']')) {
                try { value = JSON.parse(value); } catch (e) { /* keep string */ }
              }
              data[trimmedKey] = value;
            }
          });
        }
      } catch (e) {
        console.error('Error parsing front-matter:', e);
      }
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
