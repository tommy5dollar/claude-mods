# Testing effort-router

## Automated

```
bun test                            # 79 tests: trimming (incl. the last assistant message kept long and AskUserQuestion
                                    # questions and answers kept), the classifier input cap (first prompt, then human lines
                                    # before assistant text), reply parsing (incl. fenced json), the classifier frame,
                                    # $defaults layering, settings layers, /route grammar and hints, state: provisional
                                    # (apply), re-reads, Keep/Revert, budget locking, first sighting, status diagnostics;
                                    # subagents: the frame and contract, the brief prompt and its head-and-tail cap, reply
                                    # parsing (no undecided), the parent's level, user-off vs router-off, the status list;
                                    # agent definitions: frontmatter, effort values, name over file name, settings agents,
                                    # first definition wins, plugin agents skipped
claude plugin test .                # 40 tests in the engine's kit, among them: the read finishes before prompt.submit goes on
                                    # and turn.step index 0 carries the level (main loop and subagent); a re-read changes the
                                    # provisional level and reopens the band; Keep locks and syncs /effort; Revert restores the
                                    # picker level and turns off; budget exhaustion locks with a log line; a classifier that
                                    # hangs fails open at classifyTimeoutMs (mock clock); an existing session with 10 prompts
                                    # starts off with zero model calls; the classifierMaxChars cap; confirm/ask/none consents;
                                    # AskUserQuestion read before the tool result returns; the footer Button and band;
                                    # subagents: agent.spawn reads the brief before the agent starts and its turn.step
                                    # carries that level (others keep the main level); the brief cap; forks and nested forks
                                    # inherit; a throwing, hanging or unusable read falls back to the parent's level, a nested
                                    # one via parentAgentId; routeSubagents false; an existing session still routes them,
                                    # /route off stops it (and /route on brings it back); org routeSubagents false; a denied
                                    # spawn is not kept; a user definition with effort gets no read and its requests are left
                                    # alone; a project definition wins over a user one; a definition without effort is routed;
                                    # a file is matched by its name: (not file name); settings agents; plugin agents routed
"$APPDATA/Claude/claude-code/2.1.286/635c1867224a/claude.exe" plugin test .   # the same 40 under Desktop's engine
claude plugin validate . --strict
bun run eval -- --runs 3            # opt-in, real model: 22 session fixtures and 14 subagent briefs, see below
```

### Classifier eval (2026-10-04, haiku, `bun run eval -- --runs 3`)

0.5.2: `66/66 reads passed (100%); 22/22 fixtures passed every run`.

Against the 0.5.1 prompt and rules (same fixtures): `53/66 reads passed (80%); 17/22 fixtures passed every run`. The live miss reproduced 0/3: "implement for me a new finance solution pulling from multiple accountancy platforms" after "pull latest code" came back `undecided` every time, as did a vague feature, a vague bank-statement importer and the AskUserQuestion case (whose answers 0.5.1 reduced to a tool name).

Five fixtures (marked "held out") are not mirrored by the prompt's worked examples; several others are, so read 100% as "the examples are followed", not as a general accuracy figure.

### Subagent eval (2026-10-04, haiku, `bun run eval -- --runs 3`)

0.7.0: `subagent: 42/42 reads passed (100%); 14/14 fixtures passed every run`, and the session set unchanged at 66/66 (`all: 108/108`).

What came back: every mechanical brief (web research and tabulating, an Explore search, summarising a given file, running tests and reporting, listing npm scripts, extracting action items from given text) was low in all 3 runs. Adding translation keys in the existing format was low twice and medium once (both pass). Implementing rate limiting from a spec, debugging a failing test, the design proposal and the PR review were high every time. The security review was xhigh every time. The autonomous port with property tests was high every time, never max (high, xhigh or max pass). The vague "now do the same for the invoices table" was medium every time.

Read 100% with care. The fixtures were written alongside the subagent frame, several sit close to its worked examples (a codebase search, running a command, debugging, a security audit) and most expectations allow two levels. It shows the frame is followed and the mechanical/judgement split is stable, not general accuracy on real briefs. The live briefs in Tommy's transcripts are the next check.

