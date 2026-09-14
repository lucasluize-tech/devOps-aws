// app/compose.js - binds the contact page's compose form to the shared
// draft (app/draft.js); `set subject x` in the shell updates these inputs
// live. Form submit and the `send` command both dispatch 'draft:send'.
import { getDraft, updateDraft, resetDraft, subscribeDraft, submitDraft } from './draft.js';

const FIELD_IDS = { name: 'cf-name', email: 'cf-email', subject: 'cf-subject', message: 'cf-message' };

export function initCompose(form) {
  if (!form || form.dataset.composeWired) return;
  form.dataset.composeWired = '1';
  const wiredAt = Date.now();

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

  const snapshotForSent = () => getDraft(); // captured before reset
  document.addEventListener('draft:send', async () => {
    if (!document.contains(form)) return;
    const sent = snapshotForSent();
    const hp = form.querySelector('[data-cf-hp]');
    setStatus(form, 'sending...', '');
    const r = await submitDraft({ website: hp ? hp.value : '', t: Date.now() - wiredAt }, (n, label, ok) => {
      setStatus(form, `[${n}/3] ${label} ${ok ? 'ok' : 'failed'}`, '');
    });
    if (r.ok) { renderSent(form, sent, r.messageId); }
    else if (r.reason === 'validation') setStatus(form, r.errors[0], 'cf-err');
    else if (r.reason === 'rate') setStatus(form, '429 too many requests - please wait before sending another message', 'cf-err');
    else setStatus(form, 'relay unavailable - nothing lost, your draft is still here', 'cf-err');
    document.dispatchEvent(new CustomEvent('draft:sent', { detail: r }));
  });
}

function renderSent(form, d, messageId) {
  const sent = document.createElement('div');
  sent.className = 'cf-sent';
  sent.innerHTML = `<p class="cf-sent-head">✓ Message accepted</p>
<dl><dt>From</dt><dd></dd><dt>Subject</dt><dd></dd>
<dt>Queue</dt><dd>accepted</dd><dt>Relay</dt><dd>AWS SES</dd><dt>id</dt><dd class="cf-mid"></dd></dl>
<p>Thanks for reaching out - I'll get back to you.</p>
<button type="button" class="cf-send" data-cf-new>new message</button>`;
  sent.querySelectorAll('dd')[0].textContent = `${d.name} <${d.email}>`;
  sent.querySelectorAll('dd')[1].textContent = d.subject;
  sent.querySelector('.cf-mid').textContent = messageId;
  form.replaceChildren(sent);
  sent.querySelector('[data-cf-new]').addEventListener('click', () => location.reload());
}

export function setStatus(form, text, cls) {
  const bar = form.querySelector('[data-cf-status]');
  if (!bar) return;
  bar.textContent = text;
  bar.className = 'cf-status' + (cls ? ' ' + cls : '');
}
