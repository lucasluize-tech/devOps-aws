// utils.js - Shared utility functions

let matter;
if (typeof module !== 'undefined' && module.exports) {
  matter = require('gray-matter');
} else {
  // Assumes gray-matter is loaded via CDN in browser
  matter = window.grayMatter;
}

// Parses markdown with front-matter
function parseMarkdown(md) {
  try {
    const result = matter(md);
    return { data: result.data, content: result.content };
  } catch (e) {
    console.error('Error parsing front-matter:', e);
    return { data: {}, content: md };
  }
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