The kit passes a `Select` in the SessionMode footer on both surfaces, but the real Desktop app (2.1.286) silently drops it, so the footer is a `Button`. Footer and band rendering on Desktop has to be checked live (steps 1, 3 and 8 below).

## Live, headless

### 0.6.0: the read happens before the turn (verified 2026-10-04, CLI 2.1.289)

```
claude -p --plugin-dir D:/code/mods/effort-router --model sonnet --tools "" --no-session-persistence --debug-file r.log "In two sentences: how would you fix an off-by-one bug in our invoice pagination loop that drops the last invoice on each page? No code."
grep "read settled\|prompt.submit settled\|effort-router: step" r.log
```

Two sonnet runs, verbatim:

```
effort-router: read settled in 836 ms (after a prompt): high (off-by-one bug fix in existing code)
hooks module effort-router@inline prompt.submit settled in 884.0ms (worker hop, next() included)
effort-router: step index=0 model=claude-sonnet-5-5 effort medium -> high

effort-router: read settled in 801 ms (after a prompt): high (bug fix in existing code)
hooks module effort-router@inline prompt.submit settled in 838.0ms (worker hop, next() included)
effort-router: step index=0 model=claude-sonnet-5-5 effort medium -> high
```

Three more runs with `--model haiku` as the main model settled their reads in 828, 783 and 727 ms. (Haiku requests carry no effort, so its steps log `undefined -> undefined`.) The cost is one Haiku read, under a second here, per prompt while deciding or provisional, for at most `decideWithin` prompts.

### 0.5 (verified 2026-10-04, CLI 2.1.289)

The router logs every request to the debug log as
`effort-router: step index=N model=M effort <sent by engine> -> <sent by router>`.

```
EFFORT_ROUTER_CONSENT=none claude --plugin-dir D:/code/mods/effort-router -p "hi, just getting set up. Reply with one word." --model sonnet --output-format json --debug-file r1.log
claude --plugin-dir D:/code/mods/effort-router -p "There's a bug in calc.js: add() returns the wrong result when the first argument is negative. Fix it in place." --resume <session_id> --model sonnet --permission-mode acceptEdits --debug-file r2.log
claude --plugin-dir D:/code/mods/effort-router -p "Thanks. What did you change?" --resume <session_id> --model sonnet --debug-file r3.log
grep "effort-router: \|effort locked" r*.log
```

Expected: r1 `classifier said {"decision":"undecided"}` and `medium -> medium`. r2 `classifier said {"decision":"lock","level":"high",...}` and `effort locked: high 🔒 (router: ...)`; under 0.6.0 its `step index=0` already logs `medium -> high`. r3 (a resumed session) `step index=0 ... medium -> high` with no classifier call.

## Live, interactive terminal (still to run by hand)

Run `claude --plugin-dir D:/code/mods/effort-router --model sonnet --debug-file router.log` in a scratch repo.

