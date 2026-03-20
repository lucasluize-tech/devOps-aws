## Project
s3-bucket-landing — Cloud DevOps portfolio website with blog, showcasing projects, skills, and technical writing for recruiters and companies.

## Stack
- Vanilla HTML/CSS/JS (no build tools, no frameworks)
- Markdown blog posts with YAML front-matter, parsed client-side
- marked.js (CDN) for markdown rendering
- gray-matter (CDN + npm) for front-matter parsing
- Google Fonts: Bricolage Grotesque, DM Sans, JetBrains Mono
- Jest 30 for unit tests, Playwright 1.57 for e2e tests
- Deployed on AWS S3 (private) + CloudFront (HTTPS) via GitHub Actions CI/CD

## Structure
- `/` — HTML pages (index.html, post.html, 404.html), JS modules (index.js, post.js, utils.js), CSS (styles.css, post.css)
- `posts/` — Markdown blog posts and `index.json` registry of all post slugs
- `tests/unit/` — Jest unit tests (parsing, filtering, search, pagination, index consistency)
- `tests/e2e/` — Playwright browser tests (homepage, posts, pagination, search, navigation)
- `.github/workflows/` — CI/CD pipeline (test + deploy to S3 + CloudFront invalidation)

## Commands
- Dev: `python3 -m http.server 8000` (serve from project root)
- Test unit: `npm test`
- Test e2e: `npm run test:e2e`
- Test all: `npm run test:all`
- Deploy: automatic via GitHub Actions on push to `master`

## Verification
After every change, run in this order:
1. `npm test` — fix unit test failures
2. `npm run test:e2e` — fix e2e test failures (starts its own server on port 8000)

## Conventions
- Blog posts are markdown files in `posts/` with YAML front-matter (title, author, excerpt, date, slug, banner, tags)
- Every new post must be added to `posts/index.json` — the `posts-index-consistency` test enforces this
- utils.js uses a dual-export pattern: `module.exports` for Node.js tests, `window.*` for browser
- CSS uses custom properties in `:root` — all colors, spacing, and theme values are centralized there
- Design uses a warm violet (#a78bfa) + orange (#f97316) palette with terminal/infrastructure aesthetic
- Fonts: Bricolage Grotesque for headings, DM Sans for body, JetBrains Mono for code/terminal elements
- Section headings are uppercase with `::before` accent bars and `::after` status labels via CSS

## Don't
- Don't change e2e test selectors without updating both CSS and `tests/e2e/blog.test.js` — critical selectors: `#posts-list .card`, `#pagination-controls`, `.dot.active`, `.pagination-arrows button`, `#search-input`, `h1.post-title`, `.post-content`, `#share-twitter`
- Don't change class names used by JS rendering (`.card`, `.badge`, `.muted`, `.post-title`, `.post-meta`, `.post-content`, `.reading-time`, `.badges`) — index.js and post.js generate DOM with these
- Don't add build tools or frameworks — the site is intentionally plain HTML/CSS/JS for simplicity and S3 static hosting
- Don't commit secrets — AWS credentials, GA IDs for other properties, and deploy scripts are in `.gitignore` and GitHub Secrets
- Don't use Inter, Space Grotesk, Roboto, or system-ui fonts — the design intentionally avoids generic/overused developer portfolio typography
