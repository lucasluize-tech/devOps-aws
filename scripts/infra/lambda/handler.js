// scripts/infra/lambda/handler.js - pure contact relay handler.
// createHandler(sendEmail) so unit tests inject a fake; index.js wires SES.
// Limits mirror app/draft.js DRAFT_LIMITS (duplicated on purpose: the
// deployed artifact must be dependency-free and not import browser ESM).
'use strict';

const TO = 'me@lucasluize.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { name: 100, email: 200, subject: 150, message: 2000 };
const MIN_FILL_MS = 3000;

const resp = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

function validate(p) {
  if (!p || typeof p !== 'object') return 'bad payload';
  for (const k of Object.keys(LIMITS)) {
    if (typeof p[k] !== 'string' || !p[k].trim()) return `${k} required`;
    if (p[k].length > LIMITS[k]) return `${k} too long`;
  }
  if (!EMAIL_RE.test(p.email.trim())) return 'invalid email';
  return null;
}

function createHandler(sendEmail) {
  return async function handler(event) {
    let payload;
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
      payload = JSON.parse(raw);
    } catch (_) {
      return resp(400, { error: 'invalid JSON' });
    }
    // Honeypot filled or superhuman fill time: fake success, never teach the bot.
    if ((payload && payload.website) || (payload && typeof payload.t === 'number' && payload.t < MIN_FILL_MS)) {
      return resp(200, { messageId: 'queued' });
    }
    const err = validate(payload);
    if (err) return resp(400, { error: err });
    try {
      const { messageId } = await sendEmail({
        from: TO,
        to: TO,
        replyTo: payload.email.trim(),
        subject: `[portfolio] ${payload.subject.trim()}`,
        text: `${payload.message}\n\n- ${payload.name} (${payload.email})`,
      });
      return resp(200, { messageId });
    } catch (_) {
      return resp(500, { error: 'relay failure' });
    }
  };
}

module.exports = { createHandler };
