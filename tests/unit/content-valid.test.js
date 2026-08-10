const fs = require('fs'); const path = require('path');
const { validatePost, validateProject } = require('../../scripts/lib/schema.js');
const { parseMarkdown, calculateReadingTime } = require('../../utils');

function files(dir) { return fs.readdirSync(dir).filter(f => f.endsWith('.md')); }

test('all posts pass schema', () => {
  for (const f of files('posts')) {
    const { data } = parseMarkdown(fs.readFileSync(path.join('posts', f), 'utf8'));
    expect({ file: f, errors: validatePost(data, f.replace(/\.md$/, '')) })
      .toEqual({ file: f, errors: [] });
  }
});
test('all projects pass schema', () => {
  for (const f of files('projects')) {
    const { data } = parseMarkdown(fs.readFileSync(path.join('projects', f), 'utf8'));
    expect({ file: f, errors: validateProject(data, f.replace(/\.md$/, '')) })
      .toEqual({ file: f, errors: [] });
  }
});

// calculateReadingTime is Math.ceil(words / 200), words = content.split(/\s+/).length.
// Live consumer: scripts/build-content.js computes reading time on every post/project page.
describe('calculateReadingTime', () => {
  it('rounds a short text up to 1 min', () => {
    expect(calculateReadingTime('hello world foo')).toBe(1); // 3 words -> ceil(3/200) = 1
  });
  it('returns 2 min at exactly 400 words', () => {
    expect(calculateReadingTime(Array(400).fill('word').join(' '))).toBe(2); // ceil(400/200) = 2
  });
  it('rounds a longer text up to 3 min', () => {
    expect(calculateReadingTime(Array(401).fill('word').join(' '))).toBe(3); // ceil(401/200) = 3
  });
});
