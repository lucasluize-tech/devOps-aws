jest.mock('../../app/config.js', () => ({ CONTACT_ENDPOINT: '/api/contact' }));

import {
  getDraft, updateDraft, resetDraft, subscribeDraft,
  validateDraft, draftLines, DRAFT_LIMITS, submitDraft,
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

describe('submitDraft', () => {
  const { webcrypto } = require('node:crypto');
  beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto; });

  const fill = () => updateDraft({ name: 'J', email: 'j@co.com', subject: 's', message: 'hi' }, 'form');
  afterEach(() => { delete global.fetch; });

  test('validation failure reports errors, sends nothing, keeps draft', async () => {
    global.fetch = jest.fn();
    const r = await submitDraft({ website: '', t: 9000 }, () => {});
    expect(r).toMatchObject({ ok: false, reason: 'validation' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('success posts JSON with payload hash header and resets draft', async () => {
    fill();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messageId: 'abc' }) });
    const stages = [];
    const r = await submitDraft({ website: '', t: 9000 }, (n, label, ok) => stages.push([n, ok]));
    expect(r).toEqual({ ok: true, messageId: 'abc' });
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(init.body).subject).toBe('s');
    expect(stages.map(([n]) => n)).toEqual([1, 2, 3]);
    expect(getDraft().message).toBe(''); // reset on success
  });

  test('429 maps to rate, 500 maps to relay, draft preserved', async () => {
    fill();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    expect((await submitDraft({ website: '', t: 9000 }, () => {})).reason).toBe('rate');
    global.fetch = jest.fn().mockRejectedValue(new Error('boom'));
    expect((await submitDraft({ website: '', t: 9000 }, () => {})).reason).toBe('relay');
    expect(getDraft().message).toBe('hi');
  });

  test('honeypot filled pretends success without fetching', async () => {
    fill();
    global.fetch = jest.fn();
    const r = await submitDraft({ website: 'bot', t: 100 }, () => {});
    expect(r.ok).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
