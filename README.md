# claude-mods

Mods for Claude Code: function-hook plugins that run in the terminal and in the Desktop app's Code tab. They require
Claude Code 2.1.286 or later.

## effort-router

Claude Code runs every request at the effort level you picked, whatever the task, and a subagent runs at that level
too unless its agent definition fixes one. effort-router picks levels per task, following Anthropic's
[Spending your effort](https://claude.dev/blog/spending-your-effort/) guidance. It works with Fable 5.1, Opus 5.5 and
Sonnet 5.5.

- **Your session.** Your session's own model assesses each of your first five prompts, using sourced notes on what
  each level can do on that model. It moves the level only when it's at least 70% sure the one running is wrong.
  Then the level locks. The footer shows 🔓, 🔒 or ⏸️ with the level, and clicking it opens a band to lock, unlock,
  turn off or assess again. About 20 cents a session on Opus 5.5, then nothing.
- **Subagents.** Before each subagent starts, the agent launching it says what level it needs on the model it runs
  on: it knows the task and why it's delegating. An agent whose definition sets its own `effort:`, or one running
  on Haiku, is left alone.
- **Where it went.** `/er report` shows the requests and output tokens at each level, by session, week or month, and
  what the router changed. It's measured from every request, subagents included, and stays on your machine.
- **Your rules.** Routing rules can be extended or replaced per user, per project and per organisation.

[Read more](effort-router/)

## context-gauge

Shows how much of the context window the session is using, beside the model picker: green under 30%, yellow 30–40%,
red above 40%. `/ctx` prints the breakdown.

[Read more](context-gauge/)

## Install

```
claude plugin marketplace add tommy5dollar/claude-mods
claude plugin install effort-router@tommy-mods
claude plugin install context-gauge@tommy-mods
```

Start a new session (or restart the Desktop app) after installing. [CHANGELOG.md](CHANGELOG.md) lists the versions.

MIT licensed.
