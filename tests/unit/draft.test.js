import {
  getDraft, updateDraft, resetDraft, subscribeDraft,
  validateDraft, draftLines, DRAFT_LIMITS,
} from '../../app/draft.js';

beforeEach(() => resetDraft('system'));

test('updateDraft merges known fields and notifies with source', () => {
  const seen = [];
  const off = subscribeDraft((d, source) => seen.push([d.subject, source]));
  updateDraft({ subject: 'SRE role', bogus: 'x' }, 'shell');
  expect(getDraft().subject).toBe('SRE role');
  expect(getDraft()).not.toHaveProperty('bogus');
  expect(seen).toEqual([['SRE role', 'shell']]);
  off();
  updateDraft({ subject: 'other' }, 'form');
  expect(seen).toHaveLength(1); // unsubscribed
});

test('resetDraft clears all fields', () => {
  updateDraft({ name: 'Jane', message: 'hi' }, 'form');
  resetDraft('shell');
  expect(getDraft()).toEqual({ name: '', email: '', subject: '', message: '' });
});

test('validateDraft names the missing field and the set fix', () => {
  const errs = validateDraft({ name: 'Jane', email: '', subject: 's', message: 'm' });
  expect(errs.some((l) => l.includes('set email'))).toBe(true);
  expect(validateDraft({ name: 'J', email: 'j@co.com', subject: 's', message: 'm' })).toEqual([]);
});

test('validateDraft rejects bad email and over-limit message', () => {
  expect(validateDraft({ name: 'J', email: 'nope', subject: 's', message: 'm' })
    .some((l) => l.includes('valid email'))).toBe(true);
  const long = 'x'.repeat(DRAFT_LIMITS.message + 1);
  expect(validateDraft({ name: 'J', email: 'j@co.com', subject: 's', message: long })
    .some((l) => l.includes('too long'))).toBe(true);
});

test('draftLines renders a mail header block', () => {
  updateDraft({ name: 'Jane', email: 'j@co.com', subject: 'SRE', message: 'Hi' }, 'form');
  const lines = draftLines(getDraft());
  expect(lines[0]).toBe('From: Jane <j@co.com>');
  expect(lines).toContain('To: lucas@devops');
  expect(lines).toContain('Subject: SRE');
});
