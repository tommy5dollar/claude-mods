# effort-router

A Claude Code mod that sets a session's reasoning effort for you once the task is clear, then holds it.

It follows Anthropic's guidance in [Using Claude Code: Spending your effort](https://claude.dev/blog/spending-your-effort/) (Thariq Shihipar, 25 September 2026). The article found that effort buys verification and edge-case testing, not a better approach. Low effort suits quick in-the-loop work. Medium suits ordinary feature work. High suits verification and bug fixes in existing code. Max suits fully autonomous hard problems.

Requires Claude Code 2.1.287 or later (Claude Mods).

## The three states

The footer, beside the native model and effort pickers, always shows one of three states:

| State | Footer | What it means |
| --- | --- | --- |
| Deciding | `medium · deciding` (dim) | The router is watching. Nothing is fixed, so the level in use (here medium) is the picker's |
| | `medium → high?` | The router suggests high and is waiting for you (the band above the prompt has the buttons) |
| Fixed | `high 🔒` | Every request and subagent runs at high, the level you accepted. `/route` says why |
| Off | `router off` (dim) | The router does nothing. The picker decides |

<!-- screenshot: footer showing "medium · deciding" beside the gauge and the native pickers -->
<!-- screenshot: footer showing "high 🔒" -->

The footer label is itself a dropdown. Open it to choose:

- `Accept high` and `Not now`: shown first while the router is suggesting a level
- `Let the router decide` (or `Decide again` when a level is fixed): go back to deciding
- `Router off — use the effort picker`: hand effort back to the picker

The router never sets a level you pick by hand: that is what the native effort picker is for. To run at a specific level, turn the router off and use the picker; with the router off, every request goes out at the picker's level. The one exception is the band at consent time, where you can take a different level than the one suggested (`2: medium` instead of `1: Lock high`).

The closed dropdown shows the current state, so the option you're on reads `medium · deciding`, `high 🔒` or `router off`.

<!-- screenshot: the open footer dropdown -->

## How it works

1. **Deciding.** While the task is unclear, the router leaves effort alone and the effort picker's level applies. Sessions often open with filler ("pull the latest code"), so the first message is not enough.
2. **Reading.** After each prompt you type, a small model (Haiku by default) reads the transcript so far. It sees your prompts in full, Claude's replies truncated and tool calls as names only. It answers "undecided" or a level with a one-line reason, using the [routing rules](#customising-the-rules), and it is told to stay undecided until the real task is clear. The read runs beside your turn and never holds your prompt up.
3. **Consent.** With the default `band` consent, the router offers the level in the band above the prompt: `Route this session at HIGH — bug fix in existing code`, with buttons `1: Lock high`, `2: medium`, `3: low`, `4: max` and `x: Not now`. A digit typed in an empty prompt presses a button. The turn carries on at the picker's level meanwhile, and a click applies from the very next model request, even mid-turn. "Not now" stays deciding and does not ask again for 5 prompts.
4. **Fixed.** Every later model request in the session runs at the fixed level, subagents included. The classifier is not called again. In the terminal the router also runs `/effort <level>` once the session is idle, so the native picker label matches. In the Desktop app the picker belongs to the app, not the engine, so its label stays where you set it; the footer shows the level actually in use (verified: Desktop's transcript records `effort: high` on every request after a fix while the picker still reads Medium).

A fixed level survives `claude --resume`.

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
| `/route` | Shows the state and why (`router: bug fix in existing code`, or `you chose medium over the suggested high` after picking another level in the band) |
| `/route decide` | Unfixes the level and lets the router decide again from the transcript so far |
| `/route off` | Turns the router off and restores the picker's earlier level |
| `/route rules` | Prints the effective rules and which layers contributed |
| `/route rules init [user\|project]` | Writes a starter rules file that keeps the defaults |
| `/route rules critique` | Asks Sonnet to critique your custom rules |

`/route` is registered with `$.command.register`, so it shows in the typeahead. State is per session. The 0.1 names `/route auto` and `/route pin picker` still work as hidden aliases. There is no command to set a level: turn the router off and use the effort picker.

## Options

Set them in `/config`, or under `pluginConfigs["effort-router@tommy-mods"].options` in settings.json.

| Option | Default | Meaning |
| --- | --- | --- |
| `consent` | `band` | `band` offers buttons above the prompt. `ask` asks a blocking question before the turn runs, and is skipped where nobody can answer (`-p`). `none` fixes the level without asking |
| `snoozePrompts` | 5 | Prompts to wait after "Not now" |
| `maxReads` | 8 | Most classifier reads while undecided |
| `classifierModel` | `haiku` | The model that reads the transcript |
| `syncPicker` | true | Run `/effort <level>` so the terminal's picker label matches |
| `footerControl` | `select` | `select` makes the footer label a dropdown. `label` draws plain text, and `/route` is the control |
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
- `allowOff: false` stops users turning the router off, so the organisation's routing always applies. `/route off` refuses, the footer dropdown has no `Router off`, and a session saved as off comes back deciding. `/route decide` still works.

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
- The prompt that triggers the decision usually sends its first request before the classifier answers (about a second later), so that one request goes at the picker's level. Every request after the level is fixed is covered.
- The router changes effort only, never the model. A request to a model that takes no effort is left alone.
- Each read is one Haiku call per prompt while undecided, capped by `maxReads`. Nothing more is spent once a level is fixed.
- The router does not notice a change of phase (for example "now verify it" after an implementation). Use `/route decide`, or turn the router off and set the picker. Suggesting a new level would need a classifier call on every prompt, so it is left as future work.
- The router adds no note about the chosen level to the system prompt, because changing a cached prompt section would break the prompt cache. The `/effort` echo tells the model instead, and it is appended to the transcript, so the cache holds.
- The band and footer draw in the terminal and the Desktop app. VS Code and `-p` run the hooks without the UI, so use `consent: none` there, or `/route off` and the picker.

## Development

```
bun test                            # pure policy: trimming, parsing, rule layering, /route grammar
claude plugin test .                # engine kit: band, buttons, footer dropdown, turn.step, /route, org layers
claude plugin validate . --strict
```

[TESTING.md](TESTING.md) lists the live checks.

## Licence

MIT
