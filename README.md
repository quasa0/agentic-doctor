# Agentic Doctor

Agentic Doctor is a hackathon project for running a recursive advisor/executor loop over any codebase. One model acts like a senior reviewer, chooses the next small fix, and emits a bounded `/goal`; another model acts like the implementer, edits the target repo, verifies the change, and hands the result back for review.

## Why

Code agents are strongest when they have a tight loop: inspect, choose one concrete issue, fix it, verify it, and stop or repeat. In practice, it is easy for a single agent to drift into broad audits, oversized refactors, or expensive test runs.

Agentic Doctor splits that workflow into two roles. The advisor keeps scope small and testable. The executor focuses only on the current goal. The loop can run once for a quick codebase check or recursively for continuous cleanup.

## How It Works

* The CLI points at a target codebase with `--target`.
* The advisor receives the initial task and either emits `/goal` with one bounded next step or `/done`.
* The executor receives only the current advisor goal, makes the requested changes, and reports changed files, verification commands, results, and remaining risks.
* The advisor reviews the executor output and decides whether to emit the next `/goal` or finish with `/done`.
* Direct Gateway mode sends both roles through Vercel AI Gateway.
* Harness mode runs Claude Code as the advisor and Codex CLI as the executor so the executor can inspect and edit the target repo through local coding tools.

## Environment

Copy `.env.example` to `.env` and fill in:

```bash
AI_GATEWAY_API_KEY=
```

The key is used for Vercel AI Gateway in both direct mode and harness mode.

## Local Setup

```bash
npm install
npm run build
```

For development:

```bash
npm run dev -- run --target ~/path/to/repo --mock
```

Mock mode does not call the gateway. It is useful for checking the CLI loop and terminal output before wiring up credentials.

## Run

Direct Gateway mode:

```bash
npm run dev -- run \
  --target ~/path/to/repo \
  --executor-model openai/gpt-5.5 \
  --advisor-model anthropic/claude-sonnet-4.6
```

Harness mode:

```bash
npm run dev -- run \
  --target ~/path/to/repo \
  --harness \
  --executor-model openai/gpt-5.5 \
  --advisor-model anthropic/claude-sonnet-4.6
```

Harness mode launches Claude Code with permission bypass enabled and Codex CLI with full sandbox bypass against the selected target path. Use it only on repositories where that level of local tool access is acceptable.

## Recursive Loop

Use `--max-rounds` to control the number of advisor/executor passes. The default is `5`; `-1` keeps looping indefinitely. By default the advisor is not allowed to stop with `/done`; pass `--allow-done` only when you want the advisor to terminate early.

```bash
npm run dev -- run \
  --target ~/path/to/repo \
  --harness \
  --max-rounds -1 \
  --advisor-effort low \
  --reasoning low \
  --task "Inspect only enough to find one small high-confidence issue, emit one bounded /goal, ask for at most two lightweight verification commands, then review the executor result and emit the next /goal for a different issue. Do not emit /done."
```

Useful options:

```bash
npm run dev -- run --help
```

## Models

If model flags are omitted in an interactive terminal, the CLI prompts for a model. In non-interactive runs, it falls back to the first configured advisor and executor models.

Default advisor choices:

```bash
anthropic/claude-sonnet-4.6
anthropic/claude-haiku-4.5
anthropic/claude-opus-4.6
```

Default executor choices:

```bash
openai/gpt-5.5
openai/gpt-5.4
openai/gpt-5.4-mini
openai/gpt-5.3-codex
```

## Current Scope

This prototype is intentionally small. It provides the loop controller, role prompts, target snapshotting, Vercel AI Gateway client, mock client, and local coding harness. The current target snapshot is a lightweight file inventory, while harness mode delegates real codebase inspection and edits to Claude Code and Codex CLI.

## About

[Hackathon Project] Recursive codebase doctor that pairs an advisor model with an executor model. The advisor keeps each step bounded with `/goal`; the executor implements and verifies the requested change.
