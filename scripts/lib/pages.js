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

// compactSlugs: {slug,title} only - the prompt engine (app/prompt.js) needs
// no other fields to resolve `open`/`cat`/`ls`. Keeps window.__PAGE__ small
// on every page (not just the posts/projects pickers, which already embed
// their own full manifest for the telescope).
function compactSlugs(list) {
  return (list || []).map((p) => ({ slug: p.slug, title: p.title }));
}

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
  return `<nav aria-label="workspaces"><span class="logo-mark" aria-label="lucasluize devops">&gt;_</span><ul>${items}</ul></nav>`;
}

// pageHtml: full HTML document for one page.
//   title, description, canonical (path e.g. "posts/foo.html"), ogType, bodyClass,
//   pane (pre-rendered HTML string), pageData (serialized to window.__PAGE__),
//   manifest (for the noscript block), active (nav href to mark current).
function pageHtml({ title, description, canonical, ogType, bodyClass, pane, pageData, manifest, active }) {
  const canonicalUrl = `${ORIGIN}/${canonical}`;
  const font = 'https://fonts.googleapis.com/css2?family=Saira+Stencil+One&display=swap';
  const chromeFont = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap';
  // Reader pages (post/project) load article typography (Bricolage headings,
  // DM Sans prose) + reader.css on top of the mono chrome. Nothing else does.
  const isReader = /\bpage-(post|project)\b/.test(bodyClass || '');
  const readerFont = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;1,9..40,400&display=swap';
  const readerHead = isReader
    ? `\n<link rel="stylesheet" href="${readerFont}">\n<link rel="stylesheet" href="/app/reader.css">`
    : '';
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
<link rel="stylesheet" href="/app/terminal.css">${readerHead}
</head>
<body class="${attr(bodyClass || '')}">
<div class="workspace">
${sidebar(active)}
<div class="rz rz-side" data-resize="side" role="separator" aria-orientation="vertical" tabindex="0" aria-label="resize sidebar"></div>
<main id="pane">${pane}</main>
<div class="rz rz-console" data-resize="console" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="resize console"></div>
<form data-prompt>
<div class="scrollback" data-scrollback aria-live="polite" aria-label="command output"></div>
<label>&gt; <input type="text" name="cmd" autocomplete="off" spellcheck="false" aria-label="command"></label>
<input type="hidden" name="website" data-hp>
</form>
<footer role="contentinfo"><span data-progress></span><span data-clock></span> <span data-sha></span></footer>
</div>
${noscriptLinks(manifest || {})}
<script>window.__PAGE__ = ${JSON.stringify(Object.assign(
    { manifest: { posts: compactSlugs(manifest && manifest.posts), projects: compactSlugs(manifest && manifest.projects) } },
    pageData || {}
  )).replace(/</g, '\\u003c')};</script>
<script type="module" src="/app/shell.js"></script>
<script type="module" src="/app/router.js"></script>
<script type="module" src="/app/buffers.js"></script>
<script type="module" src="/app/prompt.js"></script>
<script type="module" src="/app/resize.js"></script>
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

// Comments aside: emitted hidden on every reader page; app/buffers.js unhides
// it and lazy-loads giscus only when GISCUS is configured in app/config.js.
function commentsAside() {
  return `<div class="rz rz-comments" data-resize="comments" role="separator" aria-orientation="vertical" tabindex="0" aria-label="resize comments"></div>
<aside class="comments" data-giscus hidden aria-label="comments">
<h2 class="comments-title">comments</h2>
<p class="comments-cmd muted">$ giscus --thread</p>
<div class="giscus-slot"></div>
</aside>`;
}

function postPane({ title, readingTime, tags, bodyHtml, canonicalUrl }) {
  const tagHtml = (tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join('');
  return `<div class="reader-split"><article class="post-content">
<h1 class="post-title">${esc(title)}</h1>
<p class="post-meta"><span class="reading-time">${readingTime} min read</span></p>
<div class="badges">${tagHtml}</div>
${bodyHtml}
${shareLinks(canonicalUrl, title)}
</article>
${commentsAside()}</div>`;
}

function projectPane({ title, category, lifecycle, provenance, techStack, goal, github, demo, bodyHtml }) {
  const pill = (cls, v) => v ? `<span class="${cls}">${esc(v)}</span>` : '';
  const tech = (techStack || []).map((t) => `<span class="tech-chip">${esc(t)}</span>`).join('');
  const actions = [
    github ? `<a class="btn" href="${attr(github)}" rel="noopener">GitHub</a>` : '',
    demo ? `<a class="btn" href="${attr(demo)}" rel="noopener">Live demo</a>` : '',
  ].join('');
  return `<div class="reader-split"><article class="project-content">
<header class="project-header">
<h1 class="project-title">${esc(title)}</h1>
<div class="project-pills">${pill('category-tag', category)}${pill(`status-pill status-${esc(lifecycle)}`, lifecycle)}${pill('provenance-pill', provenance)}</div>
<div class="project-tech">${tech}</div>
<p class="project-goal">${esc(goal)}</p>
<div class="project-actions">${actions}</div>
</header>
${bodyHtml}
</article>
${commentsAside()}</div>`;
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

// MOTD block for the index pane: runMotd() types into this <pre>. Empty at
// build time; JS reserves its height before typing (zero CLS).
function motdBlock() {
  return `<pre class="motd" aria-label="message of the day"></pre>`;
}

// Picker pane (posts/projects): heading + empty telescope container that
// initTelescope() fills, plus a pre-rendered .tl-fallback list that stays for
// no-JS visitors (JS hides it once the telescope boots).
function pickerPane(heading, kind, listHtml) {
  return `<h1>${esc(heading)}</h1>
<div data-telescope data-kind="${attr(kind)}"></div>
<div class="tl-fallback">${listHtml}</div>`;
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

// About pane: neofetch layout - ASCII >_ logo left, key/value column right.
// Skills carry provenance labels [prod]/[lab]/[personal] matching the schema.
function aboutPane() {
  const logo = [
    '        __         ',
    '   ___ / /_        ',
    '  / _ \\/ __/       ',
    ' /  __/ /_         ',
    ' \\___/\\__/  _      ',
    '     >_    (_)     ',
  ].join('\n');
  const row = (k, v) => `<div class="nf-row"><span class="nf-key">${esc(k)}</span><span class="nf-val">${v}</span></div>`;
  const skill = (name, prov) => `<span class="nf-skill">${esc(name)}<span class="prov prov-${esc(prov)}">[${esc(prov)}]</span></span>`;
  const skills = [
    skill('AWS (S3/CloudFront/ACM)', 'prod'),
    skill('Terraform', 'prod'),
    skill('GitHub Actions CI/CD', 'prod'),
    skill('Proxmox VE / LXC', 'lab'),
    skill('Tailscale', 'lab'),
    skill('Bash / dotfiles', 'personal'),
    skill('Docker', 'lab'),
    skill('Kubernetes / EKS', 'learning'),
  ].join('');
  const kv = [
    row('host', 'lucas@devops'),
    row('role', 'Cloud DevOps Engineer'),
    row('base', 'Tampa, FL - Remote friendly'),
    row('focus', 'private-origin, CDN-fronted, test-gated infra'),
    row('uptime', 'shipping since 2022'),
    row('skills', `<div class="nf-skills">${skills}</div>`),
    row('contact', '<a href="mailto:me@lucasluize.com">me@lucasluize.com</a>'),
  ].join('');
  return `<section class="neofetch" aria-label="about">
<pre class="nf-logo" aria-hidden="true">${esc(logo)}</pre>
<div class="nf-info"><h1 class="nf-title">lucas@devops</h1><hr class="nf-sep">${kv}</div>
</section>`;
}

// Roadmap pane: systemd-style unit list (like `systemctl status`).
// state: active (done/running), activating (in progress), inactive (queued).
function roadmapPane() {
  const units = [
    ['s3-cloudfront-site', 'active', 'Static site on private S3 + CloudFront + ACM (HTTPS)'],
    ['proxmox-ha-lab', 'active', 'CIA-triad on-prem HA cluster with keepalived VIP'],
    ['ci-cd-pipeline', 'active', 'GitHub Actions test-gated deploy + CDN invalidation'],
    ['tailscale-zero-trust', 'active', 'Zero-config subnet router into AWS via Terraform'],
    ['terminal-ui-redesign', 'activating', 'tmux/nvim-style portfolio buffer UI (this site)'],
    ['eks-gitops', 'inactive', 'EKS clusters with ArgoCD GitOps deployments'],
    ['observability-stack', 'inactive', 'Prometheus + Grafana + alerting on the lab'],
    ['secrets-automation', 'inactive', 'Vault-backed secret rotation across environments'],
  ];
  const label = { active: 'active (running)', activating: 'activating (start)', inactive: 'inactive (dead)' };
  const rows = units.map(([name, state, desc]) => `<li class="unit unit-${state}">
<span class="unit-dot" aria-hidden="true">●</span>
<span class="unit-name">${esc(name)}.service</span>
<span class="unit-state">${esc(label[state])}</span>
<span class="unit-desc">${esc(desc)}</span>
</li>`).join('');
  return `<section class="systemd" aria-label="roadmap">
<h1>roadmap.target</h1>
<p class="systemd-cmd muted">$ systemctl status roadmap.target</p>
<ul class="unit-list">${rows}</ul>
</section>`;
}

module.exports = {
  ORIGIN, NAV, esc,
  pageHtml, postPane, projectPane, postsListPane, projectsListPane, galleryHtml,
  aboutPane, roadmapPane, motdBlock, pickerPane,
};
