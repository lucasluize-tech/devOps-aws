// index.js - Handles blog posts loading, filtering, and searching

// Loads posts from index.json and parses markdown
async function loadPosts() {
  const response = await fetch('/posts/index.json');
  const posts = await response.json();
  const promises = posts.map(async (post) => {
    const res = await fetch(`/posts/${post.slug}.md`);
    const md = await res.text();
    const parsed = parseMarkdown(md);
    if (!parsed.data.slug) console.error('Slug undefined for post:', post.slug, 'data:', parsed.data);
    return parsed;
  });
  const postData = await Promise.all(promises);
  return postData.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
}

// Collects unique tags from posts
function collectTags(posts) {
  const allTags = new Set();
  posts.forEach(({ data }) => {
    if (data.tags) data.tags.forEach(tag => allTags.add(tag));
  });
  return Array.from(allTags).sort();
}

// Creates filter buttons
function createFilterButtons(tags, tagFilters, onFilter) {
  const allButton = document.createElement('button');
  allButton.className = 'badge';
  allButton.textContent = 'All';
  allButton.style.cursor = 'pointer';
  allButton.onclick = () => onFilter('all');
  tagFilters.appendChild(allButton);
  tags.forEach(tag => {
    const button = document.createElement('button');
    button.className = 'badge';
    button.textContent = tag;
    button.style.cursor = 'pointer';
    button.onclick = () => onFilter(tag);
    tagFilters.appendChild(button);
  });
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

// Renders posts to container
function renderPosts(posts, container) {
  container.innerHTML = '';
  posts.forEach(({ data }) => {
    const postDiv = document.createElement('div');
    postDiv.className = 'card';
    postDiv.style.cursor = 'pointer';
    postDiv.onclick = () => window.location.href = `/post.html?slug=${data.slug}`;
    postDiv.innerHTML = `
      <h3>${data.title}</h3>
      <p class="muted">${data.excerpt}</p>
      <p class="muted">By ${data.author} on ${new Date(data.date).toLocaleDateString()}</p>
    `;
    container.appendChild(postDiv);
  });
  if (posts.length === 0) {
    container.innerHTML = 'No posts match your search.';
  }
}

// Initializes the index page
async function initIndex() {
  const postsContainer = document.getElementById('posts-list');
  const searchInput = document.getElementById('search-input');
  const tagFilters = document.getElementById('tag-filters');
  let allPosts = [];
  let currentFilter = 'all';

  postsContainer.innerHTML = 'Loading posts...';

  try {
    allPosts = await loadPosts();
    if (allPosts.length === 0) {
      postsContainer.innerHTML = 'No posts yet.';
      return;
    }

    const tags = collectTags(allPosts);
    createFilterButtons(tags, tagFilters, (filter) => {
      currentFilter = filter;
      const filtered = filterPosts(allPosts, filter);
      const searched = searchPosts(filtered, searchInput.value);
      renderPosts(searched, postsContainer);
    });

    renderPosts(allPosts, postsContainer);
  } catch (err) {
    console.error('Error loading posts:', err);
    postsContainer.innerHTML = 'Error loading posts.';
  }

  searchInput.addEventListener('input', () => {
    const filtered = filterPosts(allPosts, currentFilter);
    const searched = searchPosts(filtered, searchInput.value);
    renderPosts(searched, postsContainer);
  });
}

document.addEventListener('DOMContentLoaded', initIndex);