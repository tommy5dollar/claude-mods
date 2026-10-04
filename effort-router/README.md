# effort-router

A Claude Code mod that checks your session's reasoning effort against the task once the task is clear, asks before changing it, then holds it. Each subagent gets its own level, chosen by the agent that launches it.

It follows Anthropic's guidance in [Using Claude Code: Spending your effort](https://claude.dev/blog/spending-your-effort/) (Thariq Shihipar, 25 September 2026). The article found that effort buys verification and edge-case testing, not a better approach. The router gives your session's model those principles and sourced notes on what each level can do on that model, then lets it judge. It never maps a kind of task to a fixed level, because level names mean different things on Opus, Sonnet and Fable.

Requires Claude Code 2.1.287 or later (Claude Mods).

## The rule

Your effort picker's level is the default. After each prompt, until the task is clear, your session's own model looks at the conversation and names the level the task needs, with how sure it is. Then:

- **No clear task yet, or not sure enough:** the turn runs at your picker's level, and the next prompt is checked again.
- **The router names your picker's level:** the turn runs, and that level is kept for the session.
- **The router names a different level:** the turn runs at the router's level, which is kept for the session. The band above the prompt opens once to say so, with why, and a button to stop routing and go back to your setting.

Either way, once a level is kept the session is decided and the router stops checking by itself. `Reassess` in the band, or `/route`, asks again.

With consent `ask`, a different level waits for your answer instead. Claude's own question card asks "Effort router: Multi-platform finance integration. Use high effort instead of medium?", with any levels in between as options too. `Use high` runs the turn at high and keeps high. `Keep medium` runs it at medium and keeps medium. If you dismiss the question, the turn runs at your picker's level, the router stays undecided, and a later prompt can ask again.

## The states

The footer, right beside the native model and effort pickers, shows the router's state. It leaves out the level in use, because the effort picker a few pixels away already shows it.

| Footer | What it means | Band buttons (press the footer) |
| --- | --- | --- |
| `deciding` (dim) | The router is reading your prompts. Requests run at the picker's level | `Assess now`, `Stop routing (back to medium)` |
| `high?` | The question is open: the turn waits for your answer | `Assess now`, `Stop routing (back to medium)` |
| `using high` | Decided: every main-thread request runs at high, and the router stops checking by itself | `Reassess`, `Stop routing (back to medium)` |
| `off` (dim) | The router does nothing; the picker is in charge | `Start routing` |

`Stop routing` turns the router off for this session: no more checks, subagents aren't routed and your effort setting (named in the button) applies again. `/route` still answers, and `Start routing` or `/route on` starts it again. New sessions are routed as usual.

<!-- screenshot: footer showing "deciding" beside the gauge and the native pickers -->
<!-- screenshot: the question card "Effort router: ... Use high effort instead of medium?" with the footer reading "high?" -->

The footer state is a plain button. Pressing it opens the router's band above the prompt: a line such as `Effort router: using high for this session (bug fix in existing code). The crash needs tracing through the parser, but the fix is local.`, then the buttons and `Hide` (hotkey `x`). The words in brackets are what the check took the task to be, and the sentence after is why it chose that level. The buttons are numbered `1`, `2`. Any action closes the band, and pressing the footer again closes it too. With consent `ask` the band never opens by itself: the question card is where you agree.

With consent `auto` (the default) the router doesn't ask. When it keeps a level that differs from your picker's, the band opens by itself once, reading `Effort router: using high for this session (<task>). <why>` with `Stop routing (back to medium)` and `Hide` (keep high). Pressing the footer shows the same band as under `ask`.

The footer is a button, not a dropdown, because the Desktop app silently drops a `Select` in the footer: it is not drawn, and nothing reports an error (verified live on the 2.1.286 app; the test kit accepts it, so the kit cannot catch this). The footer truncates with `…` when space runs out, so the label stays short.

The router never sets a level you pick by hand: that is what the native effort picker is for. To run at a specific level, turn the router off and use the picker; with the router off, every request goes out at the picker's level.

## Why the question is Claude's own question card

