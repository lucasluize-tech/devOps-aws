#!/usr/bin/env node
// scripts/build-content.js  (CommonJS, runs under native Node)
// Content compiler: markdown -> validated -> sanitized HTML -> pre-rendered dist pages
// + manifest + sitemap + build-info. This is the ONLY build step for the site.

const fs = require('fs');
const path = require('path');

const { parseMarkdown, calculateReadingTime } = require('../utils');
const { validatePost, validateProject } = require('./lib/schema');
const { renderMarkdown, extractScreenshotSlot, stripLeadingH1 } = require('./lib/render');
const {
  ORIGIN, pageHtml, postPane, projectPane, postsListPane, projectsListPane, galleryHtml,
  aboutPane, roadmapPane,
} = require('./lib/pages');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function readMd(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(abs, f), 'utf8');
      const { data, content } = parseMarkdown(raw);
      return { file: f, slug, data, content };
    });
}

function main() {
  // 1. clean + mkdir
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'posts'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'projects'), { recursive: true });

  const posts = readMd('posts');
  const projects = readMd('projects');

  // 2. validate everything; collect ALL errors before deciding to fail
  const errors = [];
  for (const p of posts)
    for (const e of validatePost(p.data, p.slug)) errors.push(`posts/${p.file}: ${e}`);
  for (const p of projects)
    for (const e of validateProject(p.data, p.slug)) errors.push(`projects/${p.file}: ${e}`);
  if (errors.length) {
    console.error(`Content validation failed (${errors.length} error(s)):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  const build = { sha: process.env.GITHUB_SHA || 'dev', time: new Date().toISOString() };

  // 3. render post bodies + build manifest entries + emit per-post pages
  const postManifest = posts.map((p) => {
    const bodyHtml = stripLeadingH1(renderMarkdown(p.content));
    const readingTime = calculateReadingTime(p.content);
    const url = `posts/${p.slug}.html`;
    const canonicalUrl = `${ORIGIN}/${url}`;
    return { p, bodyHtml, readingTime, url, canonicalUrl };
  });

  // 4. render project bodies (inject gallery at screenshot slot)
  const projManifest = projects.map((p) => {
    const rendered = stripLeadingH1(renderMarkdown(p.content));
    const { before, after } = extractScreenshotSlot(rendered);
    const bodyHtml = before + galleryHtml(p.data.screenshots, p.slug) + after;
    const url = `projects/${p.slug}.html`;
    const canonicalUrl = `${ORIGIN}/${url}`;
    return { p, bodyHtml, url, canonicalUrl };
  });

  // manifest arrays (sorted)
  const manifestPosts = postManifest
    .map(({ p, readingTime, url }) => ({
      slug: p.slug, title: p.data.title, excerpt: p.data.excerpt, date: p.data.date,
      tags: p.data.tags || [], readingTime, url,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // date DESC

  const manifestProjects = projManifest
    .map(({ p, url }) => ({
      slug: p.slug, title: p.data.title, goal: p.data.goal, category: p.data.category,
      lifecycle: p.data.lifecycle, featured_order: p.data.featured_order,
      provenance: p.data.provenance, tech_stack: p.data.tech_stack, url,
    }))
    .sort((a, b) => a.featured_order - b.featured_order); // featured_order ASC

  const manifest = { build, posts: manifestPosts, projects: manifestProjects };

  const write = (rel, content) => fs.writeFileSync(path.join(DIST, rel), content);

  // per-post pages
  for (const { p, bodyHtml, readingTime, url, canonicalUrl } of postManifest) {
    const pane = postPane({
      title: p.data.title, readingTime, tags: p.data.tags, bodyHtml, canonicalUrl,
    });
    write(url, pageHtml({
      title: p.data.title, description: p.data.excerpt, canonical: url, ogType: 'article',
      bodyClass: 'page-post', pane, manifest, active: 'posts.html',
      pageData: { type: 'post', slug: p.slug, title: p.data.title },
    }));
  }

  // per-project pages
  for (const { p, bodyHtml, url, canonicalUrl } of projManifest) {
    const pane = projectPane({
      title: p.data.title, category: p.data.category, lifecycle: p.data.lifecycle,
      provenance: p.data.provenance, techStack: p.data.tech_stack, goal: p.data.goal,
      github: p.data.github, demo: p.data.demo, bodyHtml,
    });
    write(url, pageHtml({
      title: p.data.title, description: p.data.goal, canonical: url, ogType: 'article',
      bodyClass: 'page-project', pane, manifest, active: 'projects.html',
      pageData: { type: 'project', slug: p.slug, title: p.data.title },
    }));
  }

  // 5. core pages
  const corePage = (file, { title, description, pane, active, bodyClass }) => write(file, pageHtml({
    title, description, canonical: file, ogType: 'website', bodyClass,
    pane, manifest, active, pageData: { type: 'page', page: file },
  }));

  corePage('index.html', {
    title: 'Lucas Luize - DevOps Engineer', bodyClass: 'page-index', active: 'index.html',
    description: 'Cloud DevOps portfolio, blog, and projects by Lucas Luize.',
    pane: `<section class="intro"><h1>Lucas Luize</h1><p class="muted">Cloud DevOps engineer. Infrastructure, automation, and the writing behind it.</p></section>${postsListPane(manifestPosts)}`,
  });
  corePage('posts.html', {
    title: 'Posts - Lucas Luize', bodyClass: 'page-posts', active: 'posts.html',
    description: 'Technical writing on DevOps, cloud infrastructure, and automation.',
    pane: `<h1>Posts</h1>${postsListPane(manifestPosts)}`,
  });
  corePage('projects.html', {
    title: 'Projects - Lucas Luize', bodyClass: 'page-projects', active: 'projects.html',
    description: 'Infrastructure and automation projects by Lucas Luize.',
    pane: `<h1>Projects</h1>${projectsListPane(manifestProjects)}`,
  });
  corePage('about.html', {
    title: 'About - Lucas Luize', bodyClass: 'page-about', active: 'about.html',
    description: 'About Lucas Luize, cloud DevOps engineer.',
    pane: aboutPane(),
  });
  corePage('roadmap.html', {
    title: 'Roadmap - Lucas Luize', bodyClass: 'page-roadmap', active: 'roadmap.html',
    description: 'What Lucas Luize is learning and building next.',
    pane: roadmapPane(),
  });
  corePage('contact.html', {
    title: 'Contact - Lucas Luize', bodyClass: 'page-contact', active: 'contact.html',
    description: 'Get in touch with Lucas Luize.',
    pane: `<h1>Contact</h1><p><a href="mailto:lucasluize@gmail.com">lucasluize@gmail.com</a></p>`,
  });
  corePage('404.html', {
    title: 'Not found - Lucas Luize', bodyClass: 'page-404', active: 'index.html',
    description: 'Page not found.',
    pane: `<h1>404</h1><p>That path does not resolve. <a href="/">Back to index</a>.</p>`,
  });

  // 6. redirect stubs (slug querystring -> pretty path)
  const stub = (kind) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Redirecting</title></head><body><script>var s=new URLSearchParams(location.search).get('slug');location.replace(s?'/${kind}/'+encodeURIComponent(s)+'.html':'/');</script></body></html>`;
  write('post.html', stub('posts'));
  write('project.html', stub('projects'));

  // 7. manifest, sitemap, build-info
  write('manifest.json', JSON.stringify(manifest, null, 2));
  write('build-info.json', JSON.stringify(build, null, 2));

  const urls = [
    'index.html', 'about.html', 'posts.html', 'projects.html', 'roadmap.html', 'contact.html',
    ...manifestPosts.map((p) => p.url),
    ...manifestProjects.map((p) => p.url),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ORIGIN}/${u}</loc></url>`).join('\n')}
</urlset>
`;
  write('sitemap.xml', sitemap);

  // 8. static assets: app/ (shell, Task 5), raw markdown (noscript), project images
  const appSrc = path.join(ROOT, 'app');
  if (fs.existsSync(appSrc)) fs.cpSync(appSrc, path.join(DIST, 'app'), { recursive: true });
  const favicon = path.join(ROOT, 'favicon.svg');
  if (fs.existsSync(favicon)) fs.copyFileSync(favicon, path.join(DIST, 'favicon.svg'));
  for (const p of posts)
    fs.copyFileSync(path.join(ROOT, 'posts', p.file), path.join(DIST, 'posts', p.file));
  for (const p of projects)
    fs.copyFileSync(path.join(ROOT, 'projects', p.file), path.join(DIST, 'projects', p.file));
  const imgSrc = path.join(ROOT, 'projects', 'images');
  if (fs.existsSync(imgSrc)) fs.cpSync(imgSrc, path.join(DIST, 'projects', 'images'), { recursive: true });

  console.log(`Built dist/: ${manifestPosts.length} posts, ${manifestProjects.length} projects, sha=${build.sha}`);
}

main();
