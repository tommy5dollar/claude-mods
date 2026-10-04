# effort-router

A Claude Code mod that checks your session's reasoning effort against the task once the task is clear, asks before changing it, then holds it. Each subagent gets its own level, read from its brief when it launches.

It follows Anthropic's guidance in [Using Claude Code: Spending your effort](https://claude.dev/blog/spending-your-effort/) (Thariq Shihipar, 25 September 2026). The article found that effort buys verification and edge-case testing, not a better approach. Low effort suits quick in-the-loop work. Medium suits ordinary feature work. High suits verification and bug fixes in existing code. Max suits fully autonomous hard problems.

Requires Claude Code 2.1.287 or later (Claude Mods).

## The rule

Your effort picker's level is the default, and the router only changes it with your say-so. After each prompt, until the task is clear, a small model reads the conversation and names the level the task needs. Then:

- **No clear task yet:** the turn runs at your picker's level. Nothing is asked.
- **The router names your picker's level:** the turn runs, nothing is asked, and that level is kept for the session.
- **The router names a different level:** the turn waits, and Claude's own question card asks: "Effort router: Multi-platform finance integration. Use high instead of medium?" `Use high` runs the turn at high and keeps high. `Keep medium` runs it at medium and keeps medium. Either way the session is decided and the router stops reading.

The reason is simple: a prompt run at the wrong effort can do a lot of work that has to be thrown away and redone, so it is worth one question before the turn starts. If you dismiss the question, the turn runs at your picker's level, the router stays undecided, and a later prompt can ask again.

## The states

The footer, right beside the native model and effort pickers, shows the router's state. It leaves out the level in use, because the effort picker a few pixels away already shows it.

| Footer | What it means | Band buttons (press the footer) |
| --- | --- | --- |
| `deciding` (dim) | The router is reading your prompts. Requests run at the picker's level | `Suggest now`, `Turn off` |
| `high?` | The question is open: the turn waits for your answer | `Suggest now`, `Turn off` |
| `high 🔒` | Decided: every main-thread request runs at high | `Suggest now`, `Turn off` |
| `off` (dim) | The router does nothing; the picker is in charge | `Turn on` |

<!-- screenshot: footer showing "deciding" beside the gauge and the native pickers -->
<!-- screenshot: the question card "Effort router: ... Use high instead of medium?" with the footer reading "high?" -->

The footer state is a plain button. Pressing it opens the router's band above the prompt: one line such as `Effort router: high 🔒 — router: bug fix in existing code`, then the buttons and `Close` (hotkey `x`). The buttons are numbered `1`, `2`. Any action closes the band, and pressing the footer again closes it too. With consent `ask` (the default) the band never opens by itself: the question card is where you agree.

