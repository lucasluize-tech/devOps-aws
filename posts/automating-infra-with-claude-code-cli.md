---
title: "Automating Infra with Claude Code CLI"
author: "Lucas Luize"
excerpt: "How I use Claude Code CLI with agents, skills, and context management to build cloud infrastructure faster while keeping production quality high and stakes low."
date: "2026-03-20"
slug: "automating-infra-with-claude-code-cli"
banner: "https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=1470&auto=format&fit=crop"
tags: ["DevOps", "AI", "Claude Code", "Automation", "Infrastructure", "AWS"]
---

# Automating Infra with Claude Code CLI

I have been using Claude Code CLI as part of my daily workflow for a few weeks now. Not as a toy, not as a shortcut, but as a real engineering tool. This post covers what I have learned, what works, what does not, and what it means for someone building a career in DevOps while AI tooling evolves under our feet.

## Why Claude Code CLI

I was already using AI for code suggestions, but Claude Code is different. It is a CLI agent that can read your codebase, run commands, edit files, and execute multi-step tasks. It operates inside your terminal, inside your repo, with your context.

For infrastructure work, that matters. You are not copying and pasting Terraform snippets from a chat window. The agent sees your modules, your state structure, your CI config. It can propose changes that actually fit.

## How I Use It

### Agents and Skills

Claude Code supports specialized agents and skills. I use agents to parallelize research (exploring a codebase, searching for patterns across multiple directories) and skills for repeatable tasks (auditing CLAUDE.md files, running design reviews, committing with conventions).

The key insight: **agents are subprocesses with their own context windows.** That means I can delegate expensive exploration to an agent without polluting my main conversation. This keeps the primary context lean and focused on the task at hand.

### Context Window Management

This was the biggest lesson. The context window is a finite resource, and if you treat it carelessly, the agent loses track of what matters.

What I do:
- Keep CLAUDE.md files at project roots with structure, conventions, and verification steps so the agent does not need to rediscover them every session
- Use plan mode for non-trivial changes to align on approach before writing code
- Let agents handle broad searches so the main context stays focused on decisions and implementation
- Save persistent knowledge to memory files so future sessions start with relevant context

### Low Stakes, High Quality

I deliberately work in a low-stakes environment (a personal portfolio, a blog, dotfiles) but hold the code to production standards. Tests must pass. CI must be green. Selectors and contracts must be preserved.

This is intentional. Learning with AI tools in a low-risk codebase means I can experiment freely, make mistakes cheaply, and build muscle memory for patterns that transfer to real production environments.

## Trade-offs and Honest Assessment

### What Works Well

- **Speed on boilerplate**: generating CI workflows, writing tests, scaffolding Terraform modules. Tasks that are well-defined and pattern-heavy are where AI shines.
- **Exploration**: asking the agent to find how something works across a codebase is genuinely faster than grep and manual reading when the scope is broad.
- **Refactoring with constraints**: "change the design but preserve these selectors" is exactly the kind of bounded task that AI handles well because the success criteria are clear.

### What Does Not Work Well

- **Novel architecture decisions**: the agent can propose, but it cannot reason about your team, your budget, your compliance requirements, or your on-call rotation. Those are human calls.
- **Blind trust**: if you accept every suggestion without reading the diff, you will ship bugs. AI-generated code still needs review, especially around security boundaries, error handling, and edge cases.
- **Context drift**: long conversations degrade quality. The agent starts repeating itself or losing track of earlier decisions. Restarting fresh with a good CLAUDE.md is often better than pushing through.

### The Uncomfortable Question

If AI can write Terraform, build CI pipelines, and refactor JavaScript, what is left for a junior DevOps engineer?

My honest answer: **the judgment layer.** AI accelerates execution, but someone still needs to decide what to build, why, and how to validate it. Someone still needs to understand blast radius, rollback strategy, and compliance. Someone still needs to own the system when it pages at 3am.

AI makes the "what" faster. It does not replace the "why" or the "so what."

## What the Future Looks Like

I think the DevOps engineers who thrive will be the ones who treat AI as a force multiplier, not a replacement. The skill set shifts:

- **From memorizing syntax to evaluating output.** Knowing Terraform HCL by heart matters less than knowing whether a proposed module is secure, cost-effective, and maintainable.
- **From writing everything to reviewing everything.** Code review becomes an even more critical skill when half the code is AI-generated.
- **From solo heroics to orchestration.** Managing agents, defining constraints, and designing verification pipelines is its own discipline.

For someone early in their career like me, the opportunity is clear: learn the fundamentals deeply (networking, Linux, security, distributed systems) and layer AI tooling on top. The fundamentals are what let you evaluate whether the AI is right. Without them, you are just a prompt writer hoping for the best.

## Closing

Claude Code CLI has genuinely changed how I work. I ship faster, I explore codebases more confidently, and I spend less time on mechanical tasks. But the tool is only as good as the engineer directing it.

The goal is not to automate myself out of a job. The goal is to automate the boring parts so I can focus on the hard parts: reliability, security, and making systems that teams can trust.

That is where the career is. AI just helps me get there faster.