The router can only learn your picker's level from the request itself. `e.effort` in the `turn.step` hook, as the request arrives, is the engine's level for it. Nothing else shows it: the config list has no effort row, and a session's first prompt is submitted before any request exists. So the comparison, and the question, happen when the turn's request is about to go out.

A `turn.step` hook that waits on an ordinary promise is abandoned after about 10 seconds, and the request goes out without it. A call into the engine (`$.ui.ask`, which draws Claude's own AskUserQuestion card) doesn't count against that limit. Verified live on Desktop 2.1.286: the request was held for 23.6 seconds until the answer came, then went out at the chosen level. A button in the band would leave nothing to wait on, so the question has to be the card.

## How it decides

- **Before your prompt runs.** While the router is deciding, each prompt you send waits for one check before the turn starts. It happens at most `decideWithin` times per session. If the check takes longer than `classifyTimeoutMs` (15 s) or fails, the turn runs at the picker's level and `/route status` shows why.
- **Checks run on your session's model.** The model you chose to work in judges the task, because it judges better than a small model and the savings from getting the level right scale with it. From the second prompt on, a check is a fork of the conversation: the session's own request (system prompt, tools, CLAUDE.md, memory and the whole conversation) with one question added, served from the session's prompt cache. Measured on Opus 5.5 with a 72k-token conversation: 1.6 s, the whole conversation read from cache, about 2.8k fresh input tokens and 40 output tokens, so about 3 cents. The fork runs at the effort the session last used.
- **The first prompt is a separate call.** Before the session has sent anything there is no request to fork, and a mod can't build one with Claude Code's system prompt and tools. So the first check is one call to the same model with your CLAUDE.md files, rules and memory (as Claude Code hands them to the conversation) and your prompt, at the model's default effort. It isn't cached: about 13k tokens with a large set of instructions, so roughly 5 cents on Opus 5.5 or 13 cents on Fable 5.1, once per session (1.4 s measured). `firstCheckInstructions: false` sends only the prompt. A prompt sent while a turn is still running isn't checked (that case hasn't been tested live); the next prompt is.
- **How sure it is.** Each check gives a level and a confidence from 0 to 1. The router acts only when a check is at least `confidence` sure (0.7 by default). Below that it changes nothing and checks again after your next prompt, which by then carries more of the conversation. The bar is a starting point: every check's level, confidence and outcome is kept in the spend ledger, so the bar can be set from how often a confident level was kept or overruled.
- **Up to xhigh.** The router picks up to `highestLevel`, xhigh by default, and the checks aren't offered max: on all three models max rarely beats xhigh and can overthink. Set `highestLevel` to `max` to allow it.
- **The levels in between.** When the router's level is two or more away from yours, the question offers the levels in between too: from medium, a check that picks xhigh asks `Use xhigh`, `Use high` or `Keep medium`.
- **Another check model.** Set `classifierModel` to another supported model (`opus`, `sonnet` or `fable`) for separate calls that read a shortened copy of the conversation. Haiku is never used: any other name falls back to your session's model.
- **Compared at the first request.** The read's level waits for the turn's first request, where your picker's level is known, and the rule above applies there. The comparison uses the level as it reached the router, before the router changes anything, so it is always your picker's.
- **Your answers count too.** Answers to Claude's multiple-choice questions (AskUserQuestion on the main thread) are part of the conversation the next check sees. The router checks again before the answers go back to Claude, the turn's next request applies the rule, and answered questions count toward the budget like a prompt. On the session's model that check is a fork carrying your answers, and a fork mid-turn reads the cache like any other.
- **What it reads.** A fork sees exactly what the session's model sees. A separate call (the first prompt, or another `classifierModel`) reads your prompts in full, Claude's questions with your answers, Claude's replies truncated (the last one less so) and other tool calls as names only, capped at `classifierMaxChars` (24,000). Over the cap it keeps your first prompt (the original task), then the newest lines, your prompts and answers before Claude's replies. `/route status` says how much the last read sent.
- **Undecided only before there is a task.** The model answers "undecided" only for opening filler: greetings, housekeeping such as "pull the latest code", or questions before any work. Once you state a real task it picks the level that task most likely needs, even while the details are open. The prompt's worked examples teach reading the conversation (filler, a narrowed scope, a short reply to a numbered question, answered questions), and none of them names a level.
- **The latest exchange counts most.** A later clarification overrides an earlier ask, and a short reply is read against the question it answers. If you dismissed the question for "refactor the payment retry logic" and then answer Claude's "1. full rewrite or 2. just extract the constant?" with "2", the next read names low.
- **Decided is decided.** Once a level is kept, every later main-thread request runs at it and the router stops reading. Subagents get their own level ([below](#subagents)). When the kept level isn't the picker's, the terminal also runs `/effort <level>` once the session is idle, so the native picker label matches. In the Desktop app the picker belongs to the app, so its label stays where you set it; trust the footer. A kept level survives `claude --resume`. Choosing `Keep medium` keeps medium even if you move the picker later; `/route off` hands control back to the picker.
- **It stops after `decideWithin` prompts** (6 by default), counted from the start of the session. If nothing is decided by then, the router turns off with the reason `no clear task after 6 prompts`, or `not sure enough after 6 prompts, last check high at 65%` when the checks named a level they weren't sure of, after asking any question still waiting. It never calls the model again on its own.
- **Existing sessions are left alone.** The first time the router sees a session that already has `decideWithin` or more prompts in it, or more than `skipAboveTokens` (20,000) tokens of conversation (a long chat from before the router was installed, say), it starts `off` with the reason `session started before the router`: no question, no model calls. Fewer earlier prompts count toward the budget. A resumed session with saved router state keeps that state.
- **`/route` asks now.** It reads the whole conversation in any state, ignoring the budget. If the answer is the level already in use, it says so and changes nothing. If it is your picker's level while a different one is kept, it keeps the picker's level without asking. Otherwise the question card opens straight away ("Use low effort instead of high?", naming the level in force now, with any levels in between), and your answer is kept. Add a hint to steer it: `/route this is a security review`, `/route keep it quick`. The hint is weighed strongly and kept for later reads until a level is kept. The band's `Assess now` (`Reassess` once decided) is the same as bare `/route`: it asks the session's model, so it takes a couple of seconds and uses your plan like any request. The footer reads `checking…` while it runs, then the band shows what it found ("high still fits (bug fix, 90% sure). Nothing changed.") until you hide it.
- **Consent `ask`.** If you'd rather approve each change: a level other than your picker's waits on the question card. Set it in `/plugin configure`, or with `EFFORT_ROUTER_CONSENT=ask`. Headless runs (`-p`) have no one to answer, so leave them on `auto`.

## Models

The router supports the current models: Fable 5.1, Opus 5.5 and Sonnet 5.5. Level names don't mean the same amount of thinking on each, and each responds to effort differently. In Claude Code, Opus 5.5 and Sonnet 5.5 default to medium and Fable 5.1 to high. Opus 5.5 gains most from low to medium and little above high, while Sonnet 5.5 gains a lot at every step. Routing one like another would be a mistake. Each has a notes file in [`rules/models/`](rules/models/) on what each level can do there: what it's good for, what it misses, and measured gains and costs. Every check carries the notes for the session's model (or the subagent's) after the routing rules, as the main guide to the level. `/route rules` prints them. The evidence behind each note, with sources, is in [`rules/models/research-2026-10.md`](rules/models/research-2026-10.md).

The notes guide the level instead of fixed rules because of an eval on 4 October 2026. With rules that tied kinds of task to levels, all three models gave almost the same answers and ignored their notes: Sonnet kept picking max for autonomous work, though its evidence says xhigh. Without those rules, each model's answers moved the way its evidence predicts (`TESTING.md`, "Prompt variants").

On any other model the router stands aside: the footer reads `off`, `/route status` says which models it works with, and no checks run. Its state is kept, so switching back with `/model` picks up where it was. A new model needs a new version of the router.

## Subagents

Each subagent gets its own level, chosen by the agent that launches it.

- **Its parent decides.** When Claude launches a subagent, the launch waits for one fork of the parent's conversation, asked which level the subagent needs, with its brief (capped at `classifierMaxChars`). The parent knows the task and why it's delegating this part, which a brief alone often doesn't say. Then the subagent starts, and every request it makes carries that level. Measured on Opus 5.5: 2.3 to 3.3 s, the parent's conversation read from cache, about 2 cents. With another `classifierModel` it's a separate call that reads the brief alone.
- **On its own model.** The check is told which model the subagent runs on (the Agent call's model, else its definition's, else the parent's) and gets that model's notes. A subagent has no user in the loop, and the check always picks a level. Your rules and your organisation's [rules](#customising-the-rules) apply here too.
- **Haiku agents are left alone.** A subagent on Haiku (the built-in Explore agent runs there) or on another model the router doesn't support isn't checked. Haiku takes no effort setting anyway.
- **An agent's own `effort:` wins.** If the agent's definition sets an effort, the router doesn't read its brief and leaves its requests alone, so the engine applies the definition's level. It looks for the definition by its frontmatter `name:` in the project's `.claude/agents/*.md`, then your `~/.claude/agents/*.md`, and in the `agents` key of policy, project and user settings. The first definition with that name decides, as it does for the engine: a project definition without `effort:` still beats a user one with it. Definitions are scanned once per session. `/route status` shows such an agent as `low: <description> (set by its agent definition)`.
- **Forks and failures take the parent's level.** A fork shares its parent's context, so it skips the read. If a read fails, times out (`classifyTimeoutMs`) or returns something unusable, the subagent also takes its parent's level. That is the main thread's level in use, or for a subagent launched by another subagent, that subagent's level. With no level anywhere, its requests are left alone.
- **It runs even when the main thread is left alone.** In an existing session the router leaves the main thread alone, but each new subagent brief is a fresh, whole task, so subagents are still routed. The same holds after the router turns itself off with no clear task. When you turn the router off yourself (`/route off` or `Stop routing`), subagents go back to the picker's level too, and `/route on` brings their routed levels back.
- **Seeing it.** `/route status` lists this session's routed subagents, newest first (the last 10), with level, description, agent type and why. The debug log has one line per routed launch. Nothing is added to the footer or to the parent's conversation.

Claude can't set a subagent's effort itself today: the Agent tool takes a model but no effort, so without the router every subagent runs at the session's level unless its agent definition sets one. Set `routeSubagents` to `false` to go back to that (the main thread's level in use, as before 0.7.0).

## Where the effort went

`/route report` shows what your requests spent at each level over the last 7 days. `/route report session`, `month` or `all` cover other spans. For example:

```
Effort for the last 7 days (since 2026-09-28): 412 requests in 9 sessions, 610k output tokens.
By level:
  low: 120 requests, 31k output tokens (avg 258)
  medium: 260 requests, 410k output tokens (avg 1.6k)
  high: 32 requests, 169k output tokens (avg 5.3k)
Changed by the router: 74 requests
  subagents, medium → low: 44 requests, 9.9k output tokens (avg 225, vs 1.6k for those left at medium)
  main conversation, medium → high: 30 requests, 160k output tokens (avg 5.3k, vs 1.6k for those left at medium)
The router's own checks: 61 (9 of a first prompt, 14 of a conversation, 38 for subagents), using 3.1k output and 1.20M input tokens.
By repo (output tokens): payments 400k, web 210k.
No "saved" figure: the router lowers easy tasks and raises hard ones, so these averages can't show what a changed request would have cost.
```

- **What it records.** Every model request in every session with the router installed (0.9.0 on), on the main thread and in subagents, with the router on or off. For each one it keeps the level the request arrived at (your picker's, or the level a subagent would have inherited), the level it went out at, and its tokens as the API reported them. Requests are summed per day into one small JSON file per session, in `~/.claude/effort-router/spend/`. The file is written when a turn ends, and nothing leaves your machine.
- **What it shows.** Requests and output tokens per level, with the average per request. The requests the router moved, by thread and direction, each beside the average request left at the level it came from. Requests whose agent definition set their level. The router's own checks, by kind, so its cost is in the same report. Each session check's level, confidence and outcome is kept in the file too, for setting the confidence bar later. Over more than one session, output by repo.
- **Why output tokens.** Output (thinking plus the answer) is what effort changes most. Input is recorded too.
- **Why there is no "saved" figure.** The router lowers easy tasks and raises hard ones. A lowered request is small partly because its task was small, so comparing it with the average medium request would overstate the saving, and the same comparison would overstate what a raised request cost extra. Only running the same task at both levels can say what a request would have cost at its old level. The report gives the measured numbers side by side and leaves that estimate out.

## Policy

The shipped rules ([`rules/default.md`](rules/default.md)) are principles, not a table of levels:

- Effort buys verification, edge-case testing and independent judgement, not a better approach.
- Weigh how much is hidden (edge cases, existing code, money, several external systems, concurrency, security), whether you're in the loop, how well specified the task is, and how big it is.
- Pick the level that does the work well on this model without paying for thinking it won't use.

They come from the article above and Anthropic's effort docs. What each level can do comes from the [model notes](#models).

## Commands

| Command | What it does |
| --- | --- |
| `/route` | Runs the router now over the whole conversation, in any state, and asks if its level differs |
| `/route <hint>` | The same, with a hint for the classifier (`/route this is a security review`) |
| `/route status` | Shows the state and why, the consent mode, automatic reads used of the budget, classifier calls and how long the last read took, how much transcript it sent, the last verdict (with the raw reply and when), the last error, and this session's routed subagents |
| `/route report [session\|week\|month\|all]` | Shows [where the effort went](#where-the-effort-went): requests and output tokens per level, what the router moved, its own reads, and output by repo. The last 7 days by default |
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
| `consent` | `auto` | When the router wants a different level from your picker: `auto` uses the router's level without asking and shows it once in the band, with a button to stop routing. `ask` holds the turn and asks (Use the router's level, a level in between or Keep yours) |
| `decideWithin` | 6 | Prompts (and answered questions) the router reads automatically, counted from the session's start |
| `classifyTimeoutMs` | 15000 | How long a prompt waits for the check before it runs anyway |
| `classifierMaxChars` | 24000 | Most transcript characters a separate check sends |
| `classifierModel` | `session` | `session`: your session's own model, as a fork from the second prompt. Or another supported model (`opus`, `sonnet`, `fable`) for separate checks. Haiku is never used |
| `highestLevel` | `xhigh` | The highest level the router picks. `max` allows max, which rarely beats xhigh on the current models |
| `confidence` | 0.7 | How sure (0 to 1) a check must be before the router acts on it. 0 acts on any level |
| `skipAboveTokens` | 20000 | A session first seen with more conversation than this keeps your effort setting |
| `firstCheckInstructions` | true | Send your CLAUDE.md files, rules and memory with the first prompt's check. `false`: the prompt only |
| `syncPicker` | true | Run `/effort <level>` so the terminal's picker label matches |
| `routeSubagents` | true | Give each subagent its own level, chosen at launch by the agent starting it. `false`: subagents run at the main thread's level |
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
- `allowOff: false` stops users turning the router off, so the organisation's routing always applies. `/route off` refuses, the band has no `Stop routing`, and a session saved as off comes back deciding. When the budget runs out with nothing suggested, the router idles as `deciding` (no more reads) instead of turning off. `/route` still works.

A top-level `"effortRouter": { "rules": ..., "rulesMode": ..., "allowOff": ..., "routeSubagents": ... }` object works too. The router reads these four settings only from the policy source, so a user cannot claim `enforce` for themselves.

## Install

```
claude plugin marketplace add tommy5dollar/claude-mods
claude plugin install effort-router@tommy-mods
```

There's nothing to configure: every option has a default. `/plugin configure` lists the options as not yet set, which just means the defaults apply. Change one only when you want something different (see [Options](#options)).

For development, run `claude --plugin-dir ./effort-router`.

## Known limits

- In the Desktop app the native effort picker never changes: the app owns it and nothing a mod can call sets it. The requests still go out at the routed level; trust the footer label.
- In the terminal the router can't set the picker label directly either. It runs `/effort <level>` when the session is idle, which prints a line in the transcript, and the footer shows the true level until then. Headless (`-p`) runs skip the sync because its output would replace the run's printed result. The per-request override still applies there.
- Each prompt waits for the check while the router is deciding (at most `decideWithin` prompts per session): about 1.5 s on Opus 5.5, longer on a model that thinks more by default. If the check times out (`classifyTimeoutMs`), that turn goes at the picker's level; a late answer is ignored.
- The first prompt's check can't share the session's prompt cache: the engine offers no way to fork before the first response, and a separate call can't carry Claude Code's system prompt or tools. It pays for your instructions and the prompt once per session. Claude Code also never reuses the cache for the conversation part of a session's first request, so the first fork after a one-request first turn pays for about 13k tokens again.
- On Bedrock, Google Cloud or an LLM gateway, Claude Code clears the cached conversation when effort changes (Anthropic's docs). A locked level that differs from your setting changes effort once, so expect one uncached request there. With an API key or a subscription the cache is kept.
- The confidence bar (0.7) is a starting guess, not calibrated yet. The ledger keeps every check's confidence and outcome for that.
- A fork answers at the effort the session last used, and the router can't change it.
- A request whose picker level is a number rather than a named level, or a model that takes no effort, can't be compared, so the waiting verdict waits for the next request that can.
- The router changes effort only, never the model. A request to a model that takes no effort is left alone.
- Each automatic check is one call per prompt while deciding, for at most `decideWithin` prompts. Nothing more is spent once a level is locked or the budget is spent, except when you run `/route`. `/route report` shows what the checks cost.
- Once decided, the router does not notice a change of phase on its own (for example "now verify it" after an implementation). Run `/route` (or the band's `Reassess`), optionally with a hint, to be asked again.
- A definition's `effort:` is respected for user and project agent files and for the `agents` key in settings, not for plugin agents (`<plugin>:<name>`), which can't be located reliably. Those are routed from their brief, which replaces any effort their definition sets. A mod's `$.agent.register({ effort })` is ignored by the engine itself (an engine bug), and the router routes those agents too.
- An agent file added or edited mid-session is seen from the next session: definitions are scanned once per session.
- Workflow agents that don't launch through the Agent tool raise no `agent.spawn`, so they keep the main thread's level.
- Subagent levels are kept in memory only. After a restart or resume, a subagent still running from before takes the main thread's level.
- The router adds no note about the chosen level to the system prompt, because changing a cached prompt section would break the prompt cache. The `/effort` echo tells the model instead, and it is appended to the transcript, so the cache holds.
- The spend report starts at 0.9.0: sessions from before it aren't in it. A request with no reported usage (failed or interrupted) isn't counted. Days are UTC.
- The band and footer draw in the terminal and the Desktop app. VS Code and `-p` run the hooks without the UI. Under `ask` in `-p` the question has no one to answer, so requests stay at the picker's level; set `consent` (or `EFFORT_ROUTER_CONSENT`) to `auto` there.

## Development

```
bun test                            # pure policy: trimming, parsing, rule layering, /route grammar, subagent reads, the spend ledger and report
claude plugin test .                # engine kit: band, buttons, footer button, turn.step, /route, org layers, agent.spawn, the ledger saved and reported
claude plugin validate . --strict
bun run eval                        # opt-in: the real classifier over eval/fixtures.ts (see below)
```

`bun run eval` sends each fixture to the real model through `claude -p --safe-mode` (no plugins or hooks, no tools), with the system prompt and input the router builds from `rules/default.md`: for the session read, a first check on the session's model (`--model`, default opus) at its default effort with that model's notes from `rules/models/`, and for a subagent's read, a separate call on the same model with that model's notes and the brief. It can't reproduce the forks that later checks and subagent reads make. It parses the reply with the router's own parser and prints each verdict, the pass rate and every miss. `--runs 3` repeats each fixture (the model is not deterministic), `--model sonnet` runs the session set as a Sonnet session, `--effort` sets the effort and `--confidence` the bar, `--set session` or `--set subagent` runs one set and `--only <text>` filters fixtures by name. It uses your Claude Code login, and each fixture costs one small model call.

[TESTING.md](TESTING.md) lists the live checks.

## Licence

MIT
