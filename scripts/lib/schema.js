// scripts/lib/schema.js  (CommonJS - required by Jest and the native-Node build)
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_RE = /^[a-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i;
const LIFECYCLES = ['production', 'maintained', 'archived', 'prototype'];
const PROVENANCE = ['prod', 'personal', 'lab', 'learning'];

const str = (v) => typeof v === 'string' && v.trim().length > 0;

function base(data, filenameSlug, required, errors) {
  for (const f of required) if (!str(data[f]) && typeof data[f] !== 'number') errors.push(`missing field: ${f}`);
  if (str(data.slug)) {
    if (!SLUG_RE.test(data.slug)) errors.push(`bad slug format: ${data.slug}`);
    if (data.slug !== filenameSlug) errors.push(`slug/filename mismatch: ${data.slug} vs ${filenameSlug}`);
  }
  if (str(data.date) && !(DATE_RE.test(data.date) && !isNaN(Date.parse(data.date))))
    errors.push(`bad date: ${data.date}`);
}

function validatePost(data, filenameSlug) {
  const errors = [];
  base(data, filenameSlug, ['title', 'author', 'excerpt', 'date', 'slug'], errors);
  if (data.tags && !Array.isArray(data.tags)) errors.push('tags must be an array');
  return errors;
}

function validateProject(data, filenameSlug) {
  const errors = [];
  base(data, filenameSlug, ['title', 'slug', 'category', 'lifecycle', 'goal', 'date'], errors);
  if (!LIFECYCLES.includes(data.lifecycle)) errors.push(`lifecycle must be one of ${LIFECYCLES}`);
  if (!PROVENANCE.includes(data.provenance)) errors.push(`provenance must be one of ${PROVENANCE}`);
  if (!Number.isInteger(data.featured_order) || data.featured_order < 1) errors.push('featured_order must be integer >= 1');
  if (!Array.isArray(data.tech_stack) || data.tech_stack.length === 0) errors.push('tech_stack required');
  if (data.repo_visibility && !['public', 'private'].includes(data.repo_visibility)) errors.push('repo_visibility: public|private');
  for (const s of data.screenshots || []) {
    if (!s || !FILE_RE.test(s.file || '')) errors.push(`bad screenshot file: ${s && s.file}`);
    if (!str(s.alt)) errors.push('screenshot alt required');
  }
  for (const url of [data.github, data.demo].filter(Boolean))
    if (!/^https:\/\//.test(url)) errors.push(`non-https url: ${url}`);
  return errors;
}

module.exports = { validatePost, validateProject, SLUG_RE };
