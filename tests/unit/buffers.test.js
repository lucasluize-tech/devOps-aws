// tests/unit/buffers.test.js - pure picker helpers (no DOM needed).
// fuzzyMatch / filterByTag / getTagsFromManifest operate on the FLAT manifest
// shape: [{ slug, title, excerpt, tags, url, ... }].
const { fuzzyMatch, filterByTag, getTagsFromManifest } = require('../../app/buffers.js');

const POSTS = [
  { slug: 'aws-s3', title: 'Private S3 with CloudFront', excerpt: 'Serve a private bucket over HTTPS', tags: ['aws', 's3', 'cdn'], url: '/posts/aws-s3.html' },
  { slug: 'terraform-vpc', title: 'Terraform VPC modules', excerpt: 'Reusable network modules', tags: ['terraform', 'aws'], url: '/posts/terraform-vpc.html' },
  { slug: 'ci-cd', title: 'CI/CD with GitHub Actions', excerpt: 'Test-gated deploys', tags: ['ci', 'automation'], url: '/posts/ci-cd.html' },
];
const KEYS = ['title', 'excerpt', 'tags'];

describe('getTagsFromManifest', () => {
  test('returns sorted unique tags', () => {
    expect(getTagsFromManifest(POSTS)).toEqual(['automation', 'aws', 'cdn', 'ci', 's3', 'terraform']);
  });
  test('handles items with no tags', () => {
    expect(getTagsFromManifest([{ title: 'x' }, { title: 'y', tags: ['a'] }])).toEqual(['a']);
  });
  test('empty input -> []', () => {
    expect(getTagsFromManifest([])).toEqual([]);
  });
});

describe('filterByTag', () => {
  test('filters to items carrying the tag', () => {
    expect(filterByTag(POSTS, 'aws').map((p) => p.slug)).toEqual(['aws-s3', 'terraform-vpc']);
  });
  test("'all' returns everything", () => {
    expect(filterByTag(POSTS, 'all')).toHaveLength(3);
  });
  test('falsy tag returns everything', () => {
    expect(filterByTag(POSTS, '')).toHaveLength(3);
    expect(filterByTag(POSTS, null)).toHaveLength(3);
  });
  test('unknown tag returns []', () => {
    expect(filterByTag(POSTS, 'nope')).toEqual([]);
  });
});

describe('fuzzyMatch', () => {
  test('empty query returns all in original order', () => {
    expect(fuzzyMatch('', POSTS, KEYS).map((p) => p.slug)).toEqual(['aws-s3', 'terraform-vpc', 'ci-cd']);
  });
  test('matches across title/excerpt/tags', () => {
    expect(fuzzyMatch('terraform', POSTS, KEYS).map((p) => p.slug)).toEqual(['terraform-vpc']);
  });
  test('substring match on tags, ranked by earliest position', () => {
    // both aws-s3 (tag "aws" at idx 0) and terraform-vpc (tag "aws" later) match;
    // aws-s3's match is earlier -> ranks first.
    expect(fuzzyMatch('aws', POSTS, KEYS).map((p) => p.slug)).toEqual(['aws-s3', 'terraform-vpc']);
  });
  test('non-contiguous subsequence still matches', () => {
    // 't','f','v' is a subsequence of "Terraform VPC" only.
    expect(fuzzyMatch('tfv', POSTS, KEYS).map((p) => p.slug)).toEqual(['terraform-vpc']);
  });
  test('no match -> []', () => {
    expect(fuzzyMatch('xyzzy', POSTS, KEYS)).toEqual([]);
  });
  test('case-insensitive', () => {
    expect(fuzzyMatch('CLOUDFRONT', POSTS, KEYS).map((p) => p.slug)).toEqual(['aws-s3']);
  });
  test('contiguous substring ranks above scattered subsequence', () => {
    const ranked = fuzzyMatch('abc', [{ title: 'zzabcz' }, { title: 'a-b-c' }], ['title']);
    expect(ranked.map((i) => i.title)).toEqual(['zzabcz', 'a-b-c']);
  });
});
