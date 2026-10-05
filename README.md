# claude-mods

Mods for Claude Code: function-hook plugins that run in the terminal and in the Desktop app's Code tab (Claude Code
2.1.286+).

## effort-router

Claude Code runs every request at the effort level you picked, whatever the task, and a subagent runs at that level
too unless its agent definition fixes one. A parent can't choose a subagent's effort when it launches one. effort-router picks levels per task, based on Anthropic's
[Spending your effort](https://claude.dev/blog/spending-your-effort/) guidance.

- **Your session.** Your session's own model judges what the task needs, using sourced notes on what each level
  can do on that model, and the router acts only once it's confident. It goes up to xhigh unless you allow max. If that matches your effort picker, nothing changes. If it doesn't, the turn runs at the router's level and the band above the prompt says so once, with a button to
  stop routing. Prefer to be asked first? Set consent to `ask`, and Claude's own question card asks "Use high effort
  instead of medium?" before the turn runs. It works with Fable 5.1, Opus 5.5 and Sonnet 5.5.
- **Subagents.** Before each subagent starts, the agent launching it says what level it needs on the model it runs
  on: it knows the task and why it's delegating. An agent whose definition sets its own `effort:`, or one running
  on Haiku, is left alone.
- **Where it went.** `/route report` shows the requests and output tokens at each level, by session, week or
  month, and what the router changed. It's measured from every request, subagents included, and stays on your
  machine.
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
