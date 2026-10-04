# effort-router

A Claude Code mod that sets a session's reasoning effort for you once the task is clear, then holds it. Each subagent gets its own level, read from its brief when it launches.

It follows Anthropic's guidance in [Using Claude Code: Spending your effort](https://claude.dev/blog/spending-your-effort/) (Thariq Shihipar, 25 September 2026). The article found that effort buys verification and edge-case testing, not a better approach. Low effort suits quick in-the-loop work. Medium suits ordinary feature work. High suits verification and bug fixes in existing code. Max suits fully autonomous hard problems.

Requires Claude Code 2.1.287 or later (Claude Mods).

## The states

The footer, right beside the native model and effort pickers, shows the router's state. It leaves out the level in use, because the effort picker a few pixels away already shows it.

| Footer | What it means | Band buttons |
| --- | --- | --- |
| `deciding` (dim) | The router is watching. Nothing is in use, so the picker's level applies | `Suggest now`, `Turn off` |
| `high?` | The router's level is in use but not yet kept (consent `apply`, the default): every request runs at high, and re-reads may still change it. The band opens by itself: `Using high — <reason>` | `Keep high`, `Revert to picker` (+ `Suggest now` from the footer) |
| `high 🔒` | Locked: every request runs at high | `Suggest now`, `Turn off` |
| `high 🔒 → low?` | Locked, and a manual `/route` suggests switching to low. The band opens by itself | `Accept low`, `Keep high`, `Turn off` |
| `off` (dim) | The router does nothing; the picker is in charge | `Turn on` |

With consent `confirm`, `high?` instead means a suggestion waiting for you: nothing is applied until `Accept high`.

<!-- screenshot: footer showing "deciding" beside the gauge and the native pickers -->
<!-- screenshot: footer showing "high?" with the band above the prompt -->

The footer state is a plain button. Pressing it opens the router's band above the prompt: one line such as `Effort router: high 🔒 — router: bug fix in existing code`, then that state's buttons and `Close` (hotkey `x`). The buttons are numbered `1`, `2`, `3`. Any action closes the band, and pressing the footer again closes it too. A new level opens the same band by itself; `Close` hides it and the level stays in use (provisional) in the footer. `Revert to picker` is the same as turning the router off.

The footer is a button, not a dropdown, because the Desktop app silently drops a `Select` in the footer: it is not drawn, and nothing reports an error (verified live on the 2.1.286 app; the test kit accepts it, so the kit cannot catch this). The footer truncates with `…` when space runs out, so the label stays short.

The router never sets a level you pick by hand: that is what the native effort picker is for. To run at a specific level, turn the router off and use the picker; with the router off, every request goes out at the picker's level.

## How it decides

