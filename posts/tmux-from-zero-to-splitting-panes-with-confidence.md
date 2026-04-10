---
title: "Tmux from Zero to Splitting Panes with Confidence"
author: "Lucas Luize"
excerpt: "How I went from separate terminal windows to tmux sessions with split panes, vi-mode copy, clipboard integration, and a branded status bar -- all in one learning session."
date: "2026-04-09"
slug: "tmux-from-zero-to-splitting-panes-with-confidence"
banner: ""
tags: ["DevOps", "Automation", "Linux", "CLI"]
---

# Tmux from Zero to Splitting Panes with Confidence

I pressed `v` in tmux copy mode and nothing happened. Vi mode was on. Visual selection should have worked. It did not. That single missing keybinding cost me 30 minutes and taught me that tmux's "vi mode" is not vi until you make it vi.

**TL;DR:** I went from zero tmux knowledge to a working setup with split panes, vi-mode copy between panes, system clipboard integration, and a styled status bar -- in one session. This post covers the mental model, the friction points, and the final config.

## The Problem

I work in the terminal every day. Claude Code in one window, LazyVim in another, servers in a third. Separate terminal tabs, no persistent sessions, no way to keep processes alive after a disconnect. For someone building a DevOps career, that is a gap.

The surface-level issue was too many terminal windows. The deeper issue was operational. If I SSH into a server and my connection drops, everything I was running dies. Tmux solves that. Sessions persist. Panes split. Processes survive disconnects.

For local development, it means running Claude Code in one pane, editing in LazyVim in another, and tailing logs in a third -- all inside one terminal window, all switchable with a keystroke.

## The Mental Model That Makes Everything Click

Tmux has three layers: **Session, Window, Pane.**

- A **session** is a named workspace that persists until you kill it
- A **window** is a full-screen tab inside a session
- A **pane** is a split inside a window

Every tmux command starts with the prefix key: `Ctrl+b`. Press it, release, then press the action key. Once that pattern clicks, the whole tool opens up.

Core splits:

```bash
Ctrl+b %    # split vertically (left/right)
Ctrl+b "    # split horizontally (top/bottom)
```

Navigate between panes with `Ctrl+b` + arrow keys. That is enough to start working.

## Window Management

Windows act like tabs:

```bash
Ctrl+b c    # new window
Ctrl+b n    # next window
Ctrl+b p    # previous window
Ctrl+b 2    # jump to window 2
Ctrl+b l    # toggle last window
Ctrl+b ;    # toggle last pane
```

The `l` and `;` toggles are underrated. When you are bouncing between two contexts -- code and output, editor and terminal -- they eliminate the mental overhead of thinking about which direction to navigate.

## The Scroll Problem

First real friction point. I had Claude Code running in one pane, output longer than the screen, and scrolling did not work. Mouse wheel, Page Up -- nothing.

Tmux captures the terminal. Normal scroll is gone. The solution is **copy mode**:

```bash
Ctrl+b [    # enter copy mode
```

Now Page Up, Page Down, and arrow keys work. Press `q` to exit. Simple once you know it exists, invisible if you do not.

## Copy-Paste Between Panes

This is where the session got real. I needed to copy output from Claude Code in one pane and paste it into LazyVim in another.

The default copy mode uses emacs keybindings. `Ctrl+Space` to start selection, `Alt+w` to copy. For a vim user, that is a non-starter.

### Switching to Vi Mode

```bash
tmux set -g mode-keys vi
```

Copy mode now uses vi-style navigation. But here is where I lost time: pressing `v` to start a visual selection did nothing. `Shift+V` worked for line selection, but character-level `v` was unbound by default.

The fix required explicit key bindings:

```bash
tmux bind-key -T copy-mode-vi v send -X begin-selection
tmux bind-key -T copy-mode-vi y send -X copy-pipe-and-cancel "xclip -selection clipboard"
```

The workflow after this:
1. `Ctrl+b [` to enter copy mode
2. Navigate to the text
3. `v` to start selection
4. Move to highlight what you need
5. `y` to yank -- copies to system clipboard
6. Switch panes, paste normally

