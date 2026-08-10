const { execSync } = require('child_process');
const fs = require('fs');
jest.setTimeout(30000);

beforeAll(() => { execSync('node scripts/build-content.js', { stdio: 'pipe' }); });

test('dist contains a page per post and project plus core pages', () => {
  const manifest = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  expect(manifest.posts.length).toBeGreaterThan(0);
  for (const p of manifest.posts) expect(fs.existsSync(`dist/posts/${p.slug}.html`)).toBe(true);
  for (const p of manifest.projects) expect(fs.existsSync(`dist/projects/${p.slug}.html`)).toBe(true);
  for (const f of ['index.html', 'posts.html', 'projects.html', 'about.html', 'roadmap.html',
                   'contact.html', '404.html', 'post.html', 'sitemap.xml', 'build-info.json'])
    expect(fs.existsSync(`dist/${f}`)).toBe(true);
});
test('post pages carry unique meta and pre-rendered content', () => {
  const manifest = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  const p = manifest.posts[0];
  const html = fs.readFileSync(`dist/posts/${p.slug}.html`, 'utf8');
  expect(html).toContain(`<title>${p.title}`);
  expect(html).toContain('property="og:title"');
  expect(html).toContain(`rel="canonical" href="https://devops.lucasluize.com/posts/${p.slug}.html"`);
  expect(html).toMatch(/<main id="pane"[\s\S]*<h1/);
});
test('projects in manifest are ordered by featured_order', () => {
  const m = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  const orders = m.projects.map(p => p.featured_order);
  expect(orders).toEqual([...orders].sort((a, b) => a - b));
});
test('noscript block lists every post', () => {
  const m = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  const html = fs.readFileSync('dist/index.html', 'utf8');
  const noscript = html.match(/<noscript>[\s\S]*?<\/noscript>/)[0];
  for (const p of m.posts) expect(noscript).toContain(`/posts/${p.slug}.md`);
});
