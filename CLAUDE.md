## Project
s3-bucket-landing — Cloud DevOps portfolio website with blog, showcasing projects, skills, and technical writing for recruiters and companies.

## Stack
- Terminal-multiplexer UI: static HTML pages shell in runtime ES modules (`app/`) - no frameworks
- Markdown is an AUTHORING format only, compiled to HTML at build time; NEVER parsed in the browser
- One deterministic content-compile step (`scripts/build-content.js` → `dist/`) is the only build
- marked + sanitize-html + gray-matter run at BUILD time (Node), not shipped to the browser
- Google Fonts: Bricolage Grotesque, DM Sans, JetBrains Mono
- Jest 30 for unit tests, Playwright 1.57 for e2e tests
- Deployed on AWS S3 (private) + CloudFront (HTTPS) via GitHub Actions CI/CD (CI runs the build, deploys `dist/`)

## Structure
- `app/` — runtime browser ES modules (`shell.js`, `router.js`, `prompt.js`, `buffers.js`, `config.js`) + `terminal.css`, `reader.css`. This is what the browser loads.
- `scripts/` — the build step. `build-content.js` (entry) + `lib/{schema.js,render.js,pages.js}`. All CommonJS `.js`.
- `utils.js` — build-time markdown helpers (`parseMarkdown`, `calculateReadingTime`), consumed by `build-content.js` and content-valid tests.
- `dist/` — build output (HTML pages, per-post/-project pages, `manifest.json`, sitemap, build-info). This is the deployed artifact; gitignored.
- `posts/`, `projects/` — Markdown source (`*.md`). The build globs these directly; there is NO index.json registry.
- `tests/unit/` — Jest unit tests (schema, render, build-output, content-valid, buffers, prompt, router-paths).
- `tests/e2e/` — Playwright tests; the webServer runs `npm run build` then serves `dist/`.
- `.github/workflows/` — CI/CD (test + build + deploy to S3 + CloudFront invalidation).

## Commands
- Build: `npm run build` (compiles markdown → `dist/`)
- Dev/serve: `npm run serve` (builds then serves `dist/` on port 8000)
- Test unit: `npm test`
- Test e2e: `npm run test:e2e` (builds + serves `dist/` itself)
- Test all: `npm run test:all`
- Deploy: automatic via GitHub Actions on push to `master`

## Verification
After every change, run in this order:
1. `npm test` — fix unit test failures
2. `npm run test:e2e` — fix e2e test failures (starts its own server on port 8000)

## Conventions
- Content is markdown in `posts/` / `projects/`; the build globs `*.md` directly (no index.json to update). Front-matter is validated by `scripts/lib/schema.js` at build time - a bad field fails the build.
- Post front-matter (required): `title, author, excerpt, date, slug`; optional `tags` (array). `slug` must match the filename.
- Project front-matter (required): `title, slug, category, lifecycle, goal, date`; plus `provenance`, `featured_order` (int ≥ 1), `tech_stack` (non-empty array). Optional: `repo_visibility` (`public|private`), `github`/`demo` (must be https), `screenshots`.
  - `lifecycle` ∈ `production|maintained|archived|prototype`; `provenance` ∈ `prod|personal|lab|learning`.
  - `screenshots` is a list of `{ file, alt, caption }` (`file` matches `*.png|jpg|jpeg|webp|gif|svg`, `alt` required). Place a `<!-- screenshots -->` marker in the body to control where the gallery renders.
- Build modules are CommonJS `.js` (NOT `.mjs`) - required by both Jest and the native-Node build.
- `utils.js` keeps a dual-export shape: `module.exports` for the build/tests, `window.*` fallback.
- CSS uses custom properties in `:root` — all colors, spacing, and theme values are centralized there
- Design uses a warm violet (#a78bfa) + orange (#f97316) palette with terminal/infrastructure aesthetic
- Fonts: Bricolage Grotesque for headings, DM Sans for body, JetBrains Mono for code/terminal elements
- Section headings are uppercase with `::before` accent bars and `::after` status labels via CSS

## Engagement Specialist Skill
- `/engagement-specialist [topic] [-N]` — generates blog posts from session context (Writer → Critic → Deployer pipeline)
- `-5` stops after save+test, `-7` stops after CI green, no flag runs full pipeline including social media
- Social cards generated via HTML/CSS engine at `~/.claude/skills/engagement-specialist/social-cards/engine.js` (Playwright screenshots, 5 templates per platform)
- Git push is MANUAL — deployer commits but user pushes (SSH passphrase boundary)
- Writer agent must return text only — never save files directly
- Commit format: `action: description` only (e.g., `new blog post: Title`). No Co-Authored-By signatures.

## Security
- `~/.claude/settings.json` has deny patterns blocking reads of `.zshrc`, `.secrets`, `.ssh/*`, `.env`, `*.pem`, `*.key` and commands like `env`, `printenv`, `echo $SECRET_*`
- NEVER read files that may contain secrets — ask the user what's in them instead
- NEVER dispatch agents to read secret-containing files

## Don't
- Locator policy for e2e: tests locate via `getByRole` / `getByLabel` / `getByText` (accessible, resilient), NOT brittle CSS class selectors. Content counts come from `dist/manifest.json` (fetched at runtime), never hardcoded. Don't reintroduce hardcoded selector inventories or counts.
- Don't add frameworks or runtime package dependencies — the browser loads plain ES modules from `app/`. One deterministic content-compile step in CI (`scripts/build-content.js` → `dist/`) is the only build; markdown is an authoring format, never parsed in the browser
- Don't commit secrets — AWS credentials, API tokens, and auth cookies belong in `~/.secrets` (sourced by `.zshrc`, blocked from Claude)
- Don't use Inter, Space Grotesk, Roboto, or system-ui fonts — the design intentionally avoids generic/overused developer portfolio typography
- Don't use Canva MCP for social cards — use the HTML/CSS engine at `social-cards/engine.js` instead (brand consistency)

# AWS Guidance

- Where these AWS rules conflict with the project's own instructions, the project's instructions take precedence.
- Use the AWS CLI directly (profiles: `default`, `vault-backup`). There is no AWS MCP server.
- Before starting a task, check whether a relevant local AWS skill (`.claude/skills/aws-*`) applies and prefer its guidance over general knowledge.
- When uncertain about AWS details (API parameters, permissions, limits, error codes), verify against documentation rather than guessing. State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or CloudFormation) over direct CLI commands, and follow Well-Architected principles.
- Do not use em dashes in AWS resource names or descriptions. Use hyphens instead.
- Secrets: never call `secretsmanager get-secret-value` or `batch-get-secret-value`, and never print credentials. Resolve secrets at runtime so they never enter the conversation.
