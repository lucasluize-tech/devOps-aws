// scripts/lib/pages.js  (CommonJS) - pure string builders for dist pages.
// pageHtml() wraps a pre-rendered pane in the terminal-shell skeleton. The shell
// CSS/JS (/app/terminal.css, /app/shell.js) arrive in Task 5; output is unstyled now.

const ORIGIN = 'https://devops.lucasluize.com';

const NAV = [
  ['index.html', 'index'],
  ['about.html', 'about'],
  ['posts.html', 'posts'],
  ['projects.html', 'projects'],
  ['roadmap.html', 'roadmap'],
  ['contact.html', 'contact'],
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(s) { return esc(s); }

// Deterministic noscript block built from the manifest: plain links to every core
// page, plus raw markdown for every post/project so content is reachable JS-off.
function noscriptLinks(manifest) {
  const li = (href, text) => `<li><a href="${attr(href)}">${esc(text)}</a></li>`;
  const core = NAV.map(([href, label]) => li('/' + href, label)).join('');
  const posts = (manifest.posts || [])
    .map((p) => li(`/posts/${p.slug}.md`, p.title)).join('');
  const projects = (manifest.projects || [])
    .map((p) => li(`/projects/${p.slug}.md`, p.title)).join('');
  return `<noscript>
<nav aria-label="site (no javascript)">
<ul>${core}</ul>
<h2>Posts</h2><ul>${posts}</ul>
<h2>Projects</h2><ul>${projects}</ul>
</nav>
</noscript>`;
}

function sidebar(active) {
  const items = NAV.map(([href, label]) => {
    const cur = href === active ? ' aria-current="page"' : '';
    return `<li><a href="/${attr(href)}"${cur}>${esc(label)}</a></li>`;
  }).join('');
  return `<nav aria-label="workspaces"><ul>${items}</ul></nav>`;
}

// pageHtml: full HTML document for one page.
//   title, description, canonical (path e.g. "posts/foo.html"), ogType, bodyClass,
//   pane (pre-rendered HTML string), pageData (serialized to window.__PAGE__),
//   manifest (for the noscript block), active (nav href to mark current).
function pageHtml({ title, description, canonical, ogType, bodyClass, pane, pageData, manifest, active }) {
  const canonicalUrl = `${ORIGIN}/${canonical}`;
  const font = 'https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;700&text=LUCASLUIZEDEVOPS%20&display=swap';
  const chromeFont = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:type" content="${attr(ogType || 'website')}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(canonicalUrl)}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${chromeFont}">
<link rel="stylesheet" href="${font}">
<link rel="stylesheet" href="/app/terminal.css">
</head>
<body class="${attr(bodyClass || '')}">
<div class="workspace">
${sidebar(active)}
<main id="pane">${pane}</main>
<form data-prompt><label>&gt; <input type="text" name="cmd" autocomplete="off" spellcheck="false" aria-label="command"></label></form>
<footer role="contentinfo"><span data-clock></span> <span data-sha></span></footer>
</div>
${noscriptLinks(manifest || {})}
<script>window.__PAGE__ = ${JSON.stringify(pageData || {}).replace(/</g, '\\u003c')};</script>
<script type="module" src="/app/shell.js"></script>
</body>
</html>`;
}

// --- pane templates -------------------------------------------------------

function shareLinks(url, title) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return `<div class="share">
<a id="share-twitter" href="https://twitter.com/intent/tweet?url=${u}&text=${t}" rel="noopener">Share on X</a>
<a id="share-linkedin" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" rel="noopener">Share on LinkedIn</a>
</div>`;
}

function postPane({ title, readingTime, tags, bodyHtml, canonicalUrl }) {
  const tagHtml = (tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join('');
  return `<article class="post-content">
<h1 class="post-title">${esc(title)}</h1>
<p class="post-meta"><span class="reading-time">${readingTime} min read</span></p>
<div class="badges">${tagHtml}</div>
${bodyHtml}
${shareLinks(canonicalUrl, title)}
</article>`;
}

function projectPane({ title, category, lifecycle, provenance, techStack, goal, github, demo, bodyHtml }) {
  const pill = (cls, v) => v ? `<span class="${cls}">${esc(v)}</span>` : '';
  const tech = (techStack || []).map((t) => `<span class="tech-chip">${esc(t)}</span>`).join('');
  const actions = [
    github ? `<a class="btn" href="${attr(github)}" rel="noopener">GitHub</a>` : '',
    demo ? `<a class="btn" href="${attr(demo)}" rel="noopener">Live demo</a>` : '',
  ].join('');
  return `<article class="project-content">
<header class="project-header">
<h1 class="project-title">${esc(title)}</h1>
<div class="project-pills">${pill('category-tag', category)}${pill('status-pill', lifecycle)}${pill('provenance-pill', provenance)}</div>
<div class="project-tech">${tech}</div>
<p class="project-goal">${esc(goal)}</p>
<div class="project-actions">${actions}</div>
</header>
${bodyHtml}
</article>`;
}

// Simple list panes for the collection pages (index/posts/projects).
function postsListPane(posts) {
  const cards = posts.map((p) => `<a class="card" href="/posts/${attr(p.slug)}.html">
<h2 class="post-title">${esc(p.title)}</h2>
<p class="muted">${esc(p.excerpt)}</p>
<p class="post-meta"><span class="reading-time">${p.readingTime} min read</span> <span class="muted">${esc(p.date)}</span></p>
</a>`).join('');
  return `<section id="posts-list">${cards}</section>`;
}

function projectsListPane(projects) {
  const cards = projects.map((p) => `<a class="project-card" href="/projects/${attr(p.slug)}.html">
<span class="category-tag">${esc(p.category)}</span>
<h2 class="project-title">${esc(p.title)}</h2>
<p class="project-goal">${esc(p.goal)}</p>
</a>`).join('');
  return `<section id="projects-carousel">${cards}</section>`;
}

// Screenshot gallery <figure> block, injected at the render slot for projects.
function galleryHtml(screenshots, slug) {
  if (!screenshots || !screenshots.length) return '';
  const figs = screenshots.map((s) => `<figure>
<img src="/projects/images/${attr(slug)}/${attr(s.file)}" loading="lazy" alt="${attr(s.alt)}">
${s.caption ? `<figcaption>${esc(s.caption)}</figcaption>` : ''}
</figure>`).join('');
  return `<div class="project-screenshots">${figs}</div>`;
}

module.exports = {
  ORIGIN, NAV, esc,
  pageHtml, postPane, projectPane, postsListPane, projectsListPane, galleryHtml,
};