### The Clipboard Gap

Without the `copy-pipe-and-cancel` binding, `y` copies to tmux's internal buffer only. That buffer does not reach the system clipboard. On Linux/WSL, you need `xclip`:

```bash
sudo apt install xclip
```

Without it, you are copying into a buffer you cannot paste from outside tmux. Small detail, big frustration if you miss it.

## Styling the Status Bar

The default tmux status bar is a green strip at the bottom. Functional, generic. I wanted it to match my terminal aesthetic -- the same violet and orange palette from my portfolio site.

```bash
# Status bar position
set -g status-position top

# Status bar colors -- violet background, dark text
set -g status-style "bg=#a78bfa,fg=#1a1a2e"

# Active window tab -- orange to distinguish it
set -g window-status-current-style "bg=#f97316,fg=#1a1a2e,bold"

# Pane borders -- violet inactive, orange active
set -g pane-border-style "fg=#a78bfa"
set -g pane-active-border-style "fg=#f97316"

# Left: session name | Right: date and time
set -g status-left " #S "
set -g status-right " %Y-%m-%d %H:%M "
```

When your terminal is branded and consistent, it feels like your workspace, not a default install. Recruiters see your screen during interviews. Colleagues see it during pairing. The signal is: this person cares about their environment.

## The Window Numbering Fix

By default, tmux starts window numbering at 0. That means your first window is `Ctrl+b 0` -- reaching across the keyboard for the most-used window.

```bash
set -g base-index 1
set -g pane-base-index 1
```

One catch: this only applies to new sessions. Existing windows keep their old numbers. I had to manually move the window:

```bash
tmux move-window -s 0 -t 1
```

The kind of thing that trips you up if you expect the config to retroactively fix everything.

## The Zoom Trick

`Ctrl+b z` toggles a pane to full screen and back. When you are in a split layout and need to read long output, zoom in, read it, zoom out. One keystroke each way. No resizing, no rearranging.

## The Final Config

The complete `~/.tmux.conf`:

```bash
# Vi mode for copy
set -g mode-keys vi

# Vi-style selection and yank to system clipboard
bind-key -T copy-mode-vi v send -X begin-selection
bind-key -T copy-mode-vi y send -X copy-pipe-and-cancel "xclip -selection clipboard"

# 1-based indexing
set -g base-index 1
set -g pane-base-index 1

# Status bar at top
set -g status-position top

# Brand colors
set -g status-style "bg=#a78bfa,fg=#1a1a2e"
set -g window-status-current-style "bg=#f97316,fg=#1a1a2e,bold"
set -g pane-border-style "fg=#a78bfa"
set -g pane-active-border-style "fg=#f97316"

# Status content
set -g status-left " #S "
set -g status-right " %Y-%m-%d %H:%M "
```

After saving, reload with `tmux source-file ~/.tmux.conf` -- no restart needed.

## What I Learned

**The mental model is everything.** Session, Window, Pane. Once that hierarchy is clear, every command is prefix plus one key. No memorization -- pattern recognition.

**Vi mode in copy mode is non-negotiable if you use Neovim.** The default emacs bindings are friction. Switching to vi mode and binding `v`/`y` took minutes but saved the whole workflow.

**Clipboard integration is not automatic on Linux.** Tmux copies to its own buffer by default. Getting text to the system clipboard requires `xclip` and explicit `copy-pipe` bindings. The kind of setup cost that documentation buries in footnotes.

**The zoom toggle (`Ctrl+b z`) and the last-pane toggle (`Ctrl+b ;`) are workflow multipliers.** They turn split panes from a layout choice into a navigation system.

Tmux took one focused session to learn. The gap between "I should learn this" and "I use this daily" was smaller than I expected. If you work in the terminal and you are still managing separate windows, the return on a single afternoon of setup is weeks of faster context switching.

What does your tmux config look like -- and what took you the longest to figure out?
