# Contact Workspace: mail(1) Composer + SES Backend

Date: 2026-09-14
Status: approved (user-reviewed design conversation)

## Goal

Turn the stub contact page into the site's mail client: a NeoMutt-style visual
composer and the shell manipulating one shared draft, delivered for real via
AWS SES behind the existing Cloudflare -> CloudFront chain. Contact's TUI
metaphor is literal - the visitor composes and sends mail from a terminal.

The centerpiece is one draft state machine with two surfaces. The visual
composer and the prompt commands read and write the same draft; neither is
decorative.

## Non-goals

- No category/context dropdown, no extra fields. Name, email, subject,
  message only.
- No third-party form services, no API Gateway, no new DNS records.
- No exposure of security internals (bot scores, IPs, rate counters) in the
  UI. `transport: AWS SES` is the only infrastructure fact shown.
- No DynamoDB daily-cap layer for now. Abuse control = Cloudflare rate rule
  (already configured: 3 req/10s on /api/contact + Bot Fight Mode) +
  Lambda reserved concurrency 1 + server-side validation.

## Architecture

### 1. Draft engine - `app/draft.js` (new, ~50 lines)

- Single module-scope draft: `{ name, email, subject, message }` +
  `subscribe(fn)` / `update(patch)` / `reset()` / `get()`.
- ES module singleton: `prompt.js` (global chrome) and `compose.js` (contact
  page) import the same instance, so shell and form are automatically in
  sync and the draft survives pjax navigation away and back.
- `submitDraft()` is the one send path both surfaces call: client-side
  validation -> staged progress events -> POST -> success/failure events.
  Subscribers render those events in their own surface (scrollback lines,
  composer status bar / SENT pane).

### 2. Contact page - `contactPane()` in `scripts/lib/pages.js` + `app/compose.js` (new)

Desktop: two panes side by side.

- Left, `finger lucas` pane: identity (name, role, Tampa FL / remote
  friendly), links (github, linkedin, resume), `● accepting mail` status.
- Right, compose pane: rigid monospaced field rows (From, Name, Subject,
  Message textarea), separator rule, status bar
  `● draft · via AWS SES · ctrl+enter send · esc cancel`.
  Real `<form>` with real `<label>`s under the styling - accessible and
  phone-usable. No floating web-form boxes; pane geometry like the rest of
  the site.

Mobile: stacked finger -> compose -> prompt. No horizontal scroll.

`app/compose.js` wires the form to the draft engine: input events ->
`update()`, draft events -> field values (so `set subject "x"` in the shell
changes the visible input), ctrl+enter -> `submitDraft()`, esc -> cancel.
Status/progress rendered into an aria-live polite region. Success transforms
the compose pane into a SENT summary (from/subject/queue: accepted/relay:
AWS SES + message-id) with `[n] new message`.

Career facts in the finger pane come from
`~/projects/lucas/job-search/docs/master-resume.md` + `profile.md`
(canonical source; do not invent).

### 3. Shell vocabulary - `app/prompt.js`

- `contact` - existing wizard, gains a `subject:` step; steps write into the
  shared draft (visible live in the composer).
- `mail lucas` - navigate to ~/contact if elsewhere, focus the composer.
- `mail -s "subject" lucas` - same, subject prefilled.
- `draft` - print current draft to scrollback.
- `set <field> <value>` - update one field (name|email|subject|message);
  form updates instantly.
- `send` - submit the shared draft (confirm step reuses wizard confirm UI).
- `cancel` - reset draft.
- `draft`/`set`/`send`/`cancel` outside ~/contact: print a hint to
  `cd contact`. `mail` works from anywhere.
- Tab completion covers the new verbs and `set` field names.
- Easter eggs: `ssh lucas@devops` -> `Permission denied (publickey). Try
  'mail lucas' instead.`; `ping lucas` -> reachable, `0% packet loss`.
- Keep the vocabulary tiny; we are not building bash.

### 4. Backend - Lambda + SES + CloudFront behavior

