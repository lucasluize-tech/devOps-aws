// tests/unit/render.test.js
const { renderMarkdown, extractScreenshotSlot } = require('../../scripts/lib/render.js');

test('renders markdown to html', () => {
  expect(renderMarkdown('# Hi\n\nbody')).toContain('<h1');
});
test('strips script tags and event handlers', () => {
  const out = renderMarkdown('hello <script>alert(1)</script> <img src=x onerror=alert(1)>');
  expect(out).not.toContain('<script');
  expect(out).not.toContain('onerror');
});
test('keeps code blocks with language class', () => {
  expect(renderMarkdown('```bash\nls\n```')).toMatch(/class="[^"]*language-bash/);
});
test('screenshot marker splits content', () => {
  const html = renderMarkdown('before\n\n<!-- screenshots -->\n\nafter');
  const { before, after } = extractScreenshotSlot(html);
  expect(before).toContain('before');
  expect(after).toContain('after');
});
