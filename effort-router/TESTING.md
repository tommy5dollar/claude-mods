# Testing effort-router

## Automated

```
bun test                            # 87 tests. The 0.17 rule: settle moves to the median when the larger directional side
                                    # clears the bar and stays otherwise, the last prompt of the window locks whatever runs
                                    # (a move on it moves first), a manual assessment while locked moves the locked level
                                    # without counting, first sightings (earlier prompts count, a used-up window starts off),
                                    # lock, unlock, off and both ways on, levels offered up to your setting when it is above
                                    # highestLevel, confidence against the level running; the footer (glyph, level, the
                                    # circle, dim below 50%), the band's lines and its four slots with greyed ones and why,
                                    # the messages, /er grammar (explicit verbs, assess with a hint, anything else refused),
                                    # /er status, the state saved in the ledger and restored (old and malformed entries
                                    # ignored); the transcript (the prompt being assessed in whole, outside the cap), reply
                                    # parsing, the classifier frame, $defaults and settings rule layers (no enforce),
                                    # subagent reads, routing and reports, agent definitions, the spend ledger and report
claude plugin test .                # 60 tests in the engine's kit: the first prompt assessed by a separate call with the
                                    # instructions and judged at the first request; later prompts fork and are judged against
                                    # the level running; an unsure assessment stays; no clear task still counts; the lock
                                    # after the window; a move on the last prompt; the confidence option; a picker change
                                    # turns it off, unlocked or locked; no assessment while a turn runs or for a slash
                                    # command; answers mid-turn assessed by a fork; a timeout or an error fails open and
                                    # still counts; verdict rows; the footer button on both surfaces; the band opens only
                                    # from the footer or /er (which prints nothing), its lines, hotkeys 1 to 4, greyed slots
                                    # saying why, Hide, Lock, Unlock, Lock before the first request, Turn off and both ways
                                    # on, Turn on and assess, Assess while locked, the subagent count, no band under a
                                    # survey; /effort-router and /er registered, -p prints the band, every verb's reply,
                                    # unknown text refused; unsupported models; /model to another; model notes; first
                                    # sightings; the state saved at once and carried on by another load; a picker change seen after a reload;
                                    # subagents: agent.spawn reads the brief before the agent starts and its requests carry
                                    # that level; the brief cap; forks inherit; failed, hanging or unusable reads fall back
                                    # to the parent's level; routeSubagents false; an old session still routes them; off
                                    # stops it and on brings it back; Haiku agents left alone; a denied spawn; agent
                                    # definitions with and without effort; spend: each request recorded, saved when a turn
                                    # ends, carried on from a saved file, reported by week and repo
"$APPDATA/Claude/claude-code/2.1.286/635c1867224a/claude.exe" plugin test .   # the same 59 under Desktop's engine (2.1.286, passing 2026-10-05)
claude plugin validate . --strict
bun run eval -- --runs 3            # opt-in, real model: 23 session fixtures and 14 subagent briefs, see below
                                    # (both sets as separate calls on --model, default opus, with its notes; the forks
                                    # the router makes can't be reproduced here)
```

### Classifier eval (2026-10-04, haiku, `bun run eval -- --runs 3`)

0.5.2: `66/66 reads passed (100%); 22/22 fixtures passed every run`.

Against the 0.5.1 prompt and rules (same fixtures): `53/66 reads passed (80%); 17/22 fixtures passed every run`. The live miss reproduced 0/3: "implement for me a new finance solution pulling from multiple accountancy platforms" after "pull latest code" came back `undecided` every time, as did a vague feature, a vague bank-statement importer and the AskUserQuestion case (whose answers 0.5.1 reduced to a tool name).

Five fixtures (marked "held out") are not mirrored by the prompt's worked examples; several others are, so read 100% as "the examples are followed", not as a general accuracy figure.

### Classifier eval per model (2026-10-04, 0.10 runner, `bun run eval -- --set session --runs 2 --model <opus|sonnet|fable>`)

