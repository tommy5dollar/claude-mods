# Testing effort-router

## Automated

```
bun test                            # 97 tests: trimming (incl. the last assistant message kept long and AskUserQuestion
                                    # questions and answers kept), the classifier input cap (first prompt, then human lines
                                    # before assistant text), reply parsing (incl. fenced json), the classifier frame,
                                    # $defaults layering, settings layers, /route grammar and hints, state: consent names
                                    # (old values mapped), a verdict waiting for the request, the rule at a request
                                    # (none / agree / ask), the question text, lock reasons, the budget with a waiting
                                    # verdict, footer and band per state, the auto notice, old provisional state restored
                                    # as deciding, first sighting, status diagnostics;
                                    # subagents: the frame and contract, the brief prompt and its head-and-tail cap, reply
                                    # parsing (no undecided), the parent's level, user-off vs router-off, the status list;
                                    # agent definitions: frontmatter, effort values, name over file name, settings agents,
                                    # first definition wins, plugin agents skipped;
                                    # the spend ledger: rows per day, caller and pair of levels (input counts cache), reads,
                                    # a saved file round-trips and bad rows are dropped, token counts, the report (by level,
                                    # what was moved beside requests left at that level, definitions, reads, repos, periods);
                                    # 0.10: confidence in replies (fractions, percentages, none), the bar, supported models
                                    # and names, standing aside on other models, the size skip, the fork's message, the
                                    # instructions block, status when a check leaned below the bar, reads by kind, verdict
                                    # rows and their outcome tied to the check that asked;
                                    # 0.11: no example or rule names a level, levels held to highestLevel (xhigh unless
                                    # set) in the frame, contract and capLevel, the fork's answers block, the subagent read
                                    # told its model with that model's notes, the subagent fork message, definitions' model
claude plugin test .                # 71 tests in the engine's kit, among them, for the main thread: undecided runs at the
                                    # picker level with no question; the picker's level locks with no question and reading
                                    # stops; a different level holds the request on the question, Use locks it and syncs
                                    # /effort, Keep locks the picker level; the footer reads high? while the request waits;
                                    # dismissed runs at the picker level and the next read asks again; -p rejects; the
                                    # question at a later index after answered AskUserQuestion questions; a waiting verdict
                                    # asked after the budget runs out; /route asks from the command; /route while locked
                                    # names the picker level; /route with the same level changes nothing; auto locks with
                                    # no question and opens the band once with Revert (none under org allowOff false, none
                                    # when it is the picker's level); EFFORT_ROUTER_CONSENT old values; a hanging classifier
                                    # fails open; an existing session starts off with zero model calls; the input cap; the
                                    # footer Button and band;
                                    # subagents: agent.spawn reads the brief before the agent starts and its turn.step
                                    # carries that level (others keep the main level); the brief cap; forks and nested forks
                                    # inherit; a throwing, hanging or unusable read falls back to the parent's level, a nested
                                    # one via parentAgentId; routeSubagents false; an existing session still routes them,
                                    # /route off stops it (and /route on brings it back); org routeSubagents false; a denied
                                    # spawn is not kept; a user definition with effort gets no read and its requests are left
                                    # alone; a project definition wins over a user one; a definition without effort is routed;
                                    # a file is matched by its name: (not file name); settings agents; plugin agents routed;
                                    # spend: each request recorded with the level it arrived at and went out at, main and
                                    # subagent, plus the router's reads; the file written when a turn ends and not again
                                    # with nothing new; a session carries on from its saved file; the week reads every saved
                                    # session (a stray non-ledger file skipped) and splits by repo; no home: reported, not saved;
                                    # 0.10: the first prompt checked by a separate call on the session model with the
                                    # instructions from prompt.context, then forks; firstCheckInstructions false; below the bar
                                    # nothing happens and the next prompt asks; a bar of 0; no check while a turn runs or for
                                    # answers mid-turn; verdict rows saved; an unsupported model: no checks, off, says why;
                                    # a locked level not applied after /model to another; model notes in the check and in
                                    # /route rules; a long first-seen session left alone;
                                    # 0.11: answers mid-turn checked by a fork carrying them (prompts queued mid-turn still
                                    # wait); max held to xhigh, highestLevel max allows it; classifierModel haiku ignored;
                                    # a subagent's read is a fork of its parent told the subagent's model; a subagent on
                                    # Haiku (the call's model or its definition's) is left alone; Check now shows its result
                                    # in the band
"$APPDATA/Claude/claude-code/2.1.286/635c1867224a/claude.exe" plugin test .   # the same 71 under Desktop's engine
claude plugin validate . --strict
bun run eval -- --runs 3            # opt-in, real model: 23 session fixtures and 14 subagent briefs, see below
                                    # (both sets as separate calls on --model, default opus, with its notes; the session
                                    # set with confidence; the forks the router makes can't be reproduced here)
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
against medium, Fable against high (Tommy's usual settings).

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

The kit passes a `Select` in the SessionMode footer on both surfaces, but the real Desktop app (2.1.286) silently drops it, so the footer is a `Button`. Footer and band rendering on Desktop has to be checked live (steps 1, 3 and 8 below).

## Live, headless

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

## Live, Desktop (0.8.0 and 0.9.0, still to run by hand)

Install the dev build in the Desktop Code tab, set the effort picker to Medium, and start a fresh session in a scratch repo. With a debug log, `grep "effort-router: " <log>` shows each read, each step as `effort <arrived> -> <sent>`, and each question.

1. Footer: before any prompt the footer beside the effort picker reads `deciding` (dim). Pressing it opens the band: `Effort router: deciding. Your effort setting applies until the task is clear.` with `1: Check now  2: Turn off  x: Close`. Press it again: the band closes. No band ever opens by itself (consent `ask`). Press `Check now`: the footer reads `checking…` until the check answers, then the band opens with the result (for example `Effort router: No clear task yet. Nothing changed.` and `Close`), or the question card opens first when the result differs from your setting (0.10.0, not yet seen in Desktop).
2. Undecided: type `hi`. A short pause (the read), then the turn runs at Medium. No question, footer unchanged.
3. Same level: in a fresh session, type "add a dark mode toggle to the settings page" (Medium work). No question; the turn runs; the footer reads `medium 🔒`; the transcript shows `Effort router: medium for the rest of this session (...).` The next prompt shows no `read settled` line.
4. Different level, Use: in a fresh session, type "the checkout total is wrong when a coupon expires mid-session, fix it". The turn waits on Claude's question card: `Effort router: Bug fix in existing code. Use high effort instead of medium?` with `Use high` and `Keep medium`. While it is open the footer reads `high?` and nothing streams. Wait more than 10 seconds before answering (the hook time limit): choose `Use high`. The turn then runs; the step logs `effort medium -> high`; the footer reads `high 🔒`. The Desktop picker still reads Medium (the app owns it).
5. Different level, Keep: repeat 4 in a fresh session and choose `Keep medium`. The turn runs at Medium, the footer reads `medium 🔒`, and `/route status` starts `medium 🔒 for this session (your choice).`
6. Dismiss: repeat 4 and dismiss the card (Esc). The turn runs at Medium, the footer reads `deciding`, and the next task prompt asks again.
7. Mid-turn questions: in a fresh session, type `pull latest code`, then "implement for me a new finance solution pulling from multiple accountancy platforms". If that read is undecided and Claude asks AskUserQuestion questions, answer them: the read runs before the answers reach Claude, and the card appears before the turn's next request (`grep "asked high over the picker's medium"`).
8. `/route` while decided: after 4 (locked at high, picker Medium), run `/route keep it quick`. The card names the picker: `Use low effort instead of medium?`, never "instead of high". `Keep medium` leaves `medium 🔒`.
9. Subagents: ask for something that launches two subagents, one mechanical ("search the codebase for every use of X") and one open-ended ("then have an agent fix the bug it finds"). `grep "effort-router: subagent " router.log` shows one line per launch with its level and reason (for example `-> low (codebase search)`), and `grep "agent=" router.log` shows each subagent's steps at its own level from `index=0`, while the main thread stays at the locked level. `/route status` lists both under `Recent subagents`. Then `/route off` and launch another: no `subagent` line, and its steps go out at the picker's level.
   Definitions (0.7.1): with `~/.claude/agents/effort-probe-low.md` carrying `effort: low` and the router on, launch `effort-probe-low` with an open-ended brief. The debug log shows `-> low set by its definition, left alone` and no `subagent classifier said` line, the agent's steps log `low -> low` (the engine's level, untouched), and `/route status` lists it as `low: <description> (set by its agent definition)`. Verified before the fix (0.7.0 live, 2026-10-04): the engine honours a file definition's `effort:` (ran at low with the session at medium and the router off), and 0.7.0 would have overridden it.
10. Consent `auto`: set it in `/config` (the field is a picker: ask / auto). In a fresh session, type the bug-fix prompt from 4. No card; the band opens by itself once: `Effort router: using high for this session (<reason>)` with `1: Undo  x: Close`. `Undo` turns the router off (footer `off`), and the next step logs `medium -> medium`. A task at Medium locks with no band.
11. Old consent values: a `consent` saved by 0.7 (`apply`) reads as unset in `/config`, so `ask`. `EFFORT_ROUTER_CONSENT=apply` in the environment still means `auto` (`/route status` says `it switches without asking (consent: auto)`).
12. Existing session: resume a long chat from before the router was installed (6 or more prompts). The footer reads `off`, no card appears, and `/route status` starts `Off (session started before the router)`. Subagents are still routed there.
13. Budget: in a fresh session send six filler prompts. The footer reads `off`, and `/route status` says `no clear task after 6 prompts`.
14. Rules: `/route rules init project`, add a line after `$defaults`, run `/route rules`. It lists `+ <path>` and shows your line.
15. Terminal: repeat 4 in the terminal. After `Use high`, a `/effort high` line appears when the turn ends and the terminal picker label follows.
16. Spend report: after a few routed turns, run `/route report session` and `/route report`. The output is several lines; check the Desktop transcript keeps the line breaks and the two-space indents (unverified in Desktop: the -p output above is plain text).

## Org layer

Verified live: a `--settings` file (the `flag` source) carrying `pluginConfigs["effort-router@tommy-mods"].options` with the undeclared `rulesMode`/`allowPin` keys (now `allowOff`; same mechanism), and a custom top-level `effortRouter` key, both reach `$.settings.read({ source })` intact. The router reads the org layer from the `policy` source only. A real managed-settings file was not written (it needs admin rights). The kit test `org layer from policy settings` covers the policy path with a mocked source. To check by hand, put the README's example in the managed-settings.json for your OS, then run `/route rules`, `/route off` and `/route rules init`, and press the footer to open the band (no `Turn off` or `Revert to picker` under `allowOff: false`; a spent budget idles as `deciding`).
