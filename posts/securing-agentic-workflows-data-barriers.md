---
title: "Securing Agentic Workflows: Building Data Barriers for Claude Code Sessions"
author: "Lucas Luize"
excerpt: "An AI agent tried to read my shell config during a security brainstorm. The file only had test tokens, but the pattern was clear: agents read whatever they can access. Here is the 4-layer defense I built."
date: "2026-04-10"
slug: "securing-agentic-workflows-data-barriers"
banner: ""
tags: ["Security", "Claude Code", "DevOps", "AI", "Automation"]
---

# Securing Agentic Workflows: Building Data Barriers for Claude Code Sessions

I told an AI agent to help me brainstorm security barriers for sensitive data. Its first action was to read `~/.zshrc` — the file where my shell config lives alongside a few dynamic test tokens for a Twitter CLI I was building.

I caught it mid-read and stopped the session. The tokens in that file were short-lived and low-risk. But the pattern was not. If this were a machine with production AWS credentials, database passwords, or API keys with billing access, that same agent behavior would have sent all of it through the LLM context window without hesitation.

**TL;DR:** I built a 4-layer defense — secrets isolation, file deny lists, command blocks, and a manual push boundary — to prevent Claude Code from accessing sensitive data through file reads, env var dumps, or command output. The approach follows the same defense-in-depth pattern you would use for any cloud infrastructure security setup.

## The Incident

I was building a multi-agent blog content pipeline (an engagement-specialist skill with Writer, Critic, and Deployer agents). During that session, I raised the need for security barriers around my data. The orchestrating agent's response was to dispatch a sub-agent to "audit security" by reading my shell config.

I had just expressed concern about data flowing to the LLM, and the agent's first move was to open the file I was worried about. In my case, it contained a few dynamic test tokens for a Twitter CLI I was building — low risk. But the behavior was the point. On a machine with production AWS credentials, database passwords, or API keys with billing access, that same agent would have done the same thing without hesitation.

I stopped it. Then I built the walls — not because my test tokens were valuable, but because the pattern needed fixing before the stakes got higher.

## Goal

Prevent Claude Code from accessing sensitive data through three vectors:

1. **File reads** — directly reading secret-containing files
2. **Env var dumps** — running `env`, `printenv`, or `export -p` to list loaded variables
3. **Command output** — running `echo $GH_AUTH_TOKEN` or similar to extract specific values

The constraint: none of this can break the development workflow. The shell still needs every env var loaded. Claude still needs to read project files, run tests, and edit code.

## Implementation: 4 Layers

### Layer 1: Secrets Isolation

The root problem was structural. All my secret exports lived in `~/.zshrc` alongside aliases, path config, and shell options. Blocking Claude from reading `.zshrc` would also block it from understanding my shell setup — and there was no way to protect just the sensitive lines.

The fix: move all secret exports into a dedicated file.

```bash
# ~/.secrets — contains ONLY sensitive exports
# Right now these are test tokens, but the structure
# scales to production credentials without changes
export GH_AUTH_TOKEN="ghp_..."
export TWITTER_AUTH_TOKEN="..."
export AWS_SECRET_ACCESS_KEY="..."
```

```bash
# ~/.zshrc — source secrets, keep everything else
source ~/.secrets

# aliases, path, options, etc. (safe to read)
alias ll='ls -la'
export PATH="$HOME/.local/bin:$PATH"
```

The shell works the same. Every env var loads. But now the actual values live in a single file that can be blocked without side effects.

### Layer 2: File Deny List

Claude Code's `settings.json` supports explicit deny patterns for file access:

```json
{
  "permissions": {
    "deny": [
      "Read(~/.secrets)",
      "Read(~/.zshrc)",
      "Read(~/.zshrc.local)",
      "Read(~/.ssh/*)",
      "Read(~/.env)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/.env.local)",
      "Read(**/credentials*)",
      "Read(**/secrets*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

This blocks the direct read vector. Claude cannot open these files.

But file blocks alone are not enough. If an env var is already loaded in the shell, Claude can still extract it through commands.

### Layer 3: Command Blocks

Same `settings.json`, same deny list — targeting bash commands that dump environment variables:

```json
{
  "permissions": {
    "deny": [
      "Bash(env)",
      "Bash(printenv)",
      "Bash(set)",
      "Bash(export -p)",
      "Bash(echo $GH_AUTH_TOKEN*)",
      "Bash(echo $TWITTER_*)",
      "Bash(echo $SSH_*)",
      "Bash(echo $AWS_*)",
      "Bash(cat ~/.secrets*)",
      "Bash(cat ~/.zshrc*)"
    ]
  }
}
```

This blocks the env dump and command output vectors. Claude cannot list all variables, and it cannot echo specific sensitive ones by name.

### Layer 4: Manual Push Boundary

The blog deployment pipeline I was building has a Deployer agent that commits changes and pushes to the remote. My SSH key requires a passphrase. Storing that passphrase anywhere Claude can access creates another exposure vector — back to the same problem.

The solution: the Deployer agent commits but stops before push. I run `git push` manually.

```
Agent: commits files, updates index, runs tests
Human: reviews the commit, runs git push, enters SSH passphrase
```

The agent prepares the work. The human handles authentication. No secrets need to be stored, shared, or exposed.

## Why One Layer Is Not Enough

Each layer has blind spots:

- **File blocks alone**: Claude can still run `echo $GH_AUTH_TOKEN` because the variable is loaded in the shell.
- **Command blocks alone**: Claude can still `cat ~/.secrets` to read the raw file.
- **Secrets isolation alone**: Claude can still read the secrets file if it is not on the deny list.
- **Manual push alone**: Prevents push-time exposure but does nothing about session-time reads.

Stack them and the gaps close. Defense in depth — the same principle behind security groups, NACLs, and IAM policies in AWS. No single layer is the perimeter. Every layer assumes the others will fail.

## The Pattern Behind It

After building this, I realized I was applying infrastructure security principles to my local development environment:

- **Least privilege**: deny by default, allow explicitly
- **Defense in depth**: file blocks + command blocks + workflow boundaries
- **Separation of concerns**: secrets file separate from config file
- **Trust boundaries**: agent prepares, human authenticates

The threat model is different — data exposure to an LLM, not a network attacker — but the mitigation patterns are the same ones I use for cloud infrastructure. Restrict access. Layer controls. Keep authentication at the boundary.

## What I Would Do Differently

The deny patterns in `settings.json` are powerful but brittle. They match on exact strings, which means a creative command like `cat ~/."s""e""c""r""e""t""s"` might bypass them. I have not tested every edge case, and I suspect some exist.

A stronger approach would be OS-level file permissions — making `~/.secrets` readable only by the user and not by any subprocess Claude spawns. That is a future improvement. For now, the 4-layer setup catches the obvious vectors, and the manual push boundary acts as the final stop.

## Takeaways

AI agents read whatever they can access. They do not distinguish between a Terraform module and your SSH private key. If you use AI coding assistants with real credentials on your machine, you need to think about this.

Three things you can do today:

1. **Move secrets out of `.zshrc`.** Put them in a dedicated file and source it. This takes five minutes and gives you a clean target for deny rules.
2. **Add deny patterns to your AI tool's config.** Claude Code uses `settings.json`. Other tools have similar mechanisms. Block the files and commands that expose sensitive data.
3. **Keep authentication manual.** If a workflow requires credentials, make that step human-operated. The agent does the work. You hold the keys.

The same instinct that makes you rotate API keys and scope IAM roles should apply to your AI tools. They run with whatever access your terminal has. How are you locking down yours?
