---
title: "Building an AI Agent That Writes My Blog Posts"
author: "Lucas Luize"
excerpt: "I built a multi-agent content pipeline inside Claude Code that reads session context, writes posts in my voice, runs them through a critic, and saves to my blog. This post is the first thing it produced."
date: "2026-04-04"
slug: "building-engagement-specialist-agent-pipeline"
banner: ""
tags: ["AI", "Claude Code", "Automation", "DevOps", "Infrastructure"]
---

# Building an AI Agent That Writes My Blog Posts

I have 6 completed projects and 0 blog posts about them. The work lives in git history and memory files. The blog stays stale. The gap between what I build and what recruiters can see keeps growing because I do not write.

So I built an agent to do the writing for me. This post is the first thing it produced.

## TL;DR

I created a Claude Code skill called `engagement-specialist` — a 5-file multi-agent pipeline that reads my session context (memory files, git history, code changes), generates a blog post in my voice, runs it through a critic agent, and saves the result to my blog with index updates and test verification.

## The Problem

I complete work in Claude Code sessions regularly. Terraform modules, CI/CD pipelines, test harnesses, debugging sessions — all documented in memory files and git history, none of it making it to the blog.

The bottleneck is not ideas. It is the act of writing. Sitting down, structuring a post, staring at a blank editor, convincing myself the prose is good enough. That loop kills momentum every time.

I needed something that could take what I already produced — commit messages, memory files, code diffs — and turn it into a publish-ready post without me writing a single paragraph.

## The Goal

A single Claude Code skill invocation that:

1. Gathers context from my session (memory + git + code changes)
2. Writes a draft that sounds like I wrote it
3. Runs that draft through a quality critic
4. Presents the final version for my approval
5. Saves to `posts/`, updates `index.json`, runs `npm test`

No manual writing. No copy-paste workflows. One command, one approval, one published post.

## Architecture: One Skill, Three Agents

I considered three separate skills (writer, critic, publisher) but chose a single skill with sub-agents instead.

- **Single entry point.** One invocation starts the full pipeline. No remembering which skill to call or in what order.
- **Shared context.** The orchestrator gathers context once and passes it down. Separate skills would each need to rediscover the project state.
- **Pipeline control.** The orchestrator manages the Writer, Critic, Approval, Save flow. Separate skills would need external coordination.

This mirrors how I think about infrastructure design: separation of concerns inside a cohesive boundary. The writer, critic, and orchestrator each have a single responsibility, but they share an interface.

## The 5 Files

```
~/.claude/skills/engagement-specialist/
├── SKILL.md                          # Orchestrator
├── agents/
│   ├── writer.md                     # Writes the draft
│   └── critic.md                     # Enforces style, tightens prose
└── reference/
    ├── voice-profile.md              # Writing DNA + hard rules
    └── engagement-playbook.md        # Engagement principles for dev audiences
```

### SKILL.md — The Orchestrator

Coordinates the full pipeline: gather context from memory files and git, dispatch the writer agent, dispatch the critic agent, present the final draft, handle approval, write files, run tests. This is the only file the user interacts with.

### writer.md — The Writer

Reads my voice profile, reads 2-3 existing posts for calibration, then generates a draft following a specific arc: Hook, TL;DR, Problem, Goal, Implementation, Tests, Takeaways. It decides post length based on topic complexity.

The calibration step matters. Without it, the writer produces generic tech content. With it, the output picks up patterns from my existing posts — sentence rhythm, section structure, how I handle trade-offs. I tested this by running the writer with and without the calibration step on the same topic. The difference was obvious: one read like a Medium template, the other read like something from this blog.

### critic.md — The Critic

Takes the writer's draft and edits it against hard style rules: no passive voice, no exclamation points, no "very/really/almost", no buzzwords without substance. It evaluates hook strength, narrative arc, technical depth, authenticity, and scannability. Then it rewrites what is weak instead of just flagging it.

### voice-profile.md — Writing DNA

This file makes the biggest difference. It captures how I write: first-person, honest about failures, technical but accessible, reflective about trade-offs. It includes a hard rules table:

| Rule | Do | Don't |
|---|---|---|
| Simple over complex | "Use", "help", "start" | "utilize", "facilitate", "commence" |
| Specific over vague | Name the tool, the error, the metric | "streamline", "optimize", "innovative" |
| Active over passive | "The pipeline runs tests" | "Tests are run by the pipeline" |
| Show over tell | "Deploy time dropped from 4m to 45s" | "Deployment became much faster" |

