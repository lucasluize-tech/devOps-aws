// tests/unit/schema.test.js
const { validatePost, validateProject } = require('../../scripts/lib/schema.mjs');

const goodPost = { title: 'T', author: 'Lucas', excerpt: 'E', date: '2026-08-10',
  slug: 'good-post', tags: ['DevOps'] };
const goodProject = { title: 'T', slug: 'good-proj', category: 'infrastructure',
  lifecycle: 'production', goal: 'G', date: '2026-08-10', tech_stack: ['Proxmox'],
  featured_order: 1, repo_visibility: 'private', provenance: 'prod',
  screenshots: [{ file: 'arch.webp', alt: 'Architecture', caption: 'Failover' }] };

test('valid post/project return no errors', () => {
  expect(validatePost(goodPost, 'good-post')).toEqual([]);
  expect(validateProject(goodProject, 'good-proj')).toEqual([]);
});
test('slug must match filename and slug format', () => {
  expect(validatePost({ ...goodPost, slug: 'other' }, 'good-post')).not.toEqual([]);
  expect(validatePost({ ...goodPost, slug: 'Bad_Slug' }, 'Bad_Slug')).not.toEqual([]);
});
test('missing required fields fail', () => {
  for (const f of ['title', 'excerpt', 'date', 'slug'])
    expect(validatePost({ ...goodPost, [f]: undefined }, 'good-post')).not.toEqual([]);
});
test('lifecycle, provenance, date, screenshots are constrained', () => {
  expect(validateProject({ ...goodProject, lifecycle: 'in production' }, 'good-proj')).not.toEqual([]);
  expect(validateProject({ ...goodProject, provenance: 'work' }, 'good-proj')).not.toEqual([]);
  expect(validateProject({ ...goodProject, date: 'yesterday' }, 'good-proj')).not.toEqual([]);
  expect(validateProject({ ...goodProject, screenshots: [{ file: '../../etc/passwd.png', alt: 'x' }] }, 'good-proj')).not.toEqual([]);
  expect(validateProject({ ...goodProject, screenshots: [{ file: 'a.webp' }] }, 'good-proj')).not.toEqual([]); // alt required
});
test('featured_order must be a positive integer', () => {
  expect(validateProject({ ...goodProject, featured_order: 0 }, 'good-proj')).not.toEqual([]);
});
