// tests/unit/render.test.js
const { renderMarkdown, extractScreenshotSlot, stripLeadingH1 } = require('../../scripts/lib/render.js');

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

describe('stripLeadingH1', () => {
  test('strips a leading h1 that is the first content', () => {
    expect(stripLeadingH1('<h1>Title</h1><p>body</p>')).toBe('<p>body</p>');
  });
  test('no-op when body does not start with an h1', () => {
    expect(stripLeadingH1('<p>hi</p><h1>later</h1>')).toBe('<p>hi</p><h1>later</h1>');
    expect(stripLeadingH1('<h2>Sub</h2><p>x</p>')).toBe('<h2>Sub</h2><p>x</p>');
  });
  test('strips leading whitespace before the h1', () => {
    expect(stripLeadingH1('\n  <h1>Title</h1><p>body</p>')).toBe('<p>body</p>');
  });
  test('strips an attributed leading h1', () => {
    expect(stripLeadingH1('<h1 id="x">T</h1><p>body</p>')).toBe('<p>body</p>');
  });
  test('removes ONLY the leading h1, preserving content and a later h1', () => {
    const out = stripLeadingH1('<h1>Title</h1><p>mid</p><h1>Deeper</h1><p>end</p>');
    expect(out).toBe('<p>mid</p><h1>Deeper</h1><p>end</p>');
    expect(out).toContain('<p>mid</p>');
    expect(out).toContain('<h1>Deeper</h1>');
  });
});
