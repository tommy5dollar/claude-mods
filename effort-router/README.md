# effort-router

A Claude Code mod that sets a session's reasoning effort for you once the task is clear, then holds it.

It follows Anthropic's guidance in [Using Claude Code: Spending your effort](https://claude.dev/blog/spending-your-effort/) (Thariq Shihipar, 25 September 2026). The article found that effort buys verification and edge-case testing, not a better approach. Low effort suits quick in-the-loop work. Medium suits ordinary feature work. High suits verification and bug fixes in existing code. Max suits fully autonomous hard problems.

Requires Claude Code 2.1.287 or later (Claude Mods).

## The states

The footer, right beside the native model and effort pickers, shows the router's state. It leaves out the level in use, because the effort picker a few pixels away already shows it.

| Footer | What it means | Band buttons |
| --- | --- | --- |
| `deciding` (dim) | The router is watching. Nothing is locked, so the picker's level applies | `Suggest now`, `Turn off` |
| `high?` | The router suggests high and is waiting for you. The band opens by itself | `Accept high`, `Turn off` |
| `high 🔒` | Locked: every request and subagent runs at high | `Suggest now`, `Turn off` |
| `high 🔒 → low?` | Locked, and a manual `/route` suggests switching to low. The band opens by itself | `Accept low`, `Keep high`, `Turn off` |
| `off` (dim) | The router does nothing; the picker is in charge | `Turn on` |

<!-- screenshot: footer showing "deciding" beside the gauge and the native pickers -->
<!-- screenshot: footer showing "high?" with the band above the prompt -->

The footer state is a plain button. Pressing it opens the router's band above the prompt: one line such as `Effort router: high 🔒 — router: bug fix in existing code`, then that state's buttons and `Close` (hotkey `x`). The buttons are numbered `1`, `2`, `3`. Any action closes the band, and pressing the footer again closes it too. A new suggestion opens the same band by itself; `Close` hides it while the suggestion stays pending in the footer.

The footer is a button, not a dropdown, because the Desktop app silently drops a `Select` in the footer: it is not drawn, and nothing reports an error (verified live on the 2.1.286 app; the test kit accepts it, so the kit cannot catch this). The footer truncates with `…` when space runs out, so the label stays short.

The router never sets a level you pick by hand: that is what the native effort picker is for. To run at a specific level, turn the router off and use the picker; with the router off, every request goes out at the picker's level.

## How it decides

