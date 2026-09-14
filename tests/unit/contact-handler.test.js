const { createHandler } = require('../../scripts/infra/lambda/handler.js');

const valid = { name: 'Jane', email: 'j@co.com', subject: 'SRE', message: 'hi', website: '', t: 9000 };
const ev = (payload) => ({ body: JSON.stringify(payload) });

test('valid payload relays via SES with Reply-To submitter', async () => {
  const sent = [];
  const h = createHandler(async (m) => { sent.push(m); return { messageId: 'mid-1' }; });
  const res = await h(ev(valid));
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body)).toEqual({ messageId: 'mid-1' });
  expect(sent[0].replyTo).toBe('j@co.com');
  expect(sent[0].subject).toBe('[portfolio] SRE');
  expect(sent[0].to).toBe('me@lucasluize.com');
});

test('missing field, bad email, oversize message -> 400, nothing sent', async () => {
  const sendEmail = jest.fn();
  const h = createHandler(sendEmail);
  for (const bad of [
    { ...valid, name: '' },
    { ...valid, email: 'nope' },
    { ...valid, message: 'x'.repeat(2001) },
  ]) expect((await h(ev(bad))).statusCode).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

test('honeypot or too-fast fill -> 200 fake success, nothing sent', async () => {
  const sendEmail = jest.fn();
  const h = createHandler(sendEmail);
  expect((await h(ev({ ...valid, website: 'bot' }))).statusCode).toBe(200);
  expect((await h(ev({ ...valid, t: 500 }))).statusCode).toBe(200);
  expect(sendEmail).not.toHaveBeenCalled();
});

test('missing t -> 200 fake success (a bot cannot skip the timing gate), nothing sent', async () => {
  const sendEmail = jest.fn();
  const h = createHandler(sendEmail);
  const { t, ...noT } = valid;
  const res = await h(ev(noT));
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body)).toEqual({ messageId: 'queued' });
  expect(sendEmail).not.toHaveBeenCalled();
});

test('malformed JSON and base64 body both handled', async () => {
  const h = createHandler(async () => ({ messageId: 'x' }));
  expect((await h({ body: '{nope' })).statusCode).toBe(400);
  const b64 = { body: Buffer.from(JSON.stringify(valid)).toString('base64'), isBase64Encoded: true };
  expect((await h(b64)).statusCode).toBe(200);
});

test('SES failure -> 500', async () => {
  const h = createHandler(async () => { throw new Error('ses down'); });
  expect((await h(ev(valid))).statusCode).toBe(500);
});
