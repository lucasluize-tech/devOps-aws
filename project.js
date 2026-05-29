// project.js — Detail page loader and renderer.

function renderProjectHeader(data) {
  document.title = data.title + ' – Lucas Luize';
  document.querySelector('.project-title').textContent = data.title;
  document.querySelector('.project-goal').textContent = data.goal;

  const pills = document.querySelector('.project-pills');
  pills.innerHTML = '';
  renderCategoryTag(data.category, pills);
  renderStatusPill(data.status, pills);

  const techContainer = document.querySelector('.project-tech');
  techContainer.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = 'Tech: ';
  techContainer.appendChild(label);
  renderTechChips(data.tech_stack || [], techContainer, { variant: 'detail' });

  const actions = document.querySelector('.project-actions');
  actions.innerHTML = '';
  renderActionButtons(data, actions);
}

function renderProjectBody(data, content) {
  const sections = splitBodyByH2(content);
  const root = document.querySelector('.project-content');
  root.innerHTML = '';

  function addSection(heading, body) {
    if (!body) return;
    const h = document.createElement('h2');
    h.textContent = heading;
    root.appendChild(h);
    const html = marked.parse(body);
    const div = document.createElement('div');
    div.innerHTML = html;
    while (div.firstChild) root.appendChild(div.firstChild);
  }

  function maybeInjectGallery(after) {
    if (sections.galleryAfter === after) {
      renderScreenshotGallery(data.screenshots, data.slug, root);
    }
  }

  if (sections.galleryAfter === 'top') {
    renderScreenshotGallery(data.screenshots, data.slug, root);
  }

  addSection('Why', sections.why);
  maybeInjectGallery('why');

  addSection('Architecture', sections.architecture);
  maybeInjectGallery('architecture');

  addSection('CIA', sections.cia);
  addSection('Notes', sections.notes);
}

function renderProject(data, content) {
  renderProjectHeader(data);
  renderProjectBody(data, content);
}

async function loadProject(slug) {
  const response = await fetch(`/projects/${slug}.md`);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const md = await response.text();
  const { data, content } = parseMarkdown(md);
  if (!data.slug) data.slug = slug;
  renderProject(data, content);
}

function initProject() {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');
  if (!slug) {
    document.querySelector('.project-title').textContent = 'Project not found';
    document.querySelector('.project-goal').textContent = 'Invalid slug';
    return;
  }
  loadProject(slug).catch((err) => {
    console.error('Error loading project:', err);
    document.querySelector('.project-title').textContent = 'Error loading project';
    document.querySelector('.project-goal').textContent = 'Please try again later';
  });
}

document.addEventListener('DOMContentLoaded', initProject);
