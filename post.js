// post.js - Handles individual post loading and rendering

// Parses markdown with front-matter
function parseMarkdown(md) {
  const parts = md.split(/^---$/m);
  let data = {};
  let content = md;
  if (parts.length >= 3) {
    const front = parts[1].trim();
    content = parts.slice(2).join('---').trim();
    try {
      data = jsyaml.load(front);
    } catch (e) {
      console.error('Error parsing front-matter:', e);
    }
  }
  return { data, content };
}

// Calculates reading time
function calculateReadingTime(content) {
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / 200);
}

// Renders tags
function renderTags(tags, container) {
  container.innerHTML = '';
  if (tags && tags.length) {
    tags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'badge';
      span.textContent = tag;
      container.appendChild(span);
    });
  }
}

// Sets up share buttons
function setupShareButtons(title, url) {
  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(url);
  document.getElementById('share-twitter').href = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
  document.getElementById('share-linkedin').href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
}

// Renders the post
function renderPost(data, content) {
  document.title = data.title + ' – Lucas Luize';
  document.querySelector('.post-title').textContent = data.title;
  document.querySelector('.post-meta').textContent = `By ${data.author} on ${new Date(data.date).toLocaleDateString()}`;
  renderTags(data.tags, document.querySelector('.badges'));
  const readingTime = calculateReadingTime(content);
  document.querySelector('.reading-time').textContent = `${readingTime} min read`;
  const html = marked.parse(content);
  document.querySelector('.post-content').innerHTML = html;
  setupShareButtons(data.title, window.location.href);
}

// Loads and renders the post
async function loadPost(slug) {
  try {
    const response = await fetch(`/posts/${slug}.md`);
    const md = await response.text();
    const { data, content } = parseMarkdown(md);
    renderPost(data, content);
  } catch (err) {
    console.error('Error loading post:', err);
    document.querySelector('.post-title').textContent = 'Error loading post';
    document.querySelector('.post-meta').textContent = 'Please try again later';
  }
}

// Initializes the post page
function initPost() {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');
  if (!slug) {
    document.querySelector('.post-title').textContent = 'Post not found';
    document.querySelector('.post-meta').textContent = 'Invalid slug';
    return;
  }
  loadPost(slug);
}

document.addEventListener('DOMContentLoaded', initPost);