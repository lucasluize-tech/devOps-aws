const { parseMarkdown, collectTags, filterPosts, searchPosts } = require('../../utils');
const fs = require('fs');
const path = require('path');

// Unit tests for index.js functions

describe('parseMarkdown', () => {
  it('should parse s3-cloudfront-oac-acm-static-site.md', () => {
    const mdFile = path.join(__dirname, '..', '..', 'posts', 's3-cloudfront-oac-acm-static-site.md');
    const md = fs.readFileSync(mdFile, 'utf8');
    const result = parseMarkdown(md);
    expect(result.data.title).toBe('From Static S3 to CDN with HTTPS: My First DevOps Project on AWS');
    expect(result.data.slug).toBe('s3-cloudfront-oac-acm-static-site');
    expect(result.content).toContain('# From Static S3 to CDN with HTTPS');
  });

  it('should parse infrastructure-as-code-terraform.md', () => {
    const mdFile = path.join(__dirname, '..', '..', 'posts', 'infrastructure-as-code-terraform.md');
    const md = fs.readFileSync(mdFile, 'utf8');
    const result = parseMarkdown(md);
    expect(result.data.title).toBe('Infrastructure as Code with Terraform: Best Practices');
    expect(result.data.slug).toBe('infrastructure-as-code-terraform');
    expect(result.content).toContain('# Infrastructure as Code with Terraform');
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
