# effort-router

[![effort-router version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ftommy5dollar%2Feffort-router%2Fmain%2Feffort-router%2F.claude-plugin%2Fplugin.json&query=%24.version&label=effort-router&color=blue)](CHANGELOG.md)
[![Claude Code 2.1.286 or later](https://img.shields.io/badge/Claude%20Code-2.1.286%2B-d97757)](https://code.claude.com/docs/en/plugins/mods/overview)
[![MIT licence](https://img.shields.io/badge/licence-MIT-green)](LICENSE)

A Claude Code plugin by [Tommy Long](https://www.tommylong.com) that picks the reasoning effort for each task.

Claude Code runs every task at the effort level you picked, whether it's renaming a variable or a migration that
touches three services. Anthropic's [Spending your effort](https://claude.dev/blog/spending-your-effort/) says the
right level depends on the task. effort-router picks it for you, so easy work stops paying for thinking it doesn't need.

<img src="effort-router/docs/race.gif" width="720" alt="A race between two Claude Code sessions on the same three chores, Fable 5.1 set to xhigh. Fixed at xhigh it takes 8:28 and $3.74. With effort-router the main thread moves to medium and its subagents to low, medium and low. It takes 2:24 and $1.64. All 7 tests pass on both">

- **Your session.** Your session's own model assesses each of your first five prompts and moves the level to the one
  that gets the work done fastest and cheapest, then locks. The footer shows the level in use, and clicking it gives
  you Lock, Unlock, Turn off and Assess.
- **Subagents.** Each subagent gets its own level, chosen by the agent launching it, for the whole session. Without
  the router every subagent runs at your level.
- **Your rules.** Add to the routing rules in plain markdown, per user, per project or for a whole organisation.
- **Where it went.** `/er report` shows the requests and output tokens at each level, and what the router changed.

<img src="effort-router/docs/footer.gif" width="720" alt="The footer in the Desktop app. A rename is assessed and moves from medium to low, a production bug moves from low to high while the effort picker still says Medium, and clicking the footer opens the band">

It works with Fable 5.1, Opus 5.5 and Sonnet 5.5, in the Desktop app's Code tab and in the terminal.

## Install

**In the Desktop app:** go to Customize, then Plugins, Add marketplace, Add from a repository, then enter
`tommy5dollar/effort-router`. Then in a Code tab session, click **+** next to the prompt box, then Plugins, Add plugin,
and install effort-router.

**In the terminal:**

```
claude plugin marketplace add tommy5dollar/effort-router
claude plugin install effort-router@tommy5dollar
```

Then start a new session. The Desktop app and the terminal share plugins, so either way installs it for both. In the
Desktop app the footer appears once you've sent the first message. `/er off` turns it off for a session, and
`claude plugin uninstall effort-router@tommy5dollar` removes it.

## Does it save money and time?

That's what it's for. The higher you run, the more it saves. In our test, Fable 5.1 on xhigh was given three small
chores to hand to subagents. The router moved it to medium and its Opus subagents to medium or low. It finished in
about 2 minutes for $1.10 to $1.65, against 6 to 8.5 minutes and $3.20 to $3.75 left on xhigh, and every test passed
both ways. Those figures include the router's own assessments.

On Opus 5.5 at high, a 20-prompt session of everyday work came back 38% faster and 35% cheaper, every test passing.
The gap grows the longer you go, because high takes more turns and reads more, and every later request pays to
re-read all of it. Artificial Analysis's Intelligence Index (v4.3.2) shows the same pattern: on Opus 5.5, xhigh costs
about 2.6 times medium.

On Opus 5.5's default of medium there's less to step down from, so it mostly picks off the small tasks. It still steps
up when the work clearly needs it, because a hard task done right first time costs less than the rework. Routing costs
about 20 cents a session on Opus 5.5, and each of the first five prompts waits a second or two for its assessment.

## What it reads, sends and stores

This plugin runs inside Claude Code without a sandbox, so here's exactly what it does:

- **Sends:** assessments go to your session's own model through Claude Code, on your existing login. If your
  organisation has set up Claude Code's OpenTelemetry, it adds a few attributes to Claude Code's own records for that
  collector (see [Telemetry](effort-router/#telemetry-for-organisations)). Nothing else leaves your machine.
- **Reads:** your conversation, your CLAUDE.md files, rules and memory, your agent definitions and its own rules files.
- **Writes:** one small JSON file per session in `~/.claude/effort-router/spend/`, and nothing else.
- **Never:** runs a process, changes your saved effort setting or changes the model.

[Full documentation](effort-router/) · [Common questions](effort-router/#common-questions) ·
[Changelog](CHANGELOG.md) · [Report a problem](https://github.com/tommy5dollar/effort-router/issues/new/choose)
