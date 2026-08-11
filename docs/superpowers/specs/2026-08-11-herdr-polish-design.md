# herdr polish: color, reader, comments, draggable panes, fun layer

Date: 2026-08-11. Branch: terminal-ui. Approved by Lucas.

Direction: more herdr-like, less tmux-formal. The terminal metaphor drives
interaction and color, not ceremony. Mouse stays first-class; keyboard/commands
are the discoverable second layer.

## 1. Quick fixes

- **Typing cursor follows text.** Remove reliance on flexbox pushing
  `label::after` to the row end. The prompt input auto-sizes to its content
  (`width = value.length + 1 + 'ch'`; exact in monospace), so the blinking
  block sits right after the typed text. Label still spans the row (click
  anywhere focuses input natively).
- **`read %` space.** `content: 'read\00a0'` in the statusline progress
  segment (trailing plain spaces collapse in CSS content).
- **Scrollbars.** Global: 8px, transparent track, rounded thumb with
  violet->orange->yellow gradient. Firefox: `scrollbar-width: thin` +
  `scrollbar-color` solid violet (no gradient support).
- **Background wordmark.** `color-mix` accent 20% -> 30%.

## 2. Semantic color system

New `:root` tokens: `--cyan: #67e8f9`, `--pink: #f472b6`,
`--yellow: #fbbf24`, `--red: #f87171` (green already exists as `--success`).
Applied btop-style - small semantic touches, not rainbow walls:

- lifecycle pills: production = green + pulsing dot ("live" feel),
  maintained = yellow, prototype = cyan, archived = muted. Build emits
  `status-<lifecycle>` class alongside `status-pill`.
- links -> cyan; post tag badges -> pink; telescope count -> yellow;
  provenance keeps its existing scheme.
- `.lolcat` utility: static rainbow gradient text via `background-clip: text`.
  Used sparingly (MOTD banner, one easter egg).

## 3. Reader: lazyvim experience

- **Shiki at build time** (devDependency; the single deterministic build stays
  the only build; nothing ships to the browser). `createHighlighter` once in
  build-content.js (dynamic `import()` from CommonJS), sync `codeToHtml` per
  fence via a marked renderer override in render.js. Custom textmate theme
  built from the palette: violet keywords, cyan functions, green strings,
  orange numbers, pink accents, muted italic comments.
- **Sanitizer** allows `span[style]` restricted to `color` (shiki token
  styles) and the code-window `button`.
- **Code windows.** Each fence renders as
  `.code-window > .code-bar (lang name + copy button) + pre`. Copy button
  (`navigator.clipboard`, "copied!" feedback for ~1.5s) wired by one delegated
  listener in the shell chrome. The CSS-only `language-xxx` label hack in
  reader.css is removed.
- **Contrast**: reader body text brightened slightly; measure stays 68ch.

## 4. Comments: giscus

- `GISCUS` config object in `app/config.js` (repo, repoId, category,
  categoryId). Unconfigured (empty repo) -> no comments UI at all (no dead
  pane). Once configured, reader pages show a split: article left, comments
  aside right (stacked below on <1024px), giscus script lazy-loaded via
  IntersectionObserver, theme `transparent_dark`.
- Setup checklist (user): public repo, enable Discussions, install giscus
  app, paste IDs from giscus.app into config.js.

## 5. Draggable dividers (the herdr part)

New `app/resize.js` (~120 lines, no deps). Dividers are real grid tracks
(6px) with `[data-resize]` elements:

- sidebar | pane (vertical, `--side-w`, clamp 140-400px)
- pane | console (horizontal, `--console-h` scrollback height, clamp 80-60vh)
- telescope results | preview (vertical, `--tl-w`)
- article | comments (vertical, `--comments-w`)

Pointer events + `setPointerCapture` write CSS custom properties on the
grid container; sizes persist in localStorage (`rz:<name>`); restored on
boot. `role="separator"`, tabindex=0, arrow keys move 16px. Hover/drag
highlight violet. Hidden on mobile (<768px). Pure clamp helper unit-tested.
In-pane dividers re-attach on `pane:swapped`.

## 6. Fun layer

- **cwd-aware prompt**: pure `pathToCwd(pathname)` helper
  (`/` -> `~`, `/posts.html` -> `~/posts`, `/posts/x.html` -> `~/posts/x`).
  Prompt label becomes `lucas@devops:<cwd> ❯` (host part hidden on narrow
  screens); statusline gets a path segment. Updates on `pane:swapped`.
- **Click echo**: sidebar nav clicks print the equivalent command
  (`> cd projects`) into the scrollback before the pane swaps; telescope
  opens echo `open <slug>`.
- **Easter eggs** in `parseCommand` (kept out of `help` - discovery is the
  point): `sudo` (not in sudoers), `sudo hire lucas` (rainbow "permission
  granted."), `neofetch` (about), `fortune`, `uptime`, `coffee`, `rm -rf /`
  (read-only S3 joke), `man lucas`, `uname -a`. Jokes only - no fake
  professional metrics.
- **lolcat WELCOME**: MOTD ASCII banner gets `.lolcat` gradient, applied at
  typing completion (and in the skip/reduced-motion path).

## Testing

- Unit: pathToCwd, easter-egg parseCommand cases, resize clamp, render
  emits shiki token spans + code-window chrome.
- E2E (behavior, not presence): dragging a divider changes pane width; copy
  button puts code text on the clipboard; `read %` shows the space; typed
  text keeps the block cursor adjacent.
- Phases land green in order, one commit each:
  quick fixes -> colors -> reader/shiki -> comments -> dividers -> fun layer.