The first check as 0.10 makes it: on the session's model at its default effort, with that model's notes (rewritten from `rules/models/research-2026-10.md` the same day).

| Model | Reads passed | Over the 80% bar | Right when over the bar |
|---|---|---|---|
| Opus 5.5 | 44/44 | 25/44 | 25/25 |
| Sonnet 5.5 | 44/44 | 24/44 | 24/24 |
| Fable 5.1 | 44/44 | 26/44 | 26/26 |

The three models gave almost the same level on every fixture. The notes barely moved them: Sonnet and Fable still chose max for the two autonomous fixtures, though Sonnet's notes say max scored below xhigh. Sonnet gave medium where the others gave low on one fixture (a one-column migration), and Fable split low/medium on the vague feature. So model notes in the prompt don't produce per-model routing. Also, the fixtures' expected levels are the same for every model, so 100% here can't show per-model correctness. Every read the router would have acted on was right, but these fixtures are easy and close to the worked examples, so this is not calibration.

### 0.11 eval (2026-10-04, `bun run eval -- --runs 2 --model <opus|sonnet|fable>`)

Both sets as separate calls on the model with its per-level notes, levels up to xhigh. The subagent set is the harder
case: the router asks a fork of the parent, which knows the task, and this can't.

| Model | Session reads | 70%+ (the bar) / 80%+, of reads with a level | Subagent reads |
|---|---|---|---|
| Opus 5.5 | 46/46 | 27 / 10 of 34 | 26/28 |
| Sonnet 5.5 | 42/46 | 21 / 12 of 33 | 26/28 |
| Fable 5.1 | 43/46 | 31 / 21 of 34 | 25/28 |

- No check picked max (it isn't offered).
- Sonnet gave medium for the rename and the one-constant extraction, which its notes support (at low it can skip
  verifying a change), so those fixtures now accept medium on Sonnet (`expectOn`). It went undecided once on the
  payout webhook.
- Fable gave medium for the one-constant extraction (twice) and medium/high for the vague feature (expected low or
  medium). Left as misses: its notes don't clearly support medium there.
- All three gave medium for the web-research subagent (expected low). Fable's notes support it (at low it searches
  less), so that fixture accepts medium on Fable. Opus and Sonnet left as misses.
- The subagent set did much better than the light variant on haiku (79% / 61% / 64% there).

### 0.16 eval: the spread (2026-10-05, `bun run eval -- --set session --runs 2 --model <m> --setting <level>`)

Each check now gives a probability for every level. The eval judges it as the router does: against the level in force
(`--setting`), moving to the median when it's sure enough the setting is wrong in one direction. Opus and Sonnet ran
against medium, Fable against high: Claude Code's default for each.

| Model | Setting | Session reads | Over the 70% bar | Right of those |
|---|---|---|---|---|
| Opus 5.5 | medium | 46/46 | 18/46 | 18/18 |
| Sonnet 5.5 | medium | 44/46 | 23/46 | 23/23 |
| Fable 5.1 | high | 42/46 | 17/46 | 15/17 |

- Fable sometimes ends its reply before the last `}`. Those replies used to fail to parse and count as undecided (39/46
  on the first run). The parser now closes braces left open and ignores text after the object.
- Fable's two wrong moves were both down from high in the right direction, one level short: medium for the mechanical
  rename and the one-constant extraction, where low was expected.
- Sonnet and Fable put edge-case tests at medium with high close behind (for example medium 45%, high 40%), expected high or
  xhigh. Below the bar, so the router would stay on the setting and check again.

### Consistency and anchoring (2026-10-05, `bun eval/anchor.ts --model <m> --runs 5`)

Each session fixture with a task, 5 runs under 5 conditions: no level stated, and "The session is at X effort now" for
low, medium, high and xhigh. The run hit the account's weekly limit partway, so it has 334 reads on Opus, 350 on
Sonnet and 222 on Fable (the rest errored and are left out).

