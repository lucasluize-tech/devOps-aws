// utils.js - Shared utility functions

// Parses markdown with front-matter
function parseMarkdown(md) {
  // Normalize line endings
  const normalizedMd = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedMd.split('\n');
  let data = {};
  let content = normalizedMd;
  if (lines[0] === '---') {
    const endIndex = lines.indexOf('---', 1);
    if (endIndex > 0) {
      const front = lines.slice(1, endIndex).join('\n');
      content = lines.slice(endIndex + 1).join('\n').trim();
      try {
        if (typeof module !== 'undefined' && module.exports) {
          const matter = require('gray-matter');
          const result = matter(normalizedMd);
          return { data: result.data, content: result.content };
        } else if (typeof window !== 'undefined' && typeof window.matter === 'function') {
          const result = window.matter(normalizedMd);
          return { data: result.data, content: result.content };
        } else {
          // Manual parsing fallback for browser without gray-matter
          const frontLines = front.split('\n');
          let currentArrayKey = null;
          let currentArray = null;
          frontLines.forEach(line => {
            const arrayItemMatch = line.match(/^\s+-\s+(.*)$/);
            if (currentArrayKey && arrayItemMatch) {
              let item = arrayItemMatch[1].trim();
              if (item.startsWith('"') && item.endsWith('"')) item = item.slice(1, -1);
              currentArray.push(item);
              return;
            }
            currentArrayKey = null;
            currentArray = null;
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length >= 0) {
              const trimmedKey = key.trim();
              let value = valueParts.join(':').trim();
              if (value === '') {
                currentArrayKey = trimmedKey;
                currentArray = [];
                data[trimmedKey] = currentArray;
                return;
              }
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              } else if (value.startsWith('[') && value.endsWith(']')) {
                try { value = JSON.parse(value); } catch (e) { /* keep string */ }
              }
              data[trimmedKey] = value;
            }
          });
        }
      } catch (e) {
        console.error('Error parsing front-matter:', e);
      }
    }
  }
  return { data, content };
}

// Calculates reading time
function calculateReadingTime(content) {
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / 200);
}

// Collects unique tags from posts
function collectTags(posts) {
  const allTags = new Set();
  posts.forEach(({ data }) => {
    if (data.tags) data.tags.forEach(tag => allTags.add(tag));
  });
  return Array.from(allTags).sort();
}

// Filters posts by tag
function filterPosts(posts, filter) {
  if (filter === 'all') return posts;
  return posts.filter(({ data }) => data.tags && data.tags.includes(filter));
}

// Searches posts by title, excerpt, or tags
function searchPosts(posts, searchTerm) {
  if (!searchTerm) return posts;
  const term = searchTerm.toLowerCase();
  return posts.filter(({ data }) => {
    const title = data.title.toLowerCase();
    const excerpt = data.excerpt.toLowerCase();
    const tags = data.tags ? data.tags.join(' ').toLowerCase() : '';
    return title.includes(term) || excerpt.includes(term) || tags.includes(term);
  });
}

// Calculates total pages
function getTotalPages(posts, postsPerPage = 4) {
  return Math.ceil(posts.length / postsPerPage);
}

// Gets posts for current page
function getPostsForPage(posts, page, postsPerPage = 4) {
  const start = page * postsPerPage;
  return posts.slice(start, start + postsPerPage);
}

const PROJECT_CATEGORIES = ['Infra', 'Apps', 'Dev Tools', 'Other'];
const PROJECT_STATUSES = ['in production', 'published', 'maintained', 'archived'];
const PROJECT_VISIBILITIES = ['public', 'private', 'internal'];
const PROJECT_REQUIRED = ['title', 'slug', 'category', 'status', 'goal', 'visibility', 'date', 'tech_stack'];

function validateProject(data) {
  const errors = [];
  PROJECT_REQUIRED.forEach((field) => {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`missing required field: ${field}`);
    }
  });
  if (data.category && !PROJECT_CATEGORIES.includes(data.category)) {
    errors.push(`invalid category: ${data.category}`);
  }
  if (data.status && !PROJECT_STATUSES.includes(data.status)) {
    errors.push(`invalid status: ${data.status}`);
  }
  if (data.visibility && !PROJECT_VISIBILITIES.includes(data.visibility)) {
    errors.push(`invalid visibility: ${data.visibility}`);
  }
  if (data.tech_stack !== undefined && !Array.isArray(data.tech_stack)) {
    errors.push('tech_stack must be an array');
  }
  return { ok: errors.length === 0, errors };
}

const STATUS_CLASS_MAP = {
  'in production': 'status-production',
  'published':     'status-published',
  'maintained':    'status-maintained',
  'archived':      'status-archived',
};

function renderCategoryTag(category, container) {
  const span = document.createElement('span');
  span.className = 'category-tag';
  span.textContent = category;
  container.appendChild(span);
  return span;
}

