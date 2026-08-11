// tests/unit/shell-cwd.test.js - pure pathToCwd() mapping.
const { pathToCwd } = require('../../app/shell.js');

test('root and index map to ~', () => {
  expect(pathToCwd('/')).toBe('~');
  expect(pathToCwd('/index.html')).toBe('~');
});
test('workspace pages map to ~/name', () => {
  expect(pathToCwd('/posts.html')).toBe('~/posts');
  expect(pathToCwd('/about.html')).toBe('~/about');
});
test('reader pages map to ~/section/slug', () => {
  expect(pathToCwd('/posts/proxmox-lab.html')).toBe('~/posts/proxmox-lab');
  expect(pathToCwd('/projects/ha-proxmox.html')).toBe('~/projects/ha-proxmox');
});
test('falsy input falls back to ~', () => {
  expect(pathToCwd('')).toBe('~');
});
