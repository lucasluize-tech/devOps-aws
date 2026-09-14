// app/draft.js - one contact draft, two surfaces (composer form + shell).
// ES-module singleton: prompt.js and compose.js import the same instance,
// so the draft survives pjax navigation and both UIs stay in sync.
import { CONTACT_ENDPOINT } from './config.js';

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

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// One send path for both surfaces: [1/3] validating draft, [2/3] submitting
// to relay, [3/3] accepted by SES.
export async function submitDraft(extras, onStage) {
  const d = getDraft();
  const errors = validateDraft(d);
  onStage(1, 'validating draft', errors.length === 0);
  if (errors.length) return { ok: false, reason: 'validation', errors };
  if (extras.website) {
    // bot filled the honeypot - pretend success, never teach it
    onStage(2, 'submitting to relay', true);
    onStage(3, 'accepted by SES', true);
    resetDraft('system');
    return { ok: true, messageId: 'queued' };
  }
  if (!CONTACT_ENDPOINT) return { ok: false, reason: 'unconfigured' };
  const body = JSON.stringify({ ...d, website: '', t: extras.t });
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (globalThis.crypto && crypto.subtle) headers['x-amz-content-sha256'] = await sha256Hex(body);
    onStage(2, 'submitting to relay', true);
    const res = await fetch(CONTACT_ENDPOINT, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) return { ok: false, reason: 'rate' };
    if (!res.ok) return { ok: false, reason: 'relay' };
    const data = await res.json().catch(() => ({}));
    onStage(3, 'accepted by SES', true);
    resetDraft('system');
    return { ok: true, messageId: data.messageId || 'accepted' };
  } catch (_) {
    return { ok: false, reason: 'relay' };
  }
}
