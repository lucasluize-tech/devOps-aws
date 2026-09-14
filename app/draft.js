// app/draft.js - one contact draft, two surfaces (composer form + shell).
// ES-module singleton: prompt.js and compose.js import the same instance,
// so the draft survives pjax navigation and both UIs stay in sync.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DRAFT_LIMITS = { name: 100, email: 200, subject: 150, message: 2000 };
const FIELDS = ['name', 'email', 'subject', 'message'];

let draft = { name: '', email: '', subject: '', message: '' };
const subs = new Set();

export function getDraft() { return { ...draft }; }

export function updateDraft(patch, source) {
  for (const k of FIELDS) if (typeof patch[k] === 'string') draft[k] = patch[k];
  const snap = getDraft();
  for (const fn of subs) fn(snap, source);
}

export function resetDraft(source) {
  draft = { name: '', email: '', subject: '', message: '' };
  const snap = getDraft();
  for (const fn of subs) fn(snap, source);
}

export function subscribeDraft(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Terminal-style validation lines; [] means sendable. Copy per spec:
// name the field AND the shell fix so errors teach the interface.
export function validateDraft(d) {
  const errs = [];
  if (!d.name.trim()) errs.push('x name is required. set it with: set name Jane Smith');
  if (!d.email.trim()) errs.push('x from address is required. set it with: set email you@example.com');
  else if (!EMAIL_RE.test(d.email.trim())) errs.push("x that doesn't look like a valid email. fix it with: set email you@example.com");
  if (!d.subject.trim()) errs.push('x subject is required. set it with: set subject hello');
  if (!d.message.trim()) errs.push('x message is empty. set it with: set message ...');
  for (const [k, max] of Object.entries(DRAFT_LIMITS)) {
    if (d[k] && d[k].length > max) errs.push(`x ${k} too long (max ${max} chars, got ${d[k].length}).`);
  }
  return errs;
}

export function draftLines(d) {
  return [
    `From: ${d.name || '(unset)'} <${d.email || 'unset@nowhere'}>`,
    'To: lucas@devops',
    `Subject: ${d.subject || '(no subject)'}`,
    '',
    d.message || '(empty message)',
  ];
}
