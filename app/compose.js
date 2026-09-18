// app/compose.js - binds the contact page's compose form to the shared
// draft (app/draft.js); `set subject x` in the shell updates these inputs
// live. Form submit and the `send` command both dispatch 'draft:send'.
import { getDraft, updateDraft, resetDraft, subscribeDraft, submitDraft, draftAgeMs } from './draft.js';

const FIELD_IDS = { name: 'cf-name', email: 'cf-email', subject: 'cf-subject', message: 'cf-message' };

// Composer footer state machine: reflects real application state only
// (draft empty / edited / request in flight / relay verdict).
const STATES = {
  draft: ['● draft', 'cf-st-draft'],
  modified: ['● modified', 'cf-st-modified'],
  sending: ['◐ sending', 'cf-st-sending'],
  sent: ['● sent', 'cf-st-sent'],
  failed: ['× failed', 'cf-st-failed'],
};

// Module-scope, not per-instance: guards every compose form across pjax
// visits so a stacked stale listener (fix below) can never double-fire a
// flight alongside the live one.
let inFlight = false;

export function initCompose(form) {
  if (!form || form.dataset.composeWired) return;
  form.dataset.composeWired = '1';
  const wiredAt = Date.now();

  const els = {};
  for (const [k, id] of Object.entries(FIELD_IDS)) els[k] = form.querySelector('#' + id);

  const isEmpty = (d) => !d.name && !d.email && !d.subject && !d.message;
  const deriveState = () => {
    if (inFlight) return;
    setState(form, isEmpty(getDraft()) ? 'draft' : 'modified');
    clearAlert(form);
  };

  // hydrate from the singleton (draft survives pjax away/back)
  const d = getDraft();
  for (const k of Object.keys(els)) if (els[k]) els[k].value = d[k];
  if (!isEmpty(d)) setState(form, 'modified');

  // form -> draft
  for (const [k, el] of Object.entries(els)) {
    if (el) el.addEventListener('input', () => { updateDraft({ [k]: el.value }, 'form'); deriveState(); });
  }

  // draft -> form (shell edits appear instantly; skip 'form' echoes so the
  // caret is never disturbed while typing)
  const off = subscribeDraft((snap, source) => {
    if (source === 'form' || !document.contains(form)) { if (!document.contains(form)) off(); return; }
    for (const k of Object.keys(els)) if (els[k] && els[k].value !== snap[k]) els[k].value = snap[k];
    deriveState();
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
      deriveState();
    }
  });

  const snapshotForSent = () => getDraft(); // captured before reset
  const onSend = async () => {
    if (!document.contains(form)) { document.removeEventListener('draft:send', onSend); return; }
    if (inFlight) return; // re-entry guard: a double-click/ctrl+enter can't start a second flight
    inFlight = true;
    try {
      const sent = snapshotForSent();
      const hp = form.querySelector('[data-cf-hp]');
      const age = draftAgeMs();
      clearAlert(form);
      setState(form, 'sending');
      const r = await submitDraft({ website: hp ? hp.value : '', t: age === null ? Date.now() - wiredAt : age }, () => {});
      if (r.ok) {
        renderSent(form, sent, r.messageId);
      } else {
        setState(form, 'failed');
        if (r.reason === 'validation') showAlert(form, [['× send failed', 'cf-al-err'], ...r.errors.map((e) => [e, ''])]);
        else if (r.reason === 'rate') showAlert(form, [['× send failed', 'cf-al-err'], ['rate limited - wait before sending again', ''], ['draft preserved', 'cf-al-ok']]);
        else showAlert(form, [['× send failed', 'cf-al-err'], ['relay unavailable', ''], ['draft preserved', 'cf-al-ok']]);
      }
      document.dispatchEvent(new CustomEvent('draft:sent', { detail: r }));
    } finally {
      inFlight = false;
    }
  };
  document.addEventListener('draft:send', onSend);
}

function renderSent(form, d, messageId) {
  // only surface an id the relay actually returned - 'accepted'/'queued'
  // are local fallbacks, never fabricated ids
  const realId = messageId && messageId !== 'accepted' && messageId !== 'queued' ? messageId : '';
  const sent = document.createElement('div');
  sent.className = 'cf-sent';
  sent.setAttribute('role', 'status'); // announce the accepted state, not just recolor it
  sent.innerHTML = `<p class="cf-sent-head">✓ message accepted</p>
<dl><dt>From:</dt><dd data-sent-from></dd><dt>To:</dt><dd>lucas@devops</dd><dt>Subject:</dt><dd data-sent-subj></dd></dl>
<dl class="cf-sent-meta"><dt>transport</dt><dd>AWS SES</dd><dt>status</dt><dd class="cf-al-ok">accepted</dd>${realId ? '<dt>message-id</dt><dd class="cf-mid"></dd>' : ''}</dl>
<p>Thanks for reaching out.</p>
<button type="button" class="cf-send" data-cf-new>[ new message ]</button>`;
  sent.querySelector('[data-sent-from]').textContent = `${d.name} <${d.email}>`;
  sent.querySelector('[data-sent-subj]').textContent = d.subject;
  if (realId) sent.querySelector('.cf-mid').textContent = realId;
  form.replaceChildren(sent);
  sent.querySelector('[data-cf-new]').addEventListener('click', () => location.reload());
}

function setState(form, key) {
  const bar = form.querySelector('[data-cf-status]');
  if (!bar) return;
  const [text, cls] = STATES[key];
  bar.textContent = text;
  bar.className = 'cf-status ' + cls;
}

// Structured terminal-style failure output; lines are [text, class] pairs.
function showAlert(form, lines) {
  const el = form.querySelector('[data-cf-alert]');
  if (!el) return;
  el.replaceChildren(...lines.map(([text, cls]) => {
    const div = document.createElement('div');
    div.className = 'cf-al-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    return div;
  }));
  el.hidden = false;
}

function clearAlert(form) {
  const el = form.querySelector('[data-cf-alert]');
  if (!el || el.hidden) return;
  el.hidden = true;
  el.replaceChildren();
}
