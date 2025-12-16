// utils.js - Shared utility functions

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
          // Manual parsing for browser
          const frontLines = front.split('\n');
          frontLines.forEach(line => {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length) {
              let value = valueParts.join(':').trim();
              if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
              data[key.trim()] = value;
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

// Collects unique tags from posts
function collectTags(posts) {
  const allTags = new Set();
  posts.forEach(({ data }) => {
    if (data.tags) data.tags.forEach(tag => allTags.add(tag));
  });
  return Array.from(allTags).sort();
}

// Filters posts by tag
function filterPosts(posts, filter) {
  if (filter === 'all') return posts;
  return posts.filter(({ data }) => data.tags && data.tags.includes(filter));
}

// Searches posts by title, excerpt, or tags
function searchPosts(posts, searchTerm) {
  if (!searchTerm) return posts;
  const term = searchTerm.toLowerCase();
  return posts.filter(({ data }) => {
    const title = data.title.toLowerCase();
    const excerpt = data.excerpt.toLowerCase();
    const tags = data.tags ? data.tags.join(' ').toLowerCase() : '';
    return title.includes(term) || excerpt.includes(term) || tags.includes(term);
  });
}

// If in Node.js, export; else, attach to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseMarkdown, calculateReadingTime, collectTags, filterPosts, searchPosts };
} else {
  window.parseMarkdown = parseMarkdown;
  window.calculateReadingTime = calculateReadingTime;
  window.collectTags = collectTags;
  window.filterPosts = filterPosts;
  window.searchPosts = searchPosts;
}