1. Footer: before any prompt, the footer next to the native effort picker reads `deciding` (dim). Pressing it opens the band: `Effort router: deciding — ...` with `1: Suggest now  2: Turn off  x: Close`. Press it again: the band closes.
2. Filler: type `hi`. A short pause (the read), then the turn runs; footer unchanged, no band.
3. Real task: type "refactor the payment retry logic". After about a second the turn starts, already at high: the band opens with `Using high — ...` and `1: Keep high  2: Revert to picker  x: Close`, the footer reads `high?`, and `grep "step index=0" router.log` shows `-> high` for that turn's first request. Close it: the footer still reads `high?`; pressing the footer reopens it with `Suggest now` too.
4. Clarify: if Claude asks complex-or-simple, answer "2" (simple). Before that turn runs the band opens again with `Using low — ...` and the footer reads `low?`. `grep "read settled" router.log` shows each read and its time.
5. Press `1` (Keep) in the empty prompt. The band disappears, the transcript shows `effort locked: low 🔒 (router: ...) · /route status`, the footer reads `low 🔒`, and in the terminal a `/effort low` line appears at turn end. No more `read settled` lines follow.
6. Subagents: ask for something that launches two subagents, one mechanical ("search the codebase for every use of X") and one open-ended ("then have an agent fix the bug it finds"). `grep "effort-router: subagent " router.log` shows one line per launch with its level and reason (for example `-> low (codebase search)`), and `grep "agent=" router.log` shows each subagent's steps at its own level from `index=0`, while the main thread stays at the locked level. `/route status` lists both under `Routed subagents this session`. Then `/route off` and launch another: no `subagent` line, and its steps go out at the picker's level.
   Definitions (0.7.1): with `~/.claude/agents/effort-probe-low.md` carrying `effort: low` and the router on, launch `effort-probe-low` with an open-ended brief. The debug log shows `-> low set by its definition, left alone` and no `subagent classifier said` line, the agent's steps log `low -> low` (the engine's level, untouched), and `/route status` lists it as `low (set by its definition)`. Verified before the fix (0.7.0 live, 2026-10-04): the engine honours a file definition's `effort:` (ran at low with the session at medium and the router off), and 0.7.0 would have overridden it.
7. Manual switch: `/route this is now a security review`. The band opens with `Effort router: low 🔒 → max? — switch to max: ...` and `1: Accept max  2: Keep low  3: Turn off  x: Close`; the footer reads `low 🔒 → max?`. Press `2` with the band focused (ctrl+x tab), or accept.
8. Revert: in a fresh session, give a task, then press `2: Revert to picker`. The footer reads `off` (dim) and the next steps log `<picker> -> <picker>`. Press the footer, then `Turn on`: back to `deciding`.
9. Budget: in a fresh session, give a task and keep chatting without pressing Keep. After the sixth prompt the transcript shows `effort locked: high 🔒 (kept after 6 prompts; router: ...)`. In another fresh session send six filler prompts: the footer reads `off` and `/route status` says `no clear task after 6 prompts — /route to ask again`.
10. Existing session: `claude --resume` a long chat from before the router was installed (6 or more prompts). The footer reads `off` (dim), no band appears, and `/route status` starts `off (existing session — /route to ask)`. `/route` still reads.
11. `consent: ask`: set it in `/config`, start fresh, type a bug-fix request. A question dialog with `Accept high / Turn off` appears before the turn runs. `consent: confirm`: the band offers `Accept high / Turn off` and the turn runs at the picker's level until you accept.
12. Rules: `/route rules init project`, add a line after `$defaults`, run `/route rules`. It lists `spliced: <path>` and shows your line.
13. Desktop: repeat 1, 3, 5 and 8 in the Desktop Code tab. The Desktop effort picker never moves (the app owns it); the footer is the source of truth.
14. If the footer button does not draw or press on some surface, set `footerControl` to `label` in `/config` and use `/route`.
15. Questions: in a fresh session, type `pull latest code`, then "implement for me a new finance solution pulling from multiple accountancy platforms". That turn starts at high. If Claude asks AskUserQuestion questions, answer them: `grep "read settled .* (after answered questions)" router.log` shows a read before the answers reach Claude, and `/route status` shows `Last verdict (after answered questions, ...)`, the consent mode, the read time and how much transcript was sent.

## Org layer

Verified live: a `--settings` file (the `flag` source) carrying `pluginConfigs["effort-router@tommy-mods"].options` with the undeclared `rulesMode`/`allowPin` keys (now `allowOff`; same mechanism), and a custom top-level `effortRouter` key, both reach `$.settings.read({ source })` intact. The router reads the org layer from the `policy` source only. A real managed-settings file was not written (it needs admin rights). The kit test `org layer from policy settings` covers the policy path with a mocked source. To check by hand, put the README's example in the managed-settings.json for your OS, then run `/route rules`, `/route off` and `/route rules init`, and press the footer to open the band (no `Turn off` or `Revert to picker` under `allowOff: false`; a spent budget idles as `deciding`).
