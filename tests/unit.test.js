const jsyaml = require('js-yaml');

// Unit tests for index.js functions

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

  it('should handle markdown without front-matter', () => {
    const md = 'Just content';
    const result = parseMarkdown(md);
    expect(result.data).toEqual({});
    expect(result.content).toBe(md);
  });
});

describe('collectTags', () => {
  it('should collect unique tags', () => {
    const posts = [
      { data: { tags: ['a', 'b'] } },
      { data: { tags: ['b', 'c'] } }
    ];
    const tags = collectTags(posts);
    expect(tags).toEqual(['a', 'b', 'c']);
  });
});

describe('filterPosts', () => {
  const posts = [
    { data: { tags: ['a'] } },
    { data: { tags: ['b'] } }
  ];

  it('should return all posts for "all"', () => {
    const result = filterPosts(posts, 'all');
    expect(result).toEqual(posts);
  });

  it('should filter posts by tag', () => {
    const result = filterPosts(posts, 'a');
    expect(result).toEqual([posts[0]]);
  });
});

describe('searchPosts', () => {
  const posts = [
    { data: { title: 'Test A', excerpt: 'Desc A', tags: ['tag1'] } },
    { data: { title: 'Test B', excerpt: 'Desc B', tags: ['tag2'] } }
  ];

  it('should return all posts if no search term', () => {
    const result = searchPosts(posts, '');
    expect(result).toEqual(posts);
  });

  it('should search by title', () => {
    const result = searchPosts(posts, 'Test A');
    expect(result).toEqual([posts[0]]);
  });

  it('should search by excerpt', () => {
    const result = searchPosts(posts, 'Desc B');
    expect(result).toEqual([posts[1]]);
  });

  it('should search by tags', () => {
    const result = searchPosts(posts, 'tag1');
    expect(result).toEqual([posts[0]]);
  });
});