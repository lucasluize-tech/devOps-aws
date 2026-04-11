# Social Card System — Design Spec

## Context

The engagement-specialist deployer needs branded social media images. Canva MCP produced inconsistent results — generic subtitles, wrong backgrounds, injected CTA text. An HTML/CSS prototype proved that building cards locally with Playwright screenshots gives full brand control, deterministic output, and faster execution (no API calls).

This spec designs a reusable, multi-platform social card system that the deployer and future platform skills can invoke.

## Architecture

```
~/.claude/skills/engagement-specialist/
├── social-cards/
│   ├── brand.md                    ← brand reference (single source of truth)
│   ├── engine.js                   ← renders HTML template → Playwright → PNG
│   ├── state.json                  ← tracks last-used template per platform
│   └── templates/
│       ├── x/                      ← 5 X/Twitter card variations (1200x675)
│       │   ├── gradient-blobs.html
│       │   ├── terminal-window.html
│       │   ├── split-accent.html
│       │   ├── grid-matrix.html
│       │   └── minimal-type.html
│       ├── linkedin/               ← 5 LinkedIn card variations (1200x627)
│       │   ├── gradient-blobs.html
│       │   ├── terminal-window.html
│       │   ├── split-accent.html
│       │   ├── grid-matrix.html
│       │   └── minimal-type.html
│       ├── instagram-post/         ← (future) 1080x1080
│       ├── instagram-carousel/     ← (future) 1080x1350, TUI/CLI slides
│       └── youtube-thumbnail/      ← (future) 1280x720
```

## Brand Reference File: `brand.md`

The single source of truth for all visual output. Every template and every future platform skill references this file before generating anything.

### Contents:

**Palette:**
- `--bg: #100f14` (primary background)
- `--bg-elevated: #1a1820`
- `--surface: #232129`
- `--text: #ece9f1`
- `--text-bright: #ffffff`
- `--muted: #8b8697`
- `--accent: #a78bfa` (warm violet — primary brand color)
- `--accent-bright: #c4b5fd`
- `--accent-glow: rgba(167, 139, 250, 0.15)`
- `--secondary: #f97316` (orange — secondary accent)
- `--secondary-glow: rgba(249, 115, 22, 0.10)`
- `--border: #2a2833`

**Typography:**
- Headings: Bricolage Grotesque (700, 800 weights)
- Body: DM Sans (400, 500)
- Code/terminal: JetBrains Mono (400)
- All loaded from Google Fonts CDN

**Aesthetic philosophy:**
- Dark-first. Backgrounds are always dark (#100f14 or similar). Never light, white, or grey.
- Terminal/infrastructure aesthetic. Subtle monospace elements, bracket decorations, grid patterns, faint code references.
- Violet is the dominant accent. Orange is the highlight — used sparingly for active states, accent bars, and emphasis.
- Clean and minimal. Generous whitespace. No clutter, no stock photos, no generic icons.
- Professional but personal. This is an engineer's portfolio, not a corporate brand. It should feel intentional and handcrafted, not templated.

**Target audience:**
- DevOps engineers and developers (primary)
- Recruiters and hiring managers evaluating technical depth (secondary)
- The visual signal should say: "this person builds real systems and cares about craft"

**Constraints:**
- No generic CTA text ("Read more", "Discover", "Learn more")
- No stock imagery or people
- No light backgrounds
- Author name "Lucas Luize" always present
- Tags displayed as monospace labels

## Engine: `engine.js`

A Node.js script that:

1. **Accepts parameters:**
   - `--platform` (x, linkedin, instagram-post, instagram-carousel, youtube-thumbnail)
   - `--title` (post title)
   - `--tags` (comma-separated)
   - `--template` (optional — specific template name, or auto-select)
   - `--output` (output PNG path, defaults to `/tmp/social-card-{platform}.png`)

2. **Auto-selects template:**
   - Reads `state.json` to find last-used template for this platform
   - Picks any template except the last-used one
   - If `--template` is specified, uses that instead

3. **Renders:**
   - Reads the HTML template file
   - Injects title, tags, author via string replacement (template uses `{{title}}`, `{{tags}}`, `{{author}}` placeholders)
   - Launches Playwright Chromium
   - Sets viewport to platform dimensions
   - Navigates to the HTML file
   - Waits for fonts to load (1s delay)
   - Takes a screenshot
   - Saves to output path

4. **Updates state:**
   - Writes the used template name to `state.json` for the platform

### Usage:

```bash
node social-cards/engine.js \
  --platform x \
  --title "Securing Agentic Workflows: Data Barriers for Claude Code" \
  --tags "Security,Claude Code,DevOps,AI" \
  --output /tmp/social-card-security.png
```

### state.json format:

```json
{
  "x": { "last_used": "gradient-blobs" },
  "linkedin": { "last_used": "terminal-window" }
}
```

## Template Specifications

All templates share these properties:
- Inline CSS (no external stylesheets — single-file portability)
- Google Fonts loaded via `@import`
- Placeholders: `{{title}}`, `{{tags}}`, `{{author}}`
- All colors from `brand.md`
- Dark backgrounds only

### Platform Dimensions

| Platform | Width | Height | Ratio |
|---|---|---|---|
| X/Twitter | 1200 | 675 | 16:9 |
| LinkedIn | 1200 | 627 | ~1.91:1 |
| Instagram Post | 1080 | 1080 | 1:1 (future) |
| Instagram Carousel | 1080 | 1350 | 4:5 (future) |
| YouTube Thumbnail | 1280 | 720 | 16:9 (future) |

### 5 Card Variations (X + LinkedIn, built now)

#### 1. Gradient Blobs
- Dark bg (#100f14) with two radial gradient blobs (violet top-right, orange bottom-left)
- Subtle grid pattern overlay
- Accent bar (violet→orange gradient) above title
- Large Bricolage Grotesque title, left-aligned
- JetBrains Mono tags as bordered labels
- Faint bracket decorations `{ }` in background
- Author + URL at bottom

#### 2. Terminal Window
- Card styled as a terminal window
- Title bar with three dots (red/yellow/green) and a terminal title
- Dark terminal background (#0f0f1a)
- Title rendered in monospace (JetBrains Mono) as if typed, with a cursor block
- Prompt prefix: `$ ` or `>` before the title
- Tags displayed as CLI flags: `--security --devops --ai`
- Author as a comment: `# Lucas Luize`
- Violet border glow around the terminal frame

#### 3. Split Accent
- Left 30%: solid violet (#a78bfa) vertical panel
- Right 70%: dark bg (#100f14) with title
- Orange horizontal accent line at the split boundary
- Title in white Bricolage Grotesque on the dark side
- Tags on the violet panel in dark text
- Author at bottom-right
- Clean geometric division, no gradients

#### 4. Grid Matrix
- Dark bg with prominent grid pattern (violet lines, higher opacity than gradient-blobs variant)
- Title overlaid large, spanning full width
- Tags displayed as glowing nodes at grid intersections
- Subtle data-flow lines connecting tags (like a network diagram)
- Orange accent dots at key intersections
- Author in bottom corner
- Feels like infrastructure monitoring / network topology

#### 5. Minimal Type
- Almost pure typography. Dark bg, very minimal decoration.
- Title in massive Bricolage Grotesque (60-72px), taking up most of the card
- Tags in small JetBrains Mono below title
- Single thin accent gradient border (1-2px) around the entire card
- Author in muted text at bottom
- Maximum whitespace. Let the typography speak.

## Integration with Deployer

The deployer agent (`agents/deployer.md`) replaces the Canva MCP steps (Step 3) with:

```bash
node ~/.claude/skills/engagement-specialist/social-cards/engine.js \
  --platform x \
  --title "{title}" \
  --tags "{tags}" \
  --output /tmp/social-card-{slug}-x.png

node ~/.claude/skills/engagement-specialist/social-cards/engine.js \
  --platform linkedin \
  --title "{title}" \
  --tags "{tags}" \
  --output /tmp/social-card-{slug}-linkedin.png
```

Then attach the images to the respective social posts.

## Future Platform Skills

Each future platform gets its own invocable skill:

- `/create-insta-carousel` — reads blog post, extracts 5-7 key points, renders TUI/CLI-styled carousel slides (1080x1350), outputs PNG sequence
- `/create-youtube-thumbnail` — renders hook text + visual at 1280x720

These skills call the same `engine.js` with different `--platform` flags and templates.

## Files to Create

| File | Purpose |
|---|---|
| `social-cards/brand.md` | Brand reference — single source of truth |
| `social-cards/engine.js` | Template renderer (HTML → Playwright → PNG) |
| `social-cards/state.json` | Last-used template tracker |
| `social-cards/templates/x/*.html` | 5 X card templates (1200x675) |
| `social-cards/templates/linkedin/*.html` | 5 LinkedIn card templates (1200x627) |

## Files to Modify

| File | Change |
|---|---|
| `agents/deployer.md` | Replace Canva MCP steps with engine.js calls |

## Verification

1. Run `engine.js` for each of the 5 X templates — verify all produce branded PNGs at 1200x675
2. Run `engine.js` for each of the 5 LinkedIn templates — verify all produce branded PNGs at 1200x627
3. Run `engine.js` twice for the same platform — verify state.json prevents repeat
4. Verify all templates match brand.md (dark bg, correct fonts, correct colors, no generic text)
5. Run the deployer pipeline end-to-end — verify it generates cards and attaches to social posts