| | Opus 5.5 | Sonnet 5.5 | Fable 5.1 |
|---|---|---|---|
| A level's probability between identical calls, mean wobble | 1.0 pts | 1.7 pts | 1.6 pts |
| Same median level in all 5 runs | 64/67 | 59/70 | 30/45 |
| Same router action in all 5 runs (a level stated) | 48/53 | 44/55 | 29/36 |
| Stated level's probability vs none (+ sticky, - grass is greener) | +1.2 pts | +0.9 pts | +2.3 pts |
| Confident moves / moves that would move again from where they landed | 159 / 0 | 165 / 0 | 94 / 0 |

- Stating the level barely moves the spread, and the small shift is towards the stated level, not away. No sign of
  "grass is greener", and no move that would be followed by another.
- The bar makes the start matter when a spread is split. Opus on the brownfield bug fix (medium 30%, high 53%,
  xhigh 14%): from medium it waits (67% up, below the bar), from xhigh it moves to high. Different starts can settle on
  different levels, but each one is stable.
- Fable is the least consistent on the median. Its spreads often sit near 50/50 between two levels, so small wobbles
  flip the median.

### Prompt variants (2026-10-04, `--variant shipped|light|hybrid`, 2 runs per fixture; the light variant became the 0.11 prompt and the flag was removed)

An experiment on whether the per-model element should be rules or evidence. 23 session fixtures (a research fixture
added) and `expectOn` predictions from the research for Sonnet (xhigh, not max, when autonomous) and Fable (xhigh or
max for the autonomous build, not low for research on current tools). `light` (eval/variants/light.ts) drops the
kind-of-task-to-level mapping and the levels from the worked examples, keeps the examples on reading a transcript, and
makes the model notes the main guide. `hybrid` keeps the shipped prompt and says the notes win where they differ.

| Variant | Opus 5.5 | Sonnet 5.5 | Fable 5.1 | Reads with a level at 80%+ (O/S/F, of 34) | at 70%+ |
|---|---|---|---|---|---|
| shipped | 46/46 | 42/46 | 46/46 | 24 / 25 / 28 | 31 / 31 / 32 |
| hybrid | 46/46 | 42/46 | 46/46 | 24 / 26 / 27 | |
| light | 43/46 | 40/46 | 46/46 | 6 / 6 / 19 | 27 / 24 / 30 |

- shipped and hybrid: the models follow the labelled examples. Example 10 says an autonomous security hunt is max, so
  Sonnet answers max for both autonomous fixtures, notes or not. Telling the model the notes win changed nothing.
- light: the models diverge in the directions the evidence predicts. Sonnet: xhigh for the autonomous hunt (2/2),
  medium for mechanical work (its notes say low skips checks). Fable: xhigh for the autonomous build, high for research
  on current tools. Opus moved off max for autonomous work (high or xhigh), which its notes (max overthinks, returns
  flatten) support and the shipped rules don't. Its misses against the fixtures are mostly these, and the fixtures'
  expectations come from the mapping light removes, so they can't judge it.
- light's confidence drops by about 0.05 to 0.1 on Opus and Sonnet: at the 80% bar the router would act on 6 of 34 reads.
- light's subagent reads (haiku, told the subagent's model) got worse: mechanical briefs drifted to medium. The mapping
  in the subagent frame was doing real work for haiku.

### Subagent eval (2026-10-04, haiku, `bun run eval -- --runs 3`)

0.7.0: `subagent: 42/42 reads passed (100%); 14/14 fixtures passed every run`, and the session set unchanged at 66/66 (`all: 108/108`).

What came back: every mechanical brief (web research and tabulating, an Explore search, summarising a given file, running tests and reporting, listing npm scripts, extracting action items from given text) was low in all 3 runs. Adding translation keys in the existing format was low twice and medium once (both pass). Implementing rate limiting from a spec, debugging a failing test, the design proposal and the PR review were high every time. The security review was xhigh every time. The autonomous port with property tests was high every time, never max (high, xhigh or max pass). The vague "now do the same for the invoices table" was medium every time.

