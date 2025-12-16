const { parseMarkdown, calculateReadingTime } = require('../utils');

// Unit tests for post.js functions

describe('parseMarkdown', () => {
  it('should parse markdown with front-matter', () => {
    const md = `---
title: Test
---
Content`;
    const result = parseMarkdown(md);
    expect(result.data.title).toBe('Test');
    expect(result.content.trim()).toBe('Content');
  });
});

describe('calculateReadingTime', () => {
  it('should calculate reading time', () => {
    const content = 'word '.repeat(399); // 399 words
    const time = calculateReadingTime(content);
    expect(time).toBe(2); // 399 / 200 = 2
  });
});