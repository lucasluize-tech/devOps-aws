const jsyaml = require('js-yaml');

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
    const content = 'word '.repeat(400); // 400 words
    const time = calculateReadingTime(content);
    expect(time).toBe(2); // 400 / 200 = 2
  });
});