With consent `auto` the router doesn't ask. When it locks a level that differs from your picker's, the band opens by itself once, reading `Using high — <reason>` with `Revert to picker` (router off, back to the picker's level) and `Close` (keep high). Pressing the footer shows the same band as under `ask`.

The footer is a button, not a dropdown, because the Desktop app silently drops a `Select` in the footer: it is not drawn, and nothing reports an error (verified live on the 2.1.286 app; the test kit accepts it, so the kit cannot catch this). The footer truncates with `…` when space runs out, so the label stays short.

The router never sets a level you pick by hand: that is what the native effort picker is for. To run at a specific level, turn the router off and use the picker; with the router off, every request goes out at the picker's level.

## Why the question is Claude's own question card

The router can only learn your picker's level from the request itself. `e.effort` in the `turn.step` hook, as the request arrives, is the engine's level for it. Nothing else shows it: the config list has no effort row, and a session's first prompt is submitted before any request exists. So the comparison, and the question, happen when the turn's request is about to go out.

A `turn.step` hook that waits on an ordinary promise is abandoned after about 10 seconds, and the request goes out without it. A call into the engine (`$.ui.ask`, which draws Claude's own AskUserQuestion card) doesn't count against that limit. Verified live on Desktop 2.1.286: the request was held for 23.6 seconds until the answer came, then went out at the chosen level. A button in the band would leave nothing to wait on, so the question has to be the card.

## How it decides

- **Before your prompt runs.** While the router is deciding, each prompt you send waits for one read by a small model (Haiku by default) before the turn starts. The wait is about a second (measured 0.73 to 0.84 s per read in `-p` runs) and happens at most `decideWithin` times per session. If the read takes longer than `classifyTimeoutMs` (8 s) or fails, the turn runs at the picker's level and `/route status` shows why.
- **Compared at the first request.** The read's level waits for the turn's first request, where your picker's level is known, and the rule above applies there. The comparison uses the level as it reached the router, before the router changes anything, so it is always your picker's.
- **Your answers count too.** When you answer Claude's multiple-choice questions (AskUserQuestion on the main thread), the router reads again before the answers go back to Claude, and the turn's next request applies the rule. Answered questions count toward the budget like a prompt.
- **What it reads.** Your prompts in full, Claude's questions with your answers, Claude's replies truncated (the last one less so) and other tool calls as names only, capped at `classifierMaxChars` (24,000). Over the cap it keeps your first prompt (the original task), then the newest lines, your prompts and answers before Claude's replies. `/route status` says how much the last read sent.
- **Undecided only before there is a task.** The model answers "undecided" only for opening filler: greetings, housekeeping such as "pull the latest code", or questions before any work. Once you state a real task it picks the level that task most likely needs, even while the details are open ("implement a finance solution pulling from several accountancy platforms" gets `high` straight away). The prompt carries ten worked examples on top of the [routing rules](#customising-the-rules).
- **The latest exchange counts most.** A later clarification overrides an earlier ask, and a short reply is read against the question it answers. If you dismissed the question for "refactor the payment retry logic" and then answer Claude's "1. full rewrite or 2. just extract the constant?" with "2", the next read names low.
- **Decided is decided.** Once a level is kept, every later main-thread request runs at it and the router stops reading. Subagents get their own level ([below](#subagents)). When the kept level isn't the picker's, the terminal also runs `/effort <level>` once the session is idle, so the native picker label matches. In the Desktop app the picker belongs to the app, so its label stays where you set it; trust the footer. A kept level survives `claude --resume`. Choosing `Keep medium` keeps medium even if you move the picker later; `/route off` hands control back to the picker.
- **It stops after `decideWithin` prompts** (6 by default), counted from the start of the session. If nothing is decided by then, the router turns off with the reason `no clear task after 6 prompts — /route to ask again`, after asking any question still waiting. It never calls the model again on its own.
- **Existing sessions are left alone.** The first time the router sees a session that already has `decideWithin` or more prompts in it (a long chat from before the router was installed, say), it starts `off` with the reason `existing session — /route to ask`: no question, no model calls. Fewer earlier prompts count toward the budget. A resumed session with saved router state keeps that state.
- **`/route` asks now.** It reads the whole conversation in any state, ignoring the budget. If the answer is the level already in use, it says so and changes nothing. If it is your picker's level while a different one is kept, it keeps the picker's level without asking. Otherwise the question card opens straight away ("Use low instead of medium?", always naming your picker's level), and your answer is kept. Add a hint to steer it: `/route this is a security review`, `/route keep it quick`. The hint is weighed strongly and kept for later reads until a level is kept. The band's `Suggest now` is the same as bare `/route`.
- **Consent `auto`.** For headless runs, or if you trust the router: its level is kept at once, without a question (shown once in the band when it differs from your picker's). Set it in `/config`, or with `EFFORT_ROUTER_CONSENT=auto`.

## Subagents

Each subagent gets its own level, read from the brief its parent wrote for it.

- **One read at launch.** When Claude launches a subagent, the launch waits for one Haiku read of the agent's type, description and brief (capped at `classifierMaxChars`). Then the subagent starts, and every request it makes carries that level. The read takes about a second, on an agent that usually runs for minutes in the background.
- **Its own framing.** A subagent has no user in the loop, which favours higher effort for open-ended judgement: implementing, debugging, code review, security work and design. Mechanical work and tight specs stay low with or without a user: searching code or the web, lookups, listing files, tabulating, running a given command and summarising text it was given. The brief is the whole task, so the read decides from it alone and always picks a level. Your rules and your organisation's [rules](#customising-the-rules) apply here too.
- **An agent's own `effort:` wins.** If the agent's definition sets an effort, the router doesn't read its brief and leaves its requests alone, so the engine applies the definition's level. It looks for the definition by its frontmatter `name:` in the project's `.claude/agents/*.md`, then your `~/.claude/agents/*.md`, and in the `agents` key of policy, project and user settings. The first definition with that name decides, as it does for the engine: a project definition without `effort:` still beats a user one with it. Definitions are scanned once per session. `/route status` shows such an agent as `low (set by its definition)`.
- **Forks and failures take the parent's level.** A fork shares its parent's context, so it skips the read. If a read fails, times out (`classifyTimeoutMs`) or returns something unusable, the subagent also takes its parent's level. That is the main thread's level in use, or for a subagent launched by another subagent, that subagent's level. With no level anywhere, its requests are left alone.
- **It runs even when the main thread is left alone.** In an existing session the router leaves the main thread alone, but each new subagent brief is a fresh, whole task, so subagents are still routed. The same holds after the router turns itself off with no clear task. When you turn the router off yourself (`/route off`, `Revert to picker`, `Turn off`), subagents go back to the picker's level too, and `/route on` brings their routed levels back.
- **Seeing it.** `/route status` lists this session's routed subagents, newest first (the last 10), with level, description, agent type and why. The debug log has one line per routed launch. Nothing is added to the footer or to the parent's conversation.

Claude can't set a subagent's effort itself today: the Agent tool takes a model but no effort, so without the router every subagent runs at the session's level unless its agent definition sets one. Set `routeSubagents` to `false` to go back to that (the main thread's level in use, as before 0.7.0).

## Policy

The shipped rules are in [`rules/default.md`](rules/default.md). In short:

| Level | When | From the article |
| --- | --- | --- |
| low | Quick in-the-loop work: brainstorming, sketching, questions, easy changes, the interview/spec phase, chores and rulebook/operations work | "quick responses that are in the loop" |
| medium | Regular feature implementation, and the default for ordinary build work | "most of my regular software engineering work" |
| high | Verification and edge cases: bug fixes in existing code, debugging, tests, code review | "fixing a bug in a brownfield codebase" |
| xhigh | Edge-case-heavy work in the domains where effort paid most on Terminal-Bench 3.0 (security hardening, hardware, ML/data science, performance, concurrency) while you are still in the loop | the HTML sanitizer and storage-engine examples peaked at xhigh |
| max | Fully autonomous hard problems: end-to-end build and verify, vulnerability hunting. Used sparingly | "operate fully autonomously to solve difficult problems" |

xhigh earns its place because the article's own worked examples (the HTML sanitizer and the storage-engine bug fix) reached their best results there, while max is kept for when nobody is in the loop. A tight spec pushes the choice lower. "Do it all, I'm away" pushes it higher.

## Commands

| Command | What it does |
| --- | --- |
| `/route` | Runs the router now over the whole conversation, in any state, and asks if its level differs |
| `/route <hint>` | The same, with a hint for the classifier (`/route this is a security review`) |
| `/route status` | Shows the state and why, the consent mode, automatic reads used of the budget, classifier calls and how long the last read took, how much transcript it sent, the last verdict (with the raw reply and when), the last error, and this session's routed subagents |
| `/route off` | Turns the router off and restores the picker's earlier level |
| `/route on` | Turns the router back on: deciding over the whole conversation, with a fresh budget |
| `/route rules` | Prints the effective rules and which layers contributed |
| `/route rules init [user\|project]` | Writes a starter rules file that keeps the defaults |
| `/route rules critique` | Asks Sonnet to critique your custom rules |

`/route` is registered with `$.command.register`, so it shows in the typeahead. State is per session. `/route decide` is a hidden alias of bare `/route`. There is no command to set a level: turn the router off and use the effort picker.

## Options

Set them in `/config`, or under `pluginConfigs["effort-router@tommy-mods"].options` in settings.json.

| Option | Default | Meaning |
| --- | --- | --- |
| `consent` | `ask` | When the router wants a different level from your picker: `ask` holds the turn and asks (Use the router's level or Keep yours). `auto` uses the router's level without asking and shows it once in the band, with Revert to picker. A value saved by an older version reads as unset, so `ask` |
| `decideWithin` | 6 | Prompts (and answered questions) the router reads automatically, counted from the session's start |
| `classifyTimeoutMs` | 8000 | How long a prompt waits for the read before it runs anyway |
| `classifierMaxChars` | 24000 | Most transcript characters one read sends |
| `classifierModel` | `haiku` | The model that reads the transcript |
| `syncPicker` | true | Run `/effort <level>` so the terminal's picker label matches |
| `routeSubagents` | true | Give each subagent its own level from a read of its brief at launch. `false`: subagents run at the main thread's level |
| `footerControl` | `button` | `button` makes the footer state a button that opens the band. `label` draws plain text, and `/route` is the control |
| `rules` | empty | Rules text for your user layer. A rules file takes precedence |

The environment variable `EFFORT_ROUTER_CONSENT=ask|auto` overrides `consent`, which helps in headless runs (`-p` has no one to answer a question, so use `auto` there). The older names still work there: `apply` and `none` mean `auto`, while `confirm` and `band` mean `ask`.

## Customising the rules

The rules are plain markdown, layered from the bottom up:

1. The shipped defaults (`rules/default.md`)
2. Your organisation's rules from managed (policy) settings, if it sets any
3. Your rules: `~/.claude/effort-router.md`, or the `rules` option in your user settings
4. The project's rules: `<project root>/.claude/effort-router.md` (commit it), or the `rules` option in project settings

A line that is exactly `$defaults` pulls in everything beneath that layer. Text after the line adds to the rules, and later rules win. Text before it goes first. A file with no `$defaults` line replaces everything beneath it. Missing or empty files change nothing, and HTML comments are ignored.

```markdown
$defaults

- This is a payments codebase. Never pick below high: money movement needs verification.
```

The files are re-read on every classification, so edits apply without a reload. An unreadable file is skipped. The frame around the rules (undecided only before a task, the worked examples, reply in JSON) is fixed, so no rules file can break the parser.

## For organisations

An organisation can set routing rules centrally in managed settings (`managed-settings.json`), as it does for other Claude Code policy:

```json
{
  "pluginConfigs": {
    "effort-router@tommy-mods": {
      "options": {
        "rules": "$defaults\n\n- Code under payments/ or ledger/ is never routed below high.\n- Infrastructure changes (terraform/, k8s/) are high.",
        "rulesMode": "enforce",
        "allowOff": false
      }
    }
  }
}
```

- `rulesMode: "extend"` (the default) layers the org rules over the shipped defaults. Users and projects can add to them with `$defaults`, or replace them.
- `rulesMode: "enforce"` makes the org layer final. Personal and project rules are ignored, and `/route rules init` says so.
- `routeSubagents: false` turns subagent routing off for everyone, whatever their own setting.
- `allowOff: false` stops users turning the router off, so the organisation's routing always applies. `/route off` refuses, the band has no `Turn off` or `Revert to picker`, and a session saved as off comes back deciding. When the budget runs out with nothing suggested, the router idles as `deciding` (no more reads) instead of turning off. `/route` still works.

A top-level `"effortRouter": { "rules": ..., "rulesMode": ..., "allowOff": ..., "routeSubagents": ... }` object works too. The router reads these four settings only from the policy source, so a user cannot claim `enforce` for themselves.

## Install

```
claude plugin marketplace add tommy5dollar/mods
claude plugin install effort-router@tommy-mods
```

For development, run `claude --plugin-dir ./effort-router`.

## Known limits

- In the Desktop app the native effort picker never changes: the app owns it and nothing a mod can call sets it. The requests still go out at the routed level; trust the footer label.
- In the terminal the router can't set the picker label directly either. It runs `/effort <level>` when the session is idle, which prints a line in the transcript, and the footer shows the true level until then. Headless (`-p`) runs skip the sync because its output would replace the run's printed result. The per-request override still applies there.
- Each prompt waits about a second for the read while the router is deciding (at most `decideWithin` prompts per session). If the read times out (`classifyTimeoutMs`), that turn goes at the picker's level; a late answer is ignored.
- A request whose picker level is a number rather than a named level, or a model that takes no effort, can't be compared, so the waiting verdict waits for the next request that can.
- The router changes effort only, never the model. A request to a model that takes no effort is left alone.
- Each automatic read is one Haiku call per prompt while deciding, for at most `decideWithin` prompts, of at most `classifierMaxChars` of transcript. Nothing more is spent once a level is locked or the budget is spent, except when you run `/route`.
- Once decided, the router does not notice a change of phase on its own (for example "now verify it" after an implementation). Run `/route` (or the footer's Suggest now), optionally with a hint, to be asked again.
- A definition's `effort:` is respected for user and project agent files and for the `agents` key in settings, not for plugin agents (`<plugin>:<name>`), which can't be located reliably. Those are routed from their brief, which replaces any effort their definition sets. A mod's `$.agent.register({ effort })` is ignored by the engine itself (an engine bug), and the router routes those agents too.
- An agent file added or edited mid-session is seen from the next session: definitions are scanned once per session.
- Workflow agents that don't launch through the Agent tool raise no `agent.spawn`, so they keep the main thread's level.
- Subagent levels are kept in memory only. After a restart or resume, a subagent still running from before takes the main thread's level.
- The router adds no note about the chosen level to the system prompt, because changing a cached prompt section would break the prompt cache. The `/effort` echo tells the model instead, and it is appended to the transcript, so the cache holds.
- The band and footer draw in the terminal and the Desktop app. VS Code and `-p` run the hooks without the UI. Under `ask` in `-p` the question has no one to answer, so requests stay at the picker's level; set `consent` (or `EFFORT_ROUTER_CONSENT`) to `auto` there.

## Development

```
bun test                            # pure policy: trimming, parsing, rule layering, /route grammar, subagent reads
claude plugin test .                # engine kit: band, buttons, footer button, turn.step, /route, org layers, agent.spawn
claude plugin validate . --strict
bun run eval                        # opt-in: the real classifier over eval/fixtures.ts (see below)
```

`bun run eval` sends each fixture to the real model through `claude -p --safe-mode` (no plugins or hooks, no tools), with exactly the system prompt and input the router builds from `rules/default.md`: a transcript for the session read, a brief for a subagent's read. It parses the reply with the router's own parser and prints each verdict, the pass rate and every miss. `--runs 3` repeats each fixture (the model is not deterministic), `--model sonnet` tries another model, `--set session` or `--set subagent` runs one set and `--only <text>` filters fixtures by name. It uses your Claude Code login, and each fixture costs one small model call.

[TESTING.md](TESTING.md) lists the live checks.

## Licence

MIT
