// scripts/infra/lambda/index.js - deployed Lambda entry (Node 22 runtime,
// AWS SDK v3 preinstalled in the runtime - nothing to bundle).
'use strict';
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { createHandler } = require('./handler.js');

const ses = new SESv2Client({});

exports.handler = createHandler(async ({ from, to, replyTo, subject, text }) => {
  const out = await ses.send(new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: [replyTo],
    Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
  }));
  return { messageId: out.MessageId };
});
