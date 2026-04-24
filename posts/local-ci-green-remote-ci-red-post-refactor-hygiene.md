---
title: "Local CI Green, Remote CI Red: Post-Refactor Hygiene Lessons"
author: "Lucas Luize"
excerpt: "Local make ci passed with 212 tests and 92% coverage. GitHub Actions went red in two minutes. Three independent config drifts, one commit to fix them, and the grep-level checklist I now run before every push."
date: "2026-04-23"
slug: "local-ci-green-remote-ci-red-post-refactor-hygiene"
banner: ""
tags: ["CI/CD", "GitHub Actions", "Python", "DevOps", "Refactoring", "pyproject.toml"]
---

# Local CI Green, Remote CI Red: Post-Refactor Hygiene Lessons

```
ModuleNotFoundError: No module named 'canastra'
```

Eight collection errors. Zero tests run. That was GitHub Actions, two minutes after I pushed a branch where `make ci` had printed `212 passed  92.05% coverage` on my laptop.

This post is about the three independent hygiene problems that caused the gap, and the grep-level checklist I now run before every refactor that deletes files.

## TL;DR

- Local `make ci` and `.github/workflows/ci.yml` drift independently. Mine still pinned the deleted files by name.
- A root-level `conftest.py` `sys.path` shim was hiding the fact that my package was never installed. Fresh CI runners have no shim.
- `pyproject.toml` holds several independent lists of your files. Deleting files means auditing every list.

## The Two Error Messages

The first job that went red was mypy:

```
mypy: error: cannot read file 'deck.py': No such file or directory
Error: Process completed with exit code 2.
```

The second was pytest, on both Python 3.11 and 3.12. Eight collection errors, each one the same:

```
ModuleNotFoundError: No module named 'canastra'
```

Zero tests ran. Not a single assertion evaluated. The package itself could not be imported on the runner.

Locally, the same commit had 212 tests passing and mypy clean. That gap between local and remote is the whole story.

## Why Local Was Lying

The refactor had moved the code from a flat layout (five modules at the repo root) into a `canastra/` package with subpackages. Locally, that migration had worked for weeks. Three reasons it kept working for me, none of them portable to a fresh runner.

### 1. Stale mypy target in the workflow

I wrote the workflow file in an earlier phase, back when the package directory did not exist. The typecheck step looked like this:

```yaml
- name: Typecheck
  run: mypy deck.py player.py table.py helpers.py
```

Those files were gone. I had updated the Makefile to call `mypy canastra` weeks ago, but the GitHub Actions workflow was a separate file on a separate planet. Nothing ties them together. `make ci` was happy. The workflow was still chasing ghosts.

This is the first lesson and the one I keep re-learning: **the Makefile and the workflow drift independently unless one calls the other.** Two sources of truth for the same question ("how do we check this repo?") will diverge silently.

### 2. A `conftest.py` shim I did not realize I depended on

This is the one that actually taught me something.

For months, my root-level `conftest.py` contained this:

```python
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
```

That was Phase 0 scaffolding so the flat-layout modules could be imported in tests. When I moved to a package and deleted the shim, pytest on my laptop kept working anyway. The venv had accumulated enough state over months that `canastra` was resolvable through some leftover path juggling I never traced. The package was never installed in editable mode. Pytest was cheating, and I never noticed because I never ran in a clean environment.

A fresh GitHub Actions runner has no cache, no old venv, no shim. `pip install -r requirements.txt` runs, then `pytest` runs, then import fails. The runner tried to import `canastra` and found nothing, because nothing told it where to look. The package was not installed.

The fix was the one I had been avoiding: `pip install -e .` in both CI jobs.

```yaml
- name: Install package (editable)
  run: pip install -e .
```

The lesson: **if your tests pass locally and you never ran `pip install -e .`, you do not know whether your package layout is correct.** A `conftest.py` `sys.path` hack is a local-only crutch. The minute you run on a machine without it, you learn what was really holding the thing up.

