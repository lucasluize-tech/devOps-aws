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

// catSlug: category -> CSS modifier ('Dev Tools' -> 'dev-tools') so each
// project type gets its own semantic color (terminal.css .cat-*).
function catSlug(c) {
  return String(c || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

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
  const items = NAV.map(([href, label], i) => {
    const cur = href === active ? ' aria-current="page"' : '';
    // tmux-style index number; aria-hidden keeps the link's accessible name clean
    return `<li><a href="/${attr(href)}"${cur}><span class="ws-num" aria-hidden="true">${i}</span>${esc(label)}</a></li>`;
  }).join('');
  return `<nav aria-label="workspaces"><span class="logo-mark" aria-label="lucasluize devops">&gt;_</span><ul>${items}</ul></nav>`;
}

// pageHtml: full HTML document for one page.
//   title, description, canonical (path e.g. "posts/foo.html"), ogType, bodyClass,
//   pane (pre-rendered HTML string), pageData (serialized to window.__PAGE__),
//   manifest (for the noscript block), active (nav href to mark current).
function pageHtml({ title, description, canonical, ogType, bodyClass, pane, pageData, manifest, active, branch }) {
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
<label><span class="ps1"><span class="ps1-host">lucas@devops</span><span class="ps1-sep">:</span><span data-cwd>~</span></span> <span class="ps1-arrow">&#10095;</span> <input type="text" name="cmd" autocomplete="off" spellcheck="false" aria-label="command"></label>
<span class="prompt-hint" aria-hidden="true">tab completes · ctrl+/ focuses · try 'help'</span>
<input type="hidden" name="website" data-hp>
</form>
<footer role="contentinfo"><span data-progress></span><span data-path></span><span data-branch>${esc(branch || '')}</span><span class="sl-enc">utf-8</span><span data-sha></span><span data-clock></span></footer>
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

// Reader back link: the terminal-native "cd .." out of a post/project.
function readerBack(section) {
  return `<p class="reader-back"><a href="/${attr(section)}.html">← cd ../${esc(section)}</a></p>`;
}

function postPane({ title, readingTime, tags, bodyHtml, canonicalUrl }) {
  const tagHtml = (tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join('');
  return `<div class="reader-split"><article class="post-content">
${readerBack('posts')}
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
${readerBack('projects')}
<header class="project-header">
<h1 class="project-title">${esc(title)}</h1>
<div class="project-pills">${pill(`category-tag cat-${catSlug(category)}`, category)}${pill(`status-pill status-${esc(lifecycle)}`, lifecycle)}${pill('provenance-pill', provenance)}</div>
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
// buildTime (ISO) doubles as "last pushed to production": every master push
// rebuilds and deploys, so the two timestamps are the same event.
function motdBlock(buildTime) {
  return `<pre class="motd" aria-label="message of the day"${buildTime ? ` data-build-time="${attr(buildTime)}"` : ''}></pre>`;
}

// ---- Index landing panes (2026-08-11 landing spec) -----------------------
// Hierarchy: identity -> status snapshot -> featured projects -> latest
// writing. Dense and scan-friendly; projects get the richer treatment
// (running systems), posts read as filesystem rows (documentation).

// Two-pane hero (~60/40): identity left, SESSION panel right - two tmux
// panes. The panel carries only what the identity column doesn't (no
// role/focus duplication).
function introPane(buildTime) {
  return `<section class="intro">${motdBlock(buildTime)}
<div class="hero">
<div class="hero-id">
<h1>Lucas Luize</h1>
<p class="intro-role">Cloud DevOps Engineer</p>
<p class="intro-human">I build and automate infrastructure, troubleshoot the weird edge cases, and write down what I learn.</p>
</div>
${sessionPanel()}
</div>
</section>`;
}

function sessionPanel() {
  const row = (k, v) => `<div class="snap-row"><span class="snap-key">${esc(k)}</span><span class="snap-val">${v}</span></div>`;
  return `<section class="snapshot" aria-label="session">
<h2 class="snapshot-title">session</h2>
${row('stack', 'AWS · Terraform · Linux · Proxmox · Tailscale')}
${row('focus', 'infra automation · networking · reliability')}
${row('current', '<span class="snap-dot" aria-hidden="true">●</span> building secure cloud + homelab infrastructure')}
</section>`;
}

function featuredProjectsPane(projects) {
  const cards = (projects || []).slice(0, 3).map((p) => `<a class="feat-card" href="/projects/${attr(p.slug)}.html">
<span class="feat-head"><span class="feat-name"><span class="feat-cat cat-${catSlug(p.category)}">[${esc(String(p.category || '').toUpperCase())}]</span> ${esc(p.title)}</span><span class="feat-status status-${esc(p.lifecycle)}">● ${esc(p.lifecycle)}</span></span>
<span class="feat-goal">${esc(p.goal)}</span>
<span class="feat-tech">${(p.tech_stack || []).slice(0, 5).map((t) => `<span class="tech-chip">${esc(t)}</span>`).join('')}</span>
</a>`).join('');
  return `<section class="featured" aria-label="featured projects">
<h2 class="sec-label">Projects</h2>
<p class="ls-cmd muted">$ ls ./projects --featured</p>
${cards}
<p class="view-all"><a href="/projects.html">view all projects →</a></p>
</section>`;
}

// tagColor: deterministic tag -> palette bucket for topic columns.
// Keep in sync with the runtime copy in app/buffers.js.
function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h % 5;
}

// "2026-07-02" -> "07-02-26" (same format as the telescope list)
function fmtDate(date) {
  const [y, m, d] = String(date || '').split('-');
  return y && m && d ? `${m}-${d}-${y.slice(2)}` : String(date || '');
}

function latestPostsPane(posts) {
  const rows = (posts || []).slice(0, 4).map((p) => {
    const topic = (p.tags || [])[0] || '';
    return `<li><a class="post-row" href="/posts/${attr(p.slug)}.html">
<span class="pr-date">${esc(fmtDate(p.date))}</span><span class="pr-tag tlo-c${tagColor(topic)}">${esc(topic)}</span><span class="pr-time">${p.readingTime}m</span><span class="pr-title">${esc(p.title)}</span>
</a></li>`;
  }).join('');
  return `<section class="latest" aria-label="latest writing">
<h2 class="sec-label">Writing</h2>
<p class="ls-cmd muted">$ ls ./posts --latest</p>
<div class="post-rows-head" aria-hidden="true"><span>date</span><span>topic</span><span>read</span><span>title</span></div>
<ul class="post-rows">${rows}</ul>
<p class="view-all"><a href="/posts.html">view all writing →</a></p>
</section>`;
}

// Picker pane (posts/projects): path-style header + empty telescope container
// that initTelescope() fills, plus a pre-rendered .tl-fallback list that stays
// for no-JS visitors (JS hides it once the telescope boots).
function pickerPane(kind, listHtml) {
  return `<h1 class="tl-h1"><span class="tl-h1-tilde" aria-hidden="true">~/</span>${esc(kind)}</h1>
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
  // Tux hard at work, rainbow via .lolcat; pipeline stages colored per-span.
  const tux = [
    '      .--.',
    '     |o_o |',
    '     |:_/ |',
    '    //   \\ \\',
    '   (|     | )',
    '  /\'\\_   _/`\\',
    '  \\___)=(___/',
    '  ____________',
    ' | >_ ship it |',
    ' |____________|',
  ].join('\n');
  const pipeline = [
    '<span class="pl-code">code</span>',
    '<span class="pl-build">build</span>',
    '<span class="pl-test">test</span>',
    '<span class="pl-deploy">deploy</span>',
  ].join('<span class="pl-arr"> -> </span>');
  const logoBlock = `<span class="nf-tux lolcat">${esc(tux)}</span>\n\n<span class="nf-pipeline">${pipeline}</span>`;
  const row = (k, v) => `<div class="nf-row"><span class="nf-key">${esc(k)}</span><span class="nf-val">${v}</span></div>`;
  const skill = (name, prov) => `<span class="nf-skill">${esc(name)}<span class="prov prov-${esc(prov)}">[${esc(prov)}]</span></span>`;
  const skills = [
    skill('AWS (S3/CloudFront/ACM)', 'prod'),
    skill('GitHub Actions CI/CD', 'prod'),
    skill('Proxmox VE / LXC', 'prod'),
    skill('Docker', 'prod'),
    skill('Tailscale', 'prod'),
    skill('Python / Bash', 'prod'),
    skill('Terraform', 'learning'),
    skill('Kubernetes / EKS', 'learning'),
  ].join('');
  const links = [
    '<a href="https://github.com/lucasluize-tech" rel="noopener">github</a>',
    '<a href="https://linkedin.com/in/lucasluize" rel="noopener">linkedin</a>',
    '<a href="mailto:me@lucasluize.com">email</a>',
  ].join('<span class="nf-linksep" aria-hidden="true"> · </span>');
  const kv = [
    row('host', 'lucas@devops'),
    row('role', 'Cloud DevOps Engineer'),
    row('base', 'Tampa, FL - Remote friendly'),
    row('focus', 'private-origin, CDN-fronted, test-gated infra'),
    row('uptime', 'shipping since 2020'),
    row('skills', `<div class="nf-skills">${skills}</div>`),
    row('links', `<span class="nf-links">${links}</span>`),
  ].join('');
  return `<section class="neofetch" aria-label="about">
<pre class="nf-logo" aria-hidden="true">${logoBlock}</pre>
<div class="nf-info"><h1 class="nf-title">lucas@devops</h1><hr class="nf-sep">${kv}</div>
</section>
${manPane()}`;
}

// Man-page pane rendered under the neofetch header (`man lucas` in the
// prompt navigates here). Facts sourced from the master resume - keep in
// sync with ~/projects/lucas/job-search/docs/master-resume.md.
function manPane() {
  const xref = (name, url) => `<a href="${attr(url)}">${esc(name)}(1)</a>`;
  const seeAlso = [
    xref('projects', '/projects.html'),
    xref('posts', '/posts.html'),
    xref('roadmap', '/roadmap.html'),
    xref('contact', '/contact.html'),
  ].join(', ');
  return `<section class="man" aria-label="man lucas">
<p class="man-cmd muted">$ man lucas</p>
<div class="man-head" aria-hidden="true"><span>LUCAS(1)</span><span>User Commands</span><span>LUCAS(1)</span></div>
<h2 class="man-sec">NAME</h2>
<p class="man-body">lucas - cloud devops engineer</p>
<h2 class="man-sec">SYNOPSIS</h2>
<p class="man-body"><code>lucas [--infra] [--automation] [--networking] [--docs]</code></p>
<h2 class="man-sec">DESCRIPTION</h2>
<p class="man-body">Builds and automates infrastructure, troubleshoots weird edge cases,
and documents what he learns. Has owned technology end-to-end since 2020 -
from bootstrapping a small business's entire web, email, and network stack
solo to running the systems a multi-branch enterprise depends on.</p>
<p class="man-body">Likes systems that are boring to operate: documented, observable,
reproducible, and gated behind tests before they ship.</p>
<h2 class="man-sec">EXPERIENCE</h2>
<div class="man-job">
<p class="man-job-head"><span class="man-job-title">IT Support Specialist &amp; Systems Administrator, Edison Public Library</span><span class="man-job-when">2025 - present</span></p>
<p class="man-job-desc">One of three engineers running enterprise infrastructure across all
branches: Proxmox HA with scripted failover and failback, Grafana
observability, GitOps deploys, zero-trust remote access via Tailscale,
and a 78-doc internal wiki built where none existed.</p>
</div>
<div class="man-job">
<p class="man-job-head"><span class="man-job-title">Technology Consultant, Pinard Nursery</span><span class="man-job-when">2020 - present</span></p>
<p class="man-job-desc">Sole owner of a small business's entire stack - web, email, DNS,
networking, and physical security - from procurement through maintenance,
without an IT budget or team.</p>
</div>
<h2 class="man-sec">CERTIFICATIONS</h2>
<p class="man-body">CompTIA Security+ / Network+ / A+ / IT Operations Specialist<br>
AWS Certified Cloud Practitioner / LPI Linux Essentials<br>
B.S. Cloud &amp; Network Engineering, WGU (in progress)</p>
<h2 class="man-sec">LANGUAGES</h2>
<p class="man-body">English (fluent) / Portuguese (native) / Spanish (intermediate)</p>
<h2 class="man-sec">SEE ALSO</h2>
<p class="man-body man-xref">${seeAlso}</p>
<div class="man-foot" aria-hidden="true"><span>lucas 1.0</span><span>User Commands</span><span>LUCAS(1)</span></div>
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

// Contact workspace: finger(1) identity pane + mutt-style compose pane.
// The form is real and accessible; app/compose.js binds it to the shared
// draft so shell commands (set/draft/send) manipulate the same state.
function fingerPane() {
  return `<aside class="finger tui-pane" aria-label="finger lucas">
<p class="tui-pane-title" aria-hidden="true">finger(1)</p>
<p class="finger-cmd">$ finger lucas</p>
<dl class="fg-facts">
<dt>Login:</dt><dd>lucas</dd>
<dt>Name:</dt><dd class="fg-name">Lucas Luize</dd>
<dt>Role:</dt><dd class="fg-role">Cloud DevOps Engineer</dd>
<dt>Location:</dt><dd>Tampa, FL</dd>
<dt>Work mode:</dt><dd>Remote-friendly</dd>
</dl>
<p class="fg-sec">Links:</p>
<ul class="finger-links">
<li><a href="https://github.com/lucasluize-tech" rel="noopener">github</a></li>
<li><a href="https://linkedin.com/in/lucasluize" rel="noopener">linkedin</a></li>
<li><a href="mailto:me@lucasluize.com">email</a></li>
</ul>
<p class="fg-sec">Status:</p>
<p class="finger-status"><span class="snap-dot" aria-hidden="true">●</span> accepting mail</p>
</aside>`;
}

function contactPane() {
  const field = (id, label, type) => `<div class="cf-row">
<label for="cf-${id}">${label}:</label>
<input id="cf-${id}" name="${id}" type="${type}" autocomplete="off" spellcheck="false" maxlength="200">
</div>`;
  return `<h1 class="tl-h1"><span class="tl-h1-tilde">~/</span>contact</h1>
<section class="contact-grid">
${fingerPane()}
<form data-compose class="tui-pane" aria-label="compose message" novalidate>
<p class="tui-pane-title" aria-hidden="true">mail(1) · compose</p>
${field('name', 'Name', 'text')}
${field('email', 'From', 'email')}
<div class="cf-row cf-row-static"><span>To:</span><span class="cf-to">lucas@devops</span></div>
${field('subject', 'Subject', 'text')}
<div class="cf-msg">
<label class="sr-only" for="cf-message">Message</label>
<textarea id="cf-message" name="message" rows="9" maxlength="2000"></textarea>
</div>
<input name="website" data-cf-hp tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="cf-alert" data-cf-alert role="alert" hidden></div>
<div class="cf-bar">
<p class="cf-status cf-st-draft" data-cf-status aria-live="polite">● draft</p>
<span class="cf-transport" aria-hidden="true">transport: AWS SES</span>
<button type="submit" class="cf-send">send <kbd>^enter</kbd></button>
</div>
</form>
</section>`;
}

module.exports = {
  ORIGIN, NAV, esc,
  pageHtml, postPane, projectPane, postsListPane, projectsListPane, galleryHtml,
  aboutPane, roadmapPane, motdBlock, pickerPane,
  introPane, featuredProjectsPane, latestPostsPane,
  contactPane,
};