- **Before your prompt runs.** While the router is deciding or its level is still provisional, each prompt you send waits for one read by a small model (Haiku by default) before the turn starts, so the turn's first request already carries the router's level. A long first prompt is never implemented at the wrong effort. The wait is about a second (measured 0.73 to 0.84 s per read, 0.84 to 0.88 s for the whole prompt hook, in `-p` runs) and happens at most `decideWithin` times per session. If the read takes longer than `classifyTimeoutMs` (8 s) or fails, the turn goes ahead at the current level and `/route status` shows why.
- **Your answers count too.** When you answer Claude's multiple-choice questions (AskUserQuestion on the main thread), the router reads again before the answers go back to Claude. Answered questions count toward the budget like a prompt.
- **What it reads.** Your prompts in full, Claude's questions with your answers, Claude's replies truncated (the last one less so) and other tool calls as names only, capped at `classifierMaxChars` (24,000). Over the cap it keeps your first prompt (the original task), then the newest lines, your prompts and answers before Claude's replies. `/route status` says how much the last read sent.
- **Undecided only before there is a task.** The model answers "undecided" only for opening filler: greetings, housekeeping such as "pull the latest code", or questions before any work. Then nothing is applied and the footer reads `deciding`. Once you state a real task it picks the level that task most likely needs, even while the details are open ("implement a finance solution pulling from several accountancy platforms" gets `high` straight away). The prompt carries ten worked examples on top of the [routing rules](#customising-the-rules).
- **Apply first, presume it is right** (consent `apply`, the default). The level is used at once and shown in the band: `Using high — <reason>` with `1: Keep high` (lock it and stop reading), `2: Revert to picker` (back to the picker's level, router off) and `x: Close` (hide the band, stay provisional). Re-reads continue while it is provisional. If one changes the level, the new level is used at once and the band opens again (`Using low — …`); an undecided re-read leaves the level alone.
- **The latest exchange counts most.** A later clarification overrides an earlier ask, and a short reply is read against the question it answers. Say "refactor the payment retry logic" and the router may use high; if Claude then asks "1. full rewrite or 2. just extract the constant?" and you answer "2", the next read moves it to low before that turn runs.
- **Keep locks.** Every later request on the main thread runs at the locked level, and the router stops reading. Subagents get their own level ([below](#subagents)). In the terminal it also runs `/effort <level>` once the session is idle, so the native picker label matches. In the Desktop app the picker belongs to the app, so its label stays where you set it; trust the footer (verified: Desktop's transcript records `effort: high` on every request after a lock while the picker still reads Medium). A lock survives `claude --resume`.
- **It stops after `decideWithin` prompts** (6 by default), counted from the start of the session. A provisional level is then locked (`high 🔒`, with a one-line log). With nothing in use the router turns off with the reason `no clear task after 6 prompts — /route to ask again`. It never calls the model again on its own.
- **Existing sessions are left alone.** The first time the router sees a session that already has `decideWithin` or more prompts in it (a long chat from before the router was installed, say), it starts `off` with the reason `existing session — /route to ask`: no band, no toast, no model calls. Fewer earlier prompts count toward the budget. A resumed session with saved router state keeps that state.
- **`/route` asks now.** It reads the whole conversation in any state, ignoring the budget, and goes through the same consent. Add a hint to steer it: `/route this is a security review`, `/route keep it quick`. The hint is weighed strongly and kept for re-reads. If the router still finds no clear task, it says so and changes nothing. While locked, a different answer offers a switch in the band (`high 🔒 → low?`, with `Accept low`, `Keep high` and `Turn off`); the same answer just confirms. The band's `Suggest now` is the same as bare `/route`.
- **Other consent modes.** `confirm` is the 0.5 behaviour: the band offers `Accept high` / `Turn off`, and nothing is applied until you accept (a re-read can change or withdraw the suggestion). `ask` asks a blocking question after the read, before the turn runs, whenever a new level is suggested. `none` locks at once without asking.

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
| `/route` | Runs the router now over the whole conversation, in any state |
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
| `consent` | `apply` | `apply` uses the router's level at once (Keep or Revert in the band). `confirm` waits for Accept in the band. `ask` asks a blocking question when a new level is suggested (skipped where nobody can answer, such as `-p`). `none` locks without asking |
| `decideWithin` | 6 | Prompts (and answered questions) the router reads automatically, counted from the session's start |
| `classifyTimeoutMs` | 8000 | How long a prompt waits for the read before it runs anyway |
| `classifierMaxChars` | 24000 | Most transcript characters one read sends |
| `classifierModel` | `haiku` | The model that reads the transcript |
| `syncPicker` | true | Run `/effort <level>` so the terminal's picker label matches |
| `routeSubagents` | true | Give each subagent its own level from a read of its brief at launch. `false`: subagents run at the main thread's level |
| `footerControl` | `button` | `button` makes the footer state a button that opens the band. `label` draws plain text, and `/route` is the control |
| `rules` | empty | Rules text for your user layer. A rules file takes precedence |

The environment variable `EFFORT_ROUTER_CONSENT=apply|confirm|ask|none` overrides `consent` (`band`, the 0.5 name for `confirm`, also works there), which helps in headless runs.

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
- Each prompt waits about a second for the read while the router is deciding or provisional (at most `decideWithin` prompts per session). If the read times out (`classifyTimeoutMs`), that turn goes at the current level; a late answer is ignored.
- The router changes effort only, never the model. A request to a model that takes no effort is left alone.
- Each automatic read is one Haiku call per prompt while deciding or provisional, for at most `decideWithin` prompts, of at most `classifierMaxChars` of transcript. Nothing more is spent once a level is locked or the budget is spent, except when you run `/route`.
- Once locked, the router does not notice a change of phase on its own (for example "now verify it" after an implementation). Run `/route` (or the footer's Suggest now), optionally with a hint, to get a switch offered.
- A definition's `effort:` is respected for user and project agent files and for the `agents` key in settings, not for plugin agents (`<plugin>:<name>`), which can't be located reliably. Those are routed from their brief, which replaces any effort their definition sets. A mod's `$.agent.register({ effort })` is ignored by the engine itself (an engine bug), and the router routes those agents too.
- An agent file added or edited mid-session is seen from the next session: definitions are scanned once per session.
- Workflow agents that don't launch through the Agent tool raise no `agent.spawn`, so they keep the main thread's level.
- Subagent levels are kept in memory only. After a restart or resume, a subagent still running from before takes the main thread's level.
- The router adds no note about the chosen level to the system prompt, because changing a cached prompt section would break the prompt cache. The `/effort` echo tells the model instead, and it is appended to the transcript, so the cache holds.
- The band and footer draw in the terminal and the Desktop app. VS Code and `-p` run the hooks without the UI: under the default `apply` the router's level is still used (and locked when the budget runs out); `consent: none` locks at once; `/route off` hands back to the picker.

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