### 3. `pyproject.toml` still listed the deleted modules

The third problem would have bitten me the next day even if the first two had been fine. My `pyproject.toml` had this:

```toml
[tool.setuptools]
py-modules = ["deck", "player", "table", "helpers", "main"]
packages = ["canastra", "canastra.domain", "canastra.engine"]
```

Once I added `pip install -e .` to CI, setuptools started complaining that it could not find `deck.py` to package. Of course — I had deleted it. And `canastra.cli`, new this phase, was missing from the `packages` list, so even a successful install would not have shipped it.

Fixed version:

```toml
[tool.setuptools]
packages = ["canastra", "canastra.domain", "canastra.engine", "canastra.cli"]
```

`py-modules` gone entirely. `canastra.cli` added.

## The Single Commit

All three fixes landed in one commit: `fix(ci): update workflow + setuptools config for post-Phase-3 layout`. The diff touched three files:

- `.github/workflows/ci.yml` — `mypy deck.py ...` became `mypy canastra`, `pip install -e .` added to the typecheck and test jobs, and a stale comment removed about "legacy dotted-filename test files"
- `pyproject.toml` — `py-modules` line deleted, `canastra.cli` added to `packages`
- No application code changed. Not one line.

I pushed. CI went green on the first try. Same 212 tests, same 92.05% coverage, this time running on a clean machine.

## The Hygiene Checklist I Now Run

This took me longer than it should have because I had three independent bugs stacked on top of each other, each hiding the next. Here is what I do before pushing any refactor that deletes files.

**1. Grep the deleted filenames across every config file.**

```bash
grep -rnE 'deck|player|table|helpers|main' \
  pyproject.toml Makefile .github/ .pre-commit-config.yaml
```

If a deleted module's name appears anywhere outside a current import, it is a stale reference. This takes under a minute and catches most of this class of bug. For a tighter match when module names collide with common words, use `-w` or grep for the exact filename (`deck\.py`).

**2. Verify the workflow matches the Makefile.**

If `make ci` does X and the workflow does Y, pick one source of truth. The cleanest version is a workflow that calls `make ci`:

```yaml
- name: Run CI checks
  run: make ci
```

The Makefile becomes the only place that knows what "CI" means. I have not done this on this repo yet — that is the next cleanup.

**3. Run `pip install -e .` in a clean venv locally.**

Before pushing, blow away the venv and recreate it:

```bash
deactivate
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -e . -r requirements.txt -r requirements-dev.txt
pytest
```

If tests pass here, your package layout is correct. If they fail, you were relying on something CI does not have.

**4. Delete root-level `conftest.py` shims as part of any layout cleanup.**

A `sys.path`-manipulating `conftest.py` at the repo root is a signal that your package is not installed properly. It is a bootstrap crutch, not a permanent fixture. Delete the shim the moment you move to a real package layout — and the failure that follows will force you to do the install correctly.

**5. Audit every file-list in `pyproject.toml`.**

Your `pyproject.toml` probably has more than one list of your code files. Mine does:

- `[tool.setuptools] py-modules`
- `[tool.setuptools] packages`
- `[tool.coverage.run] source` and `omit`
- `[tool.ruff] extend-exclude`
- `[tool.mypy] module` overrides

Each list is independent. Deleting a file means checking every one. No tool does this for you.

## What I Take Away

Local green and remote green are different claims. Local green says "this works on a machine I have been using for weeks, with caches and shims and a venv full of accumulated state." Remote green says "this works on a machine that did not exist thirty seconds ago."

The second claim is the one that matters. The first one is comfort food.

The fix was twelve lines of YAML and TOML. The lesson was that my local environment had been quietly lying to me for months, and I only found out because a phase of deletes forced the question.

If you run the grep in step 1 against your own repo right now, what does it find? That is the real test — not whether you have a checklist, but whether your repo is already clean.