Without this file, the writer defaults to generic developer blog tone. With it, the output matches the patterns in my existing posts closely enough that I cannot always tell which sentences came from the agent and which came from calibration.

### engagement-playbook.md — Engagement Principles

Distilled from researching how dev content earns attention. Not marketing tricks — principles tuned for technical audiences. Lead with real artifacts (error messages, metrics, commands). Follow Problem, Attempt, Failure, Solution, Reflection. Use specific numbers. End with transferable lessons, not generic CTAs.

## The Decision That Changed Everything

Every design decision in this pipeline came from a structured brainstorming and grill-me interview process. The grill-me skill asks hard questions until there are no ambiguities left.

One question changed the entire agent's role: "Does the user actually want to write?"

The answer was no. I do not want to write. I want posts to exist. That distinction shifted the pipeline from "help Lucas write better" to "write the post from Lucas's context and get his approval." My job became review, not authorship.

Other decisions the interview surfaced:

- **Trigger:** Post-session invocation, not automatic. I want control over what gets published.
- **Context source:** Session memory + git history, not asking the user to describe what they built.
- **Voice:** Profile + calibration from existing posts, not a generic "write like a developer" prompt.
- **Approval flow:** Writer and Critic iterate silently, present only the final draft. I review once, not three times.
- **Post length:** Agent decides based on complexity. A quick fix gets 800 words. An architecture post gets 2000.

## Context Engineering > Prompt Engineering

The biggest lesson from building this pipeline: the quality of an agent's output depends on its reference data, not on a single clever prompt.

The writer agent's instructions are straightforward. What makes it produce good output is the voice profile, the engagement playbook, and the calibration step where it reads existing posts. Remove any of those reference files and the output degrades — generic phrasing, flat hooks, documentation-style prose.

I tried it. I removed the voice profile and ran the writer on the same topic. The draft opened with "In this post, I will walk you through..." and used "leverage" twice in the first three paragraphs. With the voice profile restored, the same topic opened with a specific problem statement and zero buzzwords.

This is context engineering. The skill is designing what the agent knows, not how you ask the question.

## Agent Design Follows Software Design

Building this pipeline reinforced something I suspected: agent architecture follows the same principles as good infrastructure design.

- **Separation of concerns.** The writer writes. The critic edits. The orchestrator coordinates. Each has a clear responsibility.
- **Clear interfaces.** Context brief goes in, markdown comes out. The orchestrator does not care how the writer structures its thinking.
- **Reference data separate from logic.** The voice profile and engagement playbook are data files, not embedded in agent instructions. Changing the voice does not require rewriting the writer.
- **Pipeline over monolith.** A single massive prompt that tries to write, critique, and format produces worse results than three focused agents chained together.

## Verification: This Post

This post is the first real invocation of the engagement specialist skill. The pipeline gathered context about its own creation, generated a draft, ran it through the critic, and presented it for approval.

If you are reading this on the blog, it passed `npm test`, the slug is registered in `index.json`, and the full pipeline executed end to end.

## What Is Next

Phase 2 adds a Deployer agent: git push, CloudFront invalidation trigger, and social media hooks for X and LinkedIn. The goal is to go from "I finished building something" to "there is a post about it on my blog and linked on social media" with one approval step.

## Takeaways

**Building agents for yourself is the fastest way to learn agent design.** Low stakes, fast iteration, real utility. You feel the quality differences immediately because you are the end user.

**The grill-me process surfaces decisions that would otherwise be implicit assumptions.** "Does the user want to write?" seems obvious in hindsight. It was not obvious until someone asked.

**Agent quality is a function of context, not prompts.** Voice profiles, engagement playbooks, calibration from existing work — these reference files do more for output quality than any amount of prompt tuning.

**Separation of concerns works at the agent level the same way it works at the infrastructure level.** Writer, critic, orchestrator. Each focused. Each replaceable. Each testable in isolation.

I spent years avoiding writing because I thought I was bad at it. The fix was not becoming a better writer — it was building a system that writes for me and letting me focus on what I am good at: the engineering.

How do you handle the gap between what you build and what you document?