- Lambda (Node 22 runtime, AWS SDK v3 preinstalled, no bundling): validates
  payload server-side (required fields, EMAIL_RE, max lengths, honeypot
  `website` empty, min fill time `t`), then SES v2 SendEmail:
  To = From = verified `me@lucasluize.com`, Reply-To = submitter,
  subject prefixed `[portfolio]`. Returns `{ messageId }`; 400 on
  validation failure, 500 on relay failure. Handler is a plain exported
  function (unit-testable without AWS).
- SES sandbox is sufficient permanently: we only send to the verified
  identity. One-time manual step: verify me@lucasluize.com in SES.
- Reserved concurrency 1 - hard cost/abuse ceiling.
- Routing: new behavior on the existing CloudFront distribution
  (E1XPOJ09AWDJIN): path `/api/contact`, POST allowed, caching disabled,
  origin = Lambda Function URL. Endpoint rides
  devops.lucasluize.com/api/contact, so the Cloudflare rate rule applies.
- Bypass protection: Function URL auth = AWS_IAM + CloudFront Origin Access
  Control (sigv4) - direct invocation of the raw Lambda URL is impossible.
  Consequence: OAC-signed POSTs require the client to send
  `x-amz-content-sha256`; `sendContact()` gains a small
  `crypto.subtle.digest` helper to compute the body hash.
- Provisioning: `scripts/infra/contact-backend.sh` - idempotent AWS CLI
  script in the existing CloudFront-error-pages style: diff-and-apply for
  IAM role, function code/config, function URL, OAC, distribution behavior;
  safe to re-run; ends with a curl smoke test against the live endpoint.
  No secrets in the repo.
- Client config: `CONTACT_ENDPOINT = '/api/contact'` in `app/config.js`.

### 5. States and errors (terminal-native copy)

- Sending prints staged feedback in the scrollback and mirrors it in the
  composer status bar:
  `[1/3] validating draft ok / [2/3] submitting to relay ok /
  [3/3] accepted by SES ok / ✓ message sent`.
- Validation error: names the field and the fix
  (`× From address is required. set it with: set email you@example.com`).
- 429: `send: temporarily unavailable - 429 too many requests. Please wait
  before sending another message.`
- Relay/network failure: `send: relay unavailable. The message was not
  submitted. Nothing has been lost - your draft is still here.` plus the
  existing mailto fallback link (draft preserved).

## Error handling summary

| Failure | Behavior |
|---|---|
| Client validation | Inline terminal error naming field + `set` fix; no request sent |
| 400 from Lambda | Same rendering as client validation (server echoes field errors) |
| 429 (Cloudflare) | Temporarily-unavailable screen; draft kept |
| 5xx / network / timeout | Relay-unavailable copy; draft kept; mailto fallback link |
| Honeypot filled | Client and Lambda both pretend success (never teach the bot) |

## Testing

- Unit (Jest): draft store (update/subscribe/reset), `set`/`mail -s` arg
  parsing, shared payload validation, Lambda handler (mock SES client).
- E2E (Playwright, behavior not presence): type in form -> `draft` echoes
  values; `set subject x` -> form input value changes; `contact` wizard
  fills draft visible in composer; full send locally (no backend) ->
  relay-unavailable + draft preserved + mailto fallback; wizard e2e updated
  for the subject step; a11y scan covers /contact.html.
- Infra: the provisioning script's final smoke test POSTs a marked test
  message through the live endpoint and asserts 200 + messageId.
- a11y lesson applied: no CSS transitions on text color/opacity (axe on
  slow CI scans mid-fade).

## Build order (each step independently shippable)

1. Draft engine + contact page composer (form works, mailto fallback path).
2. Shell vocabulary + two-surface sync + wizard subject step.
3. Backend: Lambda handler + idempotent infra script + manual SES verify.
4. Wire CONTACT_ENDPOINT, payload-hash helper, staged states, SENT pane
   polish, easter eggs.

## One-time manual steps (user)

- Verify me@lucasluize.com as an SES identity (click the verification email).
- Cloudflare rate rule + Bot Fight Mode: already done (2026-09-14).
