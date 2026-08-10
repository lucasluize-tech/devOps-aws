const fs = require('fs'); const path = require('path');
const { validatePost, validateProject } = require('../../scripts/lib/schema.mjs');
const { parseMarkdown } = require('../../utils');

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
