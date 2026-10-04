# claude-mods

Mods for Claude Code: function-hook plugins that run in the terminal and in the Desktop app's Code tab (Claude Code
2.1.286+).

## effort-router

Claude Code runs every request at the effort level you picked, whatever the task, and a subagent runs at that level
too unless its agent definition fixes one. A parent can't choose a subagent's effort when it launches one. effort-router picks levels per task, based on Anthropic's
[Spending your effort](https://claude.dev/blog/spending-your-effort/) guidance.

- **Your session.** A quick Haiku read of the conversation decides what the task needs. If that matches your effort
  picker, nothing changes. If it doesn't, the turn waits and Claude's own question card asks: "Use high instead of
  medium?" Nothing runs at a level you didn't agree to. Prefer not to be asked? Set consent to `auto`.
- **Subagents.** Each subagent gets its own level from the brief its parent wrote, before it starts: web lookups and
  searches run low, implementation, debugging and review run high. An agent whose definition sets its own `effort:`
  is left alone.
- **Where it went.** `/route report` shows the requests and output tokens at each level, by session, week or month, and what the router moved, measured from every request (main thread and subagents) and kept on your machine.
- **Your rules.** Routing rules can be extended or replaced per user, per project and per organisation (managed
  settings can enforce them).

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

Start a new session (or restart the Desktop app) after installing.

MIT licensed.