- **After each prompt you type, and after you answer Claude's multiple-choice questions** (AskUserQuestion on the main thread), while it is deciding or a suggestion is pending, a small model (Haiku by default) reads the whole conversation again. It sees your prompts in full, Claude's questions with your answers, Claude's replies truncated (the last one less so) and other tool calls as names only. Answered questions count toward the budget like a prompt. The read runs beside your turn and never holds it up.
- **Undecided only before there is a task.** The model answers "undecided" only for opening filler: greetings, housekeeping such as "pull the latest code", or questions before any work. Once you state a real task it suggests the level that task most likely needs, even while the details are open ("implement a finance solution pulling from several accountancy platforms" gets `high?` straight away), and later reads refine it. The prompt carries ten worked examples on top of the [routing rules](#customising-the-rules).
- **The latest exchange counts most.** A later clarification overrides an earlier ask, and a short reply is read against the question it answers. Say "refactor the payment retry logic" and the router may suggest `high?`; if Claude then asks "1. full rewrite or 2. just extract the constant?" and you answer "2", the next read can move the suggestion to `low?`. A read that finds nothing clear withdraws the suggestion. Closing or ignoring the band is the natural "not yet".
- **Accept locks.** Every later request in the session, subagents included, runs at the locked level, and the router stops reading. In the terminal it also runs `/effort <level>` once the session is idle, so the native picker label matches. In the Desktop app the picker belongs to the app, so its label stays where you set it; trust the footer (verified: Desktop's transcript records `effort: high` on every request after a lock while the picker still reads Medium). A lock survives `claude --resume`.
- **It gives up after `decideWithin` prompts** (6 by default). If nothing is locked by then it stops reading and never calls the model again on its own. A pending suggestion stays pending; otherwise the router turns off with the reason `no clear task after 6 prompts — /route to ask again`.
- **`/route` asks now.** It reads the whole conversation in any state, ignoring the budget, and goes through the same consent. Add a hint to steer it: `/route this is a security review`, `/route keep it quick`. The hint is weighed strongly and kept for re-reads while that suggestion is pending. If the router still finds no clear task, it says so and changes nothing. While locked, a different answer offers a switch in the band (`high 🔒 → low?`, with `Accept low`, `Keep high` and `Turn off`); the same answer just confirms. The band's `Suggest now` is the same as bare `/route`.
- **Consent.** `band` (default) opens the band with the suggestion; nothing changes until you accept. `ask` asks a blocking question whenever a new level is suggested. `none` locks at once.

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
| `/route status` | Shows the state and why, automatic reads used of the budget, classifier calls, the last verdict (with the raw reply and when) and the last error |
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
| `consent` | `band` | `band` offers the level in the band above the prompt. `ask` asks a blocking question when a new level is suggested (skipped where nobody can answer, such as `-p`). `none` locks without asking |
| `decideWithin` | 6 | Prompts the router reads automatically before it stops |
| `classifierModel` | `haiku` | The model that reads the transcript |
| `syncPicker` | true | Run `/effort <level>` so the terminal's picker label matches |
| `footerControl` | `button` | `button` makes the footer state a button that opens the band. `label` draws plain text, and `/route` is the control |
| `rules` | empty | Rules text for your user layer. A rules file takes precedence |

The environment variable `EFFORT_ROUTER_CONSENT=none|ask|band` overrides `consent`, which helps in headless runs.

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

The files are re-read on every classification, so edits apply without a reload. An unreadable file is skipped. The frame around the rules (wait until the task is clear, reply in JSON) is fixed, so no rules file can break the parser.

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
- `allowOff: false` stops users turning the router off, so the organisation's routing always applies. `/route off` refuses, the band has no `Turn off`, and a session saved as off comes back deciding. When the budget runs out with nothing suggested, the router idles as `deciding` (no more reads) instead of turning off. `/route` still works.

A top-level `"effortRouter": { "rules": ..., "rulesMode": ..., "allowOff": ... }` object works too. The router reads these three settings only from the policy source, so a user cannot claim `enforce` for themselves.

## Install

```
claude plugin marketplace add tommy5dollar/mods
claude plugin install effort-router@tommy-mods
```

For development, run `claude --plugin-dir ./effort-router`.

## Known limits

- In the Desktop app the native effort picker never changes: the app owns it and nothing a mod can call sets it. The requests still go out at the routed level; trust the footer label.
- In the terminal the router can't set the picker label directly either. It runs `/effort <level>` when the session is idle, which prints a line in the transcript, and the footer shows the true level until then. Headless (`-p`) runs skip the sync because its output would replace the run's printed result. The per-request override still applies there.
- The prompt that triggers the decision usually sends its first request before the classifier answers (about a second later), so that one request goes at the picker's level. Every request after the lock is covered.
- The router changes effort only, never the model. A request to a model that takes no effort is left alone.
- Each automatic read is one Haiku call per prompt while deciding or suggesting, for at most `decideWithin` prompts. Nothing more is spent once a level is locked or the budget is spent, except when you run `/route`.
- Once locked, the router does not notice a change of phase on its own (for example "now verify it" after an implementation). Run `/route` (or the footer's Suggest now), optionally with a hint, to get a switch offered.
- The router adds no note about the chosen level to the system prompt, because changing a cached prompt section would break the prompt cache. The `/effort` echo tells the model instead, and it is appended to the transcript, so the cache holds.
- The band and footer draw in the terminal and the Desktop app. VS Code and `-p` run the hooks without the UI, so use `consent: none` there, or `/route off` and the picker.

## Development

```
bun test                            # pure policy: trimming, parsing, rule layering, /route grammar
claude plugin test .                # engine kit: band, buttons, footer button, turn.step, /route, org layers
claude plugin validate . --strict
bun run eval                        # opt-in: the real classifier over eval/fixtures.ts (see below)
```

`bun run eval` sends each fixture's transcript to the real model through `claude -p --safe-mode` (no plugins or hooks, no tools), with exactly the system prompt and transcript the router builds from `rules/default.md`. It parses the reply with the router's own parser and prints each verdict, the pass rate and every miss. `--runs 3` repeats each fixture (the model is not deterministic), `--model sonnet` tries another model and `--only <text>` filters fixtures by name. It uses your Claude Code login, and each fixture costs one small model call.

[TESTING.md](TESTING.md) lists the live checks.

## Licence

MIT