Read 100% with care. The fixtures were written alongside the subagent frame, several sit close to its worked examples (a codebase search, running a command, debugging, a security audit) and most expectations allow two levels. It shows the frame is followed and the mechanical/judgement split is stable, not general accuracy on real briefs. The live briefs in Tommy's transcripts are the next check.

The kit passes a `Select` in the SessionMode footer on both surfaces, but the real Desktop app (2.1.286) silently drops it, so the footer is a `Button`. Footer and band rendering has to be checked live (the 0.17 list below).

## Live, headless

These record what was verified on earlier versions, with the names of the time (`/route`, checks, consent). The mechanisms they verified (assessing before the turn, forks, subagent reads, the ledger) are unchanged in 0.17.

### 0.11.0: the cap and subagents (verified 2026-10-04, CLI 2.1.289, Opus 5.5)

One `claude -p` run in the demo shop, consent auto: "find security vulnerabilities in auth.js, work through it on
your own, I'm away all day", with an Explore and a general-purpose subagent. About $0.95.

- The first check said high at 70% for "unattended security review of auth code". Not max.
- On a first turn there is no main-thread response to fork, so both subagent checks fell back to a separate call on
  the subagent's model. Explore ran on Sonnet 5.5 here, not Haiku, so it was checked.
- The general-purpose check (Opus) answered `{"decision":"lock","level":"high",...}`: high.
- The Explore check (Sonnet) answered `{"decision":"medium","reason":"thorough read-only codebase search for call
  sites"}`. The router couldn't read it and gave Explore its parent's high. The prompt asked for
  `"decision":"lock"` and never said what "lock" meant, so the decision field read as the place for the answer.
  0.12 asks for `{"level","reason"}` and reads a level named as the decision.

### 0.10.0: checks on the session's model (verified 2026-10-04, CLI 2.1.289, Opus 5.5)

One `claude -p --input-format stream-json` process in `D:/code/mods`, the dev folder as `--plugin-dir` with the
installed router disabled, `EFFORT_ROUTER_CONSENT=auto`, two prompts sent one after the other's result:

- `prompt.context` fired before the first `prompt.submit` and carried the `claudeMd` block (31k characters here).
- Prompt 1 ("what's in this repo? don't read anything"): `$.model.fork` said there was no response to fork yet, so
  the separate call ran on `claude-opus-5-5`: 1433 ms, `{"decision":"undecided"}`.
