---
title: "todo-cli-tool"
slug: "todo-cli-tool"
category: "Dev Tools"
status: "published"
goal: "Project-aware TODO command-line tool, published to PyPI"
visibility: "public"
date: "2026-02-14"
github: "https://github.com/lucasluize-tech/todo-cli-tool"
demo: "https://pypi.org/project/todo-cli-tool/"
tech_stack:
  - "Python 3.11+"
  - "Typer"
  - "Rich"
  - "Pydantic v2"
  - "PyYAML"
  - "hatchling + uv"
  - "pytest"
  - "ruff"
  - "mypy (strict)"
  - "GitHub Actions"
screenshots: []
---

## Why

I wanted a TODO tool that picked the right list based on which project directory I was sitting in, without having to remember to switch contexts. Existing tools were either too heavy (full task managers) or too dumb (single global file). I also wanted an excuse to publish to PyPI properly with trusted publishing, signed releases, and a real CI matrix.

## Architecture

Single binary CLI built on Typer + Rich for output. State lives in YAML files keyed by the active project directory — detection is "walk up from CWD until you find a marker file or hit `$HOME`." Pydantic v2 schemas validate every read from disk so a hand-edited YAML file can't corrupt the tool.

Packaged with hatchling + uv. Distributed via PyPI with trusted publishing — the GitHub Actions release workflow is tag-triggered, no API tokens stored.

CI matrix runs lint (ruff), type check (mypy strict), and tests (pytest) across Python 3.11, 3.12, and 3.13.

## CIA

- **Confidentiality:** Local-only, no network calls, no telemetry.
- **Integrity:** Pydantic validation on every read. TDD on later features. 188 tests, 84% coverage.
- **Availability:** Distributed via PyPI with trusted publishing — releases reproduce from tags without manual intervention.

## Notes

This was my "learn the Python packaging story properly" project. Trusted publishing eliminates the long-tail risk of a leaked PyPI token.
