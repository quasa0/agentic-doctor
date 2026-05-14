# agentic-doctor

`agentic-doctor` is a CLI for running a Ralph-style loop over a target codebase:

1. An advisor model inspects the target and emits a bounded `/goal`.
2. An executor model works on that goal.
3. The advisor reviews the executor output and either emits the next `/goal` or `/done`.

The first provider target is Vercel AI Gateway.

## Install

```bash
npm install
npm run build
```

## Configure

Create `.env`:

```bash
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
```

## Run

Mock mode, useful before credentials are ready:

```bash
npm run dev -- run --target ~/f --mock
```

Gateway mode:

```bash
npm run dev -- run \
  --target ~/f \
  --executor-model openai/gpt-5.5 \
  --advisor-model anthropic/claude-sonnet-4.6
```

Coding-harness mode, using Claude Code as advisor and Codex CLI as executor:

```bash
bun run dev -- run \
  --target ~/f \
  --harness \
  --executor-model openai/gpt-5.5 \
  --advisor-model anthropic/claude-sonnet-4.6
```

Recursive Expo improvement loop:

```bash
bun run dev -- run \
  --target ~/f/expo \
  --harness \
  --max-rounds -1 \
  --executor-model openai/gpt-5.5 \
  --advisor-model anthropic/claude-sonnet-4.6 \
  --task "Run a recursive React doctor loop on this Expo React Native app. Advisor: inspect current state, choose the highest-impact concrete issue, and emit one bounded /goal with expected verification. Executor: implement the goal directly, run focused checks where practical, and report changed files, commands, and remaining risks. Repeat until advisor emits /done."
```

In harness mode, Claude Code is launched with `--permission-mode bypassPermissions` and
`--dangerously-skip-permissions`. Codex is launched with
`--dangerously-bypass-approvals-and-sandbox` and `--sandbox danger-full-access`.
Both subprocess stdout/stderr streams are proxied back into the parent terminal.

Useful options:

```bash
agentic-doctor run --help
```

## Current scope

This initial scaffold logs both model roles in the terminal and enforces bounded loop iterations. Direct Gateway mode only exchanges model text. Harness mode delegates to local coding CLIs so the advisor/executor can inspect and edit the target codebase through those tools.
