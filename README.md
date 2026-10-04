# tommy-mods

Claude Code mods (function-hook plugins, Claude Code 2.1.286+, terminal and the Desktop Code tab).

| Mod | What it does |
| --- | --- |
| [effort-router](effort-router/) | Reads the session until the task is clear, proposes a reasoning effort based on Anthropic's "Spending your effort" guidance, and locks it for the session once you approve. Rules are customisable per user, per project and per organisation. |
| [context-gauge](context-gauge/) | Shows context-window use beside the model picker: green under 30%, yellow 30–40%, red above 40%. |

## Install

```
claude plugin marketplace add tommy5dollar/mods
claude plugin install effort-router@tommy-mods
claude plugin install context-gauge@tommy-mods
```

Restart Claude Code (or the Desktop app) after installing.

MIT licensed.
