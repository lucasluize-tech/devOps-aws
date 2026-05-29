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

// Manages pagination state
let currentPage = 0;
const postsPerPage = 4;

// Updates pagination controls
function updatePaginationControls(totalPages, container) {
  const paginationDiv = document.getElementById('pagination-controls') || document.createElement('div');
  paginationDiv.id = 'pagination-controls';
  paginationDiv.innerHTML = '';

  if (totalPages <= 1) return;

  // Arrows container
  const arrowsDiv = document.createElement('div');
  arrowsDiv.className = 'pagination-arrows';

  // Previous arrow
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '←';
  prevBtn.disabled = currentPage === 0;
  prevBtn.onclick = () => changePage(currentPage - 1);
  arrowsDiv.appendChild(prevBtn);

  // Next arrow
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '→';
  nextBtn.disabled = currentPage === totalPages - 1;
  nextBtn.onclick = () => changePage(currentPage + 1);
  arrowsDiv.appendChild(nextBtn);

  paginationDiv.appendChild(arrowsDiv);

  // Dots container
  const dotsDiv = document.createElement('div');
  dotsDiv.className = 'pagination-dots';

  // Dots
  for (let i = 0; i < totalPages; i++) {
    const dot = document.createElement('span');
    dot.textContent = '●';
    dot.className = 'dot' + (i === currentPage ? ' active' : '');
    dotsDiv.appendChild(dot);
  }

  paginationDiv.appendChild(dotsDiv);
  container.appendChild(paginationDiv);
}

// Changes page
function changePage(page) {
  const postsContainer = document.getElementById('posts-list');
  const allPosts = window.allPosts || [];
  currentPage = page;

  const filtered = filterPosts(allPosts, window.currentFilter || 'all');
  const searched = searchPosts(filtered, document.getElementById('search-input').value);
  renderPosts(getPostsForPage(searched, currentPage), postsContainer);
  updatePaginationControls(getTotalPages(searched), postsContainer.parentElement);
}

// Initializes the index page
async function initIndex() {
  const postsContainer = document.getElementById('posts-list');
  const searchInput = document.getElementById('search-input');
  const tagFilters = document.getElementById('tag-filters');
  let allPosts = [];
  let currentFilter = 'all';
  window.allPosts = allPosts;
  window.currentFilter = currentFilter;

  postsContainer.innerHTML = 'Loading posts...';

  // Load projects in parallel
  const carouselContainer = document.getElementById('projects-carousel');
  const dotsContainer = document.getElementById('projects-dots');
  if (carouselContainer) {
    loadProjects()
      .then((projects) => {
        renderProjectCarousel(projects, carouselContainer);
        attachCarouselDots(carouselContainer, dotsContainer, projects.length);
      })
      .catch((err) => {
        console.error('Error loading projects:', err);
        carouselContainer.textContent = 'Error loading projects.';
      });
  }

  try {
    allPosts = await loadPosts();
    window.allPosts = allPosts;
    if (allPosts.length === 0) {
      postsContainer.innerHTML = 'No posts yet.';
      return;
    }

    const tags = collectTags(allPosts);
    createFilterButtons(tags, tagFilters, (filter) => {
      currentFilter = filter;
      window.currentFilter = filter;
      const filtered = filterPosts(allPosts, filter);
      const searched = searchPosts(filtered, searchInput.value);
      currentPage = 0;
      renderPosts(getPostsForPage(searched, currentPage), postsContainer);
      updatePaginationControls(getTotalPages(searched), postsContainer.parentElement);
    });

    renderPosts(getPostsForPage(allPosts, currentPage), postsContainer);
    updatePaginationControls(getTotalPages(allPosts), postsContainer.parentElement);
  } catch (err) {
    console.error('Error loading posts:', err);
    postsContainer.innerHTML = 'Error loading posts.';
  }

  searchInput.addEventListener('input', () => {
    const filtered = filterPosts(allPosts, currentFilter);
    const searched = searchPosts(filtered, searchInput.value);
    currentPage = 0;
    renderPosts(getPostsForPage(searched, currentPage), postsContainer);
    updatePaginationControls(getTotalPages(searched), postsContainer.parentElement);
  });
}

// ─── Projects ───
async function loadProjects() {
  const response = await fetch('/projects/index.json');
  const registry = await response.json();
  const promises = registry.map(async (entry) => {
    const res = await fetch(`/projects/${entry.slug}.md`);
    const md = await res.text();
    const parsed = parseMarkdown(md);
    if (!parsed.data.slug) parsed.data.slug = entry.slug;
    return parsed;
  });
  const projectData = await Promise.all(promises);
  return projectData.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
}

function renderProjectCard({ data }) {
  const a = document.createElement('a');
  a.className = 'project-card';
  a.href = `/project.html?slug=${data.slug}`;

  const pills = document.createElement('div');
  pills.className = 'project-card-pills';
  renderCategoryTag(data.category, pills);
  renderStatusPill(data.status, pills);
  a.appendChild(pills);

  const title = document.createElement('h3');
  title.className = 'project-title';
  title.textContent = data.title;
  a.appendChild(title);

  const goal = document.createElement('p');
  goal.className = 'project-goal';
  goal.textContent = data.goal;
  a.appendChild(goal);

  renderTechChips(data.tech_stack || [], a, { variant: 'card' });

  const cta = document.createElement('div');
  cta.className = 'project-card-cta muted';
  cta.textContent = 'view case study →';
  a.appendChild(cta);

  return a;
}

function renderProjectCarousel(projects, container) {
  container.innerHTML = '';
  projects.forEach((p) => container.appendChild(renderProjectCard(p)));
}

function attachCarouselDots(container, dotsContainer, count) {
  dotsContainer.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.textContent = '●';
    dotsContainer.appendChild(dot);
  }
  const cards = Array.from(container.querySelectorAll('.project-card'));
  if (cards.length === 0) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
        const idx = cards.indexOf(entry.target);
        if (idx >= 0) {
          dotsContainer.querySelectorAll('.dot').forEach((d, i) => {
            d.classList.toggle('active', i === idx);
          });
        }
      }
    });
  }, { root: container, threshold: [0.6] });
  cards.forEach((c) => observer.observe(c));
}

document.addEventListener('DOMContentLoaded', initIndex);