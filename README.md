# claude-plugins

Claude Code plugins by [Tommy Long](https://www.tommylong.com).

## effort-router

Claude Code runs every task at the effort level you picked, whether it's renaming a variable or a migration that
touches three services. Anthropic's [Spending your effort](https://claude.dev/blog/spending-your-effort/) says to
match the effort to the task. effort-router is a mod that does that for you.

![The footer in the Desktop app: the router moved this session to high while the effort picker still shows Medium](effort-router/docs/footer-moved.png)

- **Your session.** Your session's own model assesses each of your first five prompts. It moves the level only when
  it's at least 70% sure the one running is wrong, then locks. The footer shows where it is, and clicking it gives you
  Lock, Unlock, Turn off and Assess.
- **Subagents.** Each subagent gets its own level, chosen by the agent launching it, which knows why it's delegating.
- **Your rules.** Add to the routing rules in plain markdown, per user, per project or for a whole organisation.
- **Where it went.** `/er report` shows the requests and output tokens at each level, and what the router changed.

It works with Fable 5.1, Opus 5.5 and Sonnet 5.5, in the terminal and in the Desktop app's Code tab. It requires
Claude Code 2.1.286 or later.

### Install

```
claude plugin marketplace add tommy5dollar/claude-plugins
claude plugin install effort-router@tommy5dollar
```

Then start a new session. In the Desktop app the footer appears once you've sent the first message.

### Does it save money?

Often, but not by always going lower. The right level depends on the task, and where it moves depends on where you
start: if you run everything at high it moves easy work down, and at medium it moves hard work up. Running a hard task
at a higher level often costs less overall, because getting it right first time saves the rework, which costs tokens
and your own time. The routing itself costs about 20 cents a session on Opus 5.5.

### What it reads, sends and stores

Mods run inside Claude Code without a sandbox, so here's exactly what this one does:

- **Sends:** assessments go to your session's own model through Claude Code, on your existing login. Nothing else
  leaves your machine: no telemetry and no other network calls.
- **Reads:** your conversation, your CLAUDE.md files, rules and memory, your agent definitions and its own rules files.
- **Writes:** one small JSON file per session in `~/.claude/effort-router/spend/`, and nothing else.
- **Never:** runs a process, changes your saved effort setting or changes the model.

[Full documentation](effort-router/) · [Changelog](CHANGELOG.md) · MIT licensed