- Prompt 2 (a read-and-explain question): the fork took 1619 ms and read 72,346 tokens from the main thread's cache,
  with 2,790 fresh input tokens (the router's own instructions), 224 written and 43 output. About 2.6 cents.
- The ledger file was written at each turn's end.

Probes behind the design (scratchpad, same day):

- An effort change mid-session (turn 2 at high after turn 1 at medium) kept the cache: 124k read, 492 written.
- `$.model.complete` never caches: two identical calls of 16k tokens (Opus) and 12k (Haiku) read 0 and wrote 0, with
  the text in the prompt or in the system prompt.
- A fork during the first turn, before its second request, paid 13.5k tokens fresh and the main thread's next request
  missed its own cache too. Between turns the fork reads the whole conversation from cache. So the router never forks
  mid-turn.

### 0.9.0: the spend ledger (verified 2026-10-04, CLI 2.1.289)

In a scratch folder with two package.json files, consent auto, one prompt that names a bug and asks for an Explore subagent:

```
EFFORT_ROUTER_CONSENT=auto claude -p --model sonnet --permission-mode bypassPermissions --output-format json --debug-file r1.log "There's an off-by-one bug somewhere in our pagination code that drops the last item on each page; before fixing anything, use the Agent tool to launch one Explore subagent that lists every package.json file under this directory. Then reply with the list in one line and stop."
cat ~/.claude/effort-router/spend/<session_id>.json
MSYS_NO_PATHCONV=1 claude -p --resume <session_id> "/route report session"   # Git Bash rewrites a leading /route into a path without MSYS_NO_PATHCONV
MSYS_NO_PATHCONV=1 claude -p --no-session-persistence "/route report"
```

The ledger, verbatim:

```
{"version":1,"session":"ec4092af-…","repo":"live","rows":[{"day":"2026-10-04","caller":"main","from":"medium","to":"high","requests":2,"output":319,"input":101822},{"day":"2026-10-04","caller":"subagent","from":"medium","to":"low","requests":2,"output":282,"input":45176}],"reads":[{"day":"2026-10-04","calls":2,"output":51,"input":2899}]}
```

The transcript agrees: the main thread's two responses carry `perTurnEffort: high` and 277 + 42 output tokens, the subagent's two `low` and 138 + 144. `$.fs.write` ran at each turn end (two lines in the debug log). The resumed run carried on from the file (3 main requests after its own turn), and `/route report` in a new session read it from disk. The debug log of the first run also showed the routing as before: `effort medium -> high` on the main thread and `-> low (recursive file search and listing)` for the Explore subagent.

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

### 0.17.0: assessment timing on Fable 5.1 at xhigh (2026-10-05, CLI 2.1.289)

Headless, with the router loaded from the working tree. Separate calls: three `-p --resume` turns of text-only
planning prompts (each resumed `-p` process has nothing to fork, so every turn was a separate call). Forks: three
prompts fed into one process with `--input-format stream-json`, a minute or more apart, in a folder holding a
16-line `checkout.js`.

| Assessment | Time | Notes |
| --- | --- | --- |
| Separate call, turn 1 (planning) | 5.2 s | moved xhigh to medium |
| Separate call, turn 2 | 5.3 s | stayed |
| Separate call, turn 3 | 2.5 s | stayed |
| Separate call, coupon bug fix | 9.0 s | moved xhigh to high |
| Fork, prompt 2 (61k-token conversation, 167 output tokens) | 7.0 s | moved high to medium |
| Fork, prompt 3 | 15.0 s | **timed out**: the answer arrived after the limit and was discarded, the prompt ran at medium |

Opus 5.5 at medium for comparison: a separate call took 2.8 s. A fork thinks at the session's effort and
`$.model.fork` takes only a prompt, so the router can't cap it. On Fable at xhigh, one fork in two hit the
15-second limit in this run. 0.17.0 raises the limit to 30 seconds for that reason.

## Live: telemetry (2026-10-05, 0.17.1)

`claude -p` on CLI 2.1.289 with `CLAUDE_CODE_ENABLE_TELEMETRY=1 OTEL_LOGS_EXPORTER=console`, Sonnet 5.5 at medium, a
prompt that launched a general-purpose subagent. Every `api_request` record carried `effort_router.version`, `status`
and `setting` beside the engine's own `effort`. `query_source` was `sdk` on the main thread and
`agent:builtin:general-purpose` in the subagent. A probe mod on 2.1.289 and on Desktop's 2.1.286 engine showed the
engine's `effort` is the level after a mod's rewrite (medium rewritten to high read `high`).

## Live, Desktop: verified

### 0.17.0: the whole walkthrough (2026-10-05, Desktop 2.1.286, Opus 5.5 at Medium, by Tommy)

One session in a scratch folder with a 16-line `checkout.js` holding a coupon-expiry bug, run through the list below
(screenshots in `docs/`):

- A new session loads mods with its first message: before it there is no footer and no `/er`. That first message
  (`hi`) was assessed ("no clear task", prompt 1 of 5) and the ledger recorded it.
- The footer emoji (🔓 🔒 ⏸️ and the circles) line up with the text. The typeahead lists `/effort-router` and `/er`.
- The coupon prompt moved medium to high (78% sure medium was too low), shown by a dim line labelled
  `effort-router`, while the Desktop picker kept showing Medium.
- Follow-ups moved the level back to medium, and after the fifth prompt it locked at medium.
- Assess, Unlock, Turn off and Turn on, locked each added their line and the footer followed.
- A general-purpose subagent was routed to low and counted in the band.
- `/er stauts` was refused with the command list. `/er on` while on said so.
- Changing the picker to High turned routing off (`You changed the effort to high, so routing is off.`, footer
  `⏸️ high`). Found and fixed on the way: a hot reload had wiped the router's memory of the picker, so the first
  attempt went unseen. The setting is now kept in the ledger.
- Fixed on the way too: messages no longer repeat "Effort router:" after the engine's own label, and `/er status`
  prints short blocks with bulleted lists (Desktop drops leading spaces).

### 0.16.2: changing the picker yourself stops routing (2026-10-05, Desktop 2.1.286, Fable 5.1)

In a two-day session the router had kept at high (248 requests, picker at medium), the model was switched to Fable 5.1
and the picker to xhigh. The router's store for that session went to `mode: picker` at 08:46:19Z, on the first request
after the change, and every request since has run at xhigh (`perTurnEffort` in the transcript). Nothing was pressed.

## Live: 0.17 checklist (run in Desktop 2026-10-05, see above)

Load the build with `claude --plugin-dir <path>/effort-router` (terminal) or in the Desktop Code tab, with the effort picker at Medium, in a fresh session in a scratch repo. With a debug log, `grep "effort-router: " <log>` shows each assessment and each step as `effort <arrived> -> <sent>`.

1. Footer: in the terminal it reads `🔓 medium ○` before any prompt. Desktop loads mods only with a new session's first message (verified 2026-10-05), so there it appears after the first prompt, as `🔓 medium ◔`. Check the emoji line up with the text in the terminal (the fallback, if not, is the words `unlocked`, `locked`, `off`).
2. Typeahead: typing `/eff` lists `/effort-router` beside `/effort`, and `/er` is listed as its short form.
3. Band: pressing the footer, or `/er`, opens the band with nothing printed in the transcript. The buttons read `1 Hide  2 Lock at medium  3 Turn off  4 Assess`, Assess dim. Pressing `4` says `It assesses before your next prompt anyway.` In Desktop, Hide is the panel's close control.
4. A move: type "the checkout total is wrong when a coupon expires mid-session, fix it". The footer reads `🔓 assessing…` briefly, then the transcript shows a dim `Assessed, medium to high (...)` and the footer `🔓 high ◔`. The step logs `effort medium -> high`. The Desktop picker still reads Medium.
5. The lock: send four more prompts on the same task. The footer's circle advances, then `Locked at high.` and `🔒 high`. A sixth prompt logs no assessment.
6. Assess while locked: `/er assess this is now a security review`. The reply names any move, and the footer stays `🔒`.
7. Unlock: press `2 Unlock`. `Unlocked. Assessing again from your next prompt.` The footer reads `🔓 high ○` and the next prompt is assessed against high.
8. The picker: change the effort picker to xhigh. The next request logs `xhigh -> xhigh`, the transcript says `you changed the effort to xhigh, so routing is off`, and the footer reads `⏸️ xhigh` (dim). In Desktop, check whether the app sends the new level on the next request (it did on 2.1.286, 2026-10-05).
9. Off and on: press `2 Turn on, locked at high`, then `3 Turn off`, then `3 Turn on, unlocked`. Each adds its one line, and the footer follows.
10. Resume: `claude --resume` the session. The footer comes back with the same status and level.
11. An old session: resume a chat with five or more prompts from before the router. The footer reads `⏸️ medium` and the band says `This session started before the router`. A subagent launched there is still routed.
12. Subagents: ask for a mechanical search by subagent. `grep "effort-router: subagent " <log>` shows its level, the band shows `Subagents get their own level: 1 routed this session.`, and `/er status` lists it.
13. `-p`: `claude -p "/er"` prints the band's lines and the command list.

## Org layer

Verified live: a `--settings` file (the `flag` source) carrying `pluginConfigs["effort-router@tommy5dollar"].options`, and a custom top-level `effortRouter` key, both reach `$.settings.read({ source })` intact. The router reads the organisation's `rules` from the `policy` source. A real managed-settings file was not written (it needs admin rights). To check by hand, put the README's example in the managed-settings.json for your OS and run `/er rules`: it lists `managed settings` as a layer and shows the organisation's lines.