function renderStatusPill(status, container) {
  const span = document.createElement('span');
  const cls = STATUS_CLASS_MAP[status];
  span.className = cls ? `status-pill ${cls}` : 'status-pill';
  span.textContent = status;
  container.appendChild(span);
  return span;
}

function renderTechChips(techArray, container, { variant }) {
  if (!Array.isArray(techArray) || techArray.length === 0) return;
  if (variant === 'card') {
    const wrap = document.createElement('div');
    wrap.className = 'tech-chips';
    techArray.forEach((tech) => {
      const chip = document.createElement('span');
      chip.className = 'tech-chip';
      chip.textContent = tech;
      wrap.appendChild(chip);
    });
    container.appendChild(wrap);
  } else if (variant === 'detail') {
    const list = document.createElement('span');
    list.className = 'tech-list';
    list.textContent = techArray.join(' · ');
    container.appendChild(list);
  }
}

function renderActionButtons(project, container) {
  const wrap = document.createElement('div');
  wrap.className = 'project-action-buttons';

  if (project.visibility === 'private' || project.visibility === 'internal') {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = project.visibility === 'private'
      ? 'private repo — see case study below'
      : 'internal EPL deployment — case study below';
    wrap.appendChild(note);
    container.appendChild(wrap);
    return;
  }

  if (project.github) {
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = project.github;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'GitHub ↗';
    wrap.appendChild(a);
  }
  if (project.demo) {
    const a = document.createElement('a');
    a.className = 'btn primary';
    a.href = project.demo;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Live demo ↗';
    wrap.appendChild(a);
  }
  container.appendChild(wrap);
}

function splitBodyByH2(content) {
  const out = { why: '', architecture: '', cia: '', notes: '', galleryAfter: 'top' };
  const headings = ['Why', 'Architecture', 'CIA', 'Notes'];
  const keys =     ['why', 'architecture', 'cia', 'notes'];
  const positions = headings.map((h) => {
    const idx = content.search(new RegExp(`^##\\s+${h}\\s*$`, 'm'));
    return { heading: h, idx };
  });
  const present = positions
    .filter((p) => p.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  present.forEach((p, i) => {
    const start = p.idx + content.slice(p.idx).indexOf('\n') + 1;
    const end = i + 1 < present.length ? present[i + 1].idx : content.length;
    const body = content.slice(start, end).trim();
    const key = keys[headings.indexOf(p.heading)];
    out[key] = body;
  });
  if (out.architecture) out.galleryAfter = 'architecture';
  else if (out.why) out.galleryAfter = 'why';
  else out.galleryAfter = 'top';
  return out;
}

const SCREENSHOT_EXT_RE = /\.(png|jpg|jpeg|webp|gif)$/i;

function renderScreenshotGallery(screenshots, slug, container) {
  if (!Array.isArray(screenshots) || screenshots.length === 0) return;
  const wrap = document.createElement('div');
  wrap.className = 'project-screenshots';
  screenshots.forEach((shot) => {
    if (!shot || typeof shot.file !== 'string' || !SCREENSHOT_EXT_RE.test(shot.file)) {
      console.warn('skip screenshot:', shot);
      return;
    }
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.setAttribute('loading', 'lazy');
    img.setAttribute('src', `projects/images/${slug}/${shot.file}`);
    img.setAttribute('alt', shot.caption || '');
    fig.appendChild(img);
    if (shot.caption) {
      const cap = document.createElement('figcaption');
      cap.className = 'muted';
      cap.textContent = shot.caption;
      fig.appendChild(cap);
    }
    wrap.appendChild(fig);
  });
  if (wrap.children.length > 0) container.appendChild(wrap);
}

// If in Node.js, export; else, attach to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseMarkdown, calculateReadingTime, collectTags, filterPosts, searchPosts, getTotalPages, getPostsForPage, validateProject, renderCategoryTag, renderStatusPill, renderTechChips, renderActionButtons, splitBodyByH2, renderScreenshotGallery, PROJECT_CATEGORIES, PROJECT_STATUSES, PROJECT_VISIBILITIES };
} else {
  window.parseMarkdown = parseMarkdown;
  window.calculateReadingTime = calculateReadingTime;
  window.collectTags = collectTags;
  window.filterPosts = filterPosts;
  window.searchPosts = searchPosts;
  window.getTotalPages = getTotalPages;
  window.getPostsForPage = getPostsForPage;
  window.validateProject = validateProject;
  window.renderCategoryTag = renderCategoryTag;
  window.renderStatusPill = renderStatusPill;
  window.renderTechChips = renderTechChips;
  window.renderActionButtons = renderActionButtons;
  window.splitBodyByH2 = splitBodyByH2;
  window.renderScreenshotGallery = renderScreenshotGallery;
}
