// tests/unit/router-paths.test.js - pure isInternalNav() logic (no DOM needed).
const { isInternalNav } = require('../../app/router.js');

const ORIGIN = 'https://devops.lucasluize.com';

describe('isInternalNav', () => {
  test('absolute same-origin page url -> true', () => {
    expect(isInternalNav('https://devops.lucasluize.com/posts.html', ORIGIN)).toBe(true);
  });

  test('relative same-origin page url -> true', () => {
    expect(isInternalNav('/about.html', ORIGIN)).toBe(true);
  });

  test('external origin -> false', () => {
    expect(isInternalNav('https://github.com/lucasluize', ORIGIN)).toBe(false);
  });

  test('mailto: link -> false', () => {
    expect(isInternalNav('mailto:x@y.com', ORIGIN)).toBe(false);
  });

  test('tel: link -> false', () => {
    expect(isInternalNav('tel:+15555555555', ORIGIN)).toBe(false);
  });

  test('raw .md link -> false', () => {
    expect(isInternalNav('/posts/foo.md', ORIGIN)).toBe(false);
  });

  test('hash-only link -> false', () => {
    expect(isInternalNav('#top', ORIGIN)).toBe(false);
  });
});
