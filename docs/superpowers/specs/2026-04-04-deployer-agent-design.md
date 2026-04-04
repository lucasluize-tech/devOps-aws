# Deployer Agent — Design Spec

## Context

Phase 2 of the engagement-specialist skill. The Writer and Critic agents produce an approved blog post saved to `posts/` with `index.json` updated and `npm test` passing. The Deployer picks up from there: commits, pushes, waits for CI, generates social media content with images, and posts to X and LinkedIn.

The goal: go from "approved blog post on disk" to "live on the blog + promoted on social media" with zero manual steps.

## Architecture

Add `agents/deployer.md` to the existing engagement-specialist skill. Update `SKILL.md` orchestrator to chain the Deployer after the save step.

```
~/.claude/skills/engagement-specialist/
├── SKILL.md                          ← updated: add Deployer dispatch after save
├── agents/
│   ├── writer.md
│   ├── critic.md
│   └── deployer.md                   ← NEW
└── reference/
    ├── voice-profile.md
    └── engagement-playbook.md
```

## Pipeline Flow

```
Post approved + saved to posts/ + npm test passes
    │
    1. Git commit
    │   ├── Stage: posts/{slug}.md + posts/index.json
    │   └── Commit message: "new blog post: {title}"
    │
    2. Git push to origin master
    │
    3. Wait for CI green
    │   ├── Use: gh run watch (polls GitHub Actions)
    │   └── Fail-safe: timeout after 10 minutes, report failure
    │
    4. Generate social image via Canva MCP
    │   ├── Create a branded card with post title + tags
    │   ├── Export as PNG
    │   └── Save locally for attachment to social posts
    │
    5. Generate social media hooks
    │   ├── Read the blog post for key insights
    │   ├── X: single tweet (hook text + blog link + image)
    │   │   └── Hook formula: "{Achieve outcome} without {pain point}" or
    │   │       "{Question highlighting main pain point}"
    │   │   └── Max ~220 chars (leave room for link + image)
    │   ├── LinkedIn: post body (hook/story, 1200-1500 chars) + separate comment (blog link)
    │   │   └── First line is the hook (visible before "see more")
    │   │   └── Body: personal story format with line breaks
    │   │   └── No link in post body (reach penalty)
    │   └── Blog URL format: https://devops.lucasluize.com/post.html?slug={slug}
    │
    6. Critic reviews social content
    │   ├── Verify: hook present, image attached, link correct
    │   ├── Apply voice-profile rules (no buzzwords, no passive voice, no exclamation points)
    │   ├── Apply engagement-playbook principles
    │   └── Fix any issues directly (same as blog post critic flow)
    │
    7. Post to X
    │   ├── Command: twitter post "{hook text} {blog_url}" --image {image_path}
    │   └── Capture tweet URL from output (--json flag)
    │
    8. Post to LinkedIn (if CLI available)
    │   ├── Post the body text
    │   ├── Comment with the blog link on the post
    │   ├── If LinkedIn CLI not available: skip gracefully, report that LinkedIn post needs manual action
    │   └── Capture post URL from output
    │
    9. Report results
    │   ├── Blog live at: https://devops.lucasluize.com/post.html?slug={slug}
    │   ├── X post URL
    │   ├── LinkedIn post URL (or "skipped: CLI not available")
    │   └── CI status: passed/failed
```

## Files to Create/Modify

### 1. NEW: `agents/deployer.md`

The Deployer sub-agent. Receives:
- The approved post content (markdown with front-matter)
- The slug (for URL construction and git commit)

Responsibilities:
- Git commit + push
- Wait for CI with `gh run watch`
- Generate Canva image via MCP
- Generate social hooks (X tweet + LinkedIn post)
- Dispatch to Critic for social content review
- Post via CLI tools
- Report results

### 2. MODIFY: `SKILL.md`

Add Step 6 to the orchestrator pipeline (after current Step 5 save/test):

```
6. Dispatch Deployer agent
   ├── Pass: approved post content + slug
   ├── Deployer handles: commit, push, CI wait, image, social, post
   └── Report results back to user
```

## Social Content Specifications

### X (Twitter)

**Format:** Single tweet
**Structure:**
```
{hook text}

{blog_url}
```
**Constraints:**
- Hook: max ~220 characters (Twitter's 280 minus URL length ~25 chars minus buffer)
- Image: attached via `--image` flag
- No hashtags (they look spammy in dev community)
- Authentic dev voice, not marketing copy

**Hook formulas:**
- "{Achieve outcome} without {pain point}"
- "{Question highlighting main pain point}"
- "I thought {X}, but actually {Y}"
- "{Surprising metric or result}"

**CLI command:**
```bash
twitter post "{hook_text}

https://devops.lucasluize.com/post.html?slug={slug}" --image {image_path} --json
```

### LinkedIn

**Format:** Post body + comment with link
**Structure (post body):**
```
{First line hook — visible before "see more"}

{2-3 short paragraphs telling the story}

{Key takeaway or insight}

{Authentic closing question}
```
**Structure (comment):**
```
Full post: https://devops.lucasluize.com/post.html?slug={slug}
```
**Constraints:**
- Body: 1200-1500 characters
- No external links in body (reach penalty)
- Use line breaks for readability
- First-person, personal story format
- No generic CTAs

**CLI:** LinkedIn CLI in progress. Agent should attempt to use it, skip gracefully if unavailable, and report what needs manual posting.

## Image Generation (Canva MCP)

Use the connected Canva MCP to generate a branded social card:
- Post title as headline text
- Tags as secondary text or visual elements
- Consistent with Lucas's brand palette (warm violet + orange)
- Export as PNG for attachment to social posts
- Save locally to a temp path for the `twitter post --image` command

If Canva MCP fails: skip image, post text-only, report that image generation failed.

## CI Verification

**Command:** `gh run watch` (watches the most recent workflow run)
**Timeout:** 10 minutes
**On success:** Proceed to social posting
**On failure:** Report CI failure with link to the failed run. Do not post to social media.

## Error Handling

| Failure | Action |
|---|---|
| Git push fails | Report error, suggest manual resolution |
| CI fails | Report with run URL, do not post social |
| CI timeout (>10min) | Report timeout, provide `gh run view` command |
| Canva MCP fails | Skip image, post text-only |
| `twitter` CLI fails | Report error, show the command that failed |
| LinkedIn CLI not found | Skip LinkedIn, report manual posting needed |
| Critic rejects social content | Re-generate hooks, re-submit to critic (max 2 retries) |

## Verification

After implementation:
1. Save a test post via the engagement-specialist pipeline
2. Verify git commit includes only `posts/{slug}.md` and `posts/index.json`
3. Verify git push triggers GitHub Actions
4. Verify `gh run watch` correctly waits for CI
5. Verify Canva MCP generates an image
6. Verify social hooks follow voice-profile and engagement-playbook rules
7. Verify `twitter post` command executes with correct format
8. Verify LinkedIn post (when CLI available) follows link-in-comments pattern
9. Verify final report includes all URLs and statuses
