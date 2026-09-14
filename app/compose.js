// app/compose.js - binds the contact page's compose form to the shared
// draft (app/draft.js). The shell (prompt.js) writes the same draft, so
// `set subject x` updates these inputs live and typing here is visible
// to the `draft` command. One send path: form submit and the `send`
// command both dispatch 'draft:send'.
import { getDraft, updateDraft, resetDraft, subscribeDraft } from './draft.js';

const FIELD_IDS = { name: 'cf-name', email: 'cf-email', subject: 'cf-subject', message: 'cf-message' };

export function initCompose(form) {
  if (!form || form.dataset.composeWired) return;
  form.dataset.composeWired = '1';

  const els = {};
  for (const [k, id] of Object.entries(FIELD_IDS)) els[k] = form.querySelector('#' + id);

  // hydrate from the singleton (draft survives pjax away/back)
  const d = getDraft();
  for (const k of Object.keys(els)) if (els[k]) els[k].value = d[k];

  // form -> draft
  for (const [k, el] of Object.entries(els)) {
    if (el) el.addEventListener('input', () => updateDraft({ [k]: el.value }, 'form'));
  }

  // draft -> form (shell edits appear instantly; skip 'form' echoes so the
  // caret is never disturbed while typing)
  const off = subscribeDraft((snap, source) => {
    if (source === 'form' || !document.contains(form)) { if (!document.contains(form)) off(); return; }
    for (const k of Object.keys(els)) if (els[k] && els[k].value !== snap[k]) els[k].value = snap[k];
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('draft:send'));
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('draft:send'));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      resetDraft('form');
      setStatus(form, '● draft discarded - via AWS SES', '');
    }
  });
}

export function setStatus(form, text, cls) {
  const bar = form.querySelector('[data-cf-status]');
  if (!bar) return;
  bar.textContent = text;
  bar.className = 'cf-status' + (cls ? ' ' + cls : '');
}
