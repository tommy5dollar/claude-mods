# Testing effort-router

## Automated

```
bun test                            # 49 tests: trimming (incl. the last assistant message kept long), reply parsing,
                                    # $defaults layering, settings layers, /route grammar and hints, re-read and budget state
claude plugin test .                # 14 tests in the engine's kit: band Accept/Turn off/Close, a pending suggestion re-read
                                    # from high? to low? after "2", the budget stopping Haiku calls, manual /route with a hint (in
                                    # the classifier prompt; works when gave up/off), switch offers while locked, the footer Button
                                    # on terminal and desktop opening the band with each state's buttons and every action closing
                                    # it, turn.step for main loop and subagents, org allowOff, fail-open
"$APPDATA/Claude/claude-code/2.1.286/635c1867224a/claude.exe" plugin test .   # the same 14 under Desktop's engine
claude plugin validate . --strict
```

The kit passes a `Select` in the SessionMode footer on both surfaces, but the real Desktop app (2.1.286) silently drops it, so the footer is a `Button`. Footer and band rendering on Desktop has to be checked live (steps 1, 3 and 8 below).

## Live, headless (verified 2026-10-04, CLI 2.1.289)

The router logs every request to the debug log as
`effort-router: step index=N model=M effort <sent by engine> -> <sent by router>`.

```
EFFORT_ROUTER_CONSENT=none claude --plugin-dir D:/code/mods/effort-router -p "hi, just getting set up. Reply with one word." --model sonnet --output-format json --debug-file r1.log
claude --plugin-dir D:/code/mods/effort-router -p "There's a bug in calc.js: add() returns the wrong result when the first argument is negative. Fix it in place." --resume <session_id> --model sonnet --permission-mode acceptEdits --debug-file r2.log
claude --plugin-dir D:/code/mods/effort-router -p "Thanks. What did you change?" --resume <session_id> --model sonnet --debug-file r3.log
grep "effort-router: \|effort locked" r*.log
```

Expected: r1 `classifier said {"decision":"undecided"}` and `medium -> medium`. r2 `classifier said {"decision":"lock","level":"high",...}`, then `effort locked: high 🔒 (router: ...)`, then later steps `medium -> high`. r3 (a resumed session) `step index=0 ... medium -> high` with no classifier call.

## Live, interactive terminal (still to run by hand)

Run `claude --plugin-dir D:/code/mods/effort-router --model sonnet --debug-file router.log` in a scratch repo.

1. Footer: before any prompt, the footer next to the native effort picker reads `deciding` (dim). Pressing it opens the band: `Effort router: deciding — ...` with `1: Suggest now  2: Turn off  x: Close`. Press it again: the band closes.
2. Filler: type `hi`. Footer unchanged, no band.
3. Real task: type "refactor the payment retry logic". Within about a second the band opens by itself with `Effort router: high? — ...` and `1: Accept high  2: Turn off  x: Close`, and the footer reads `high?`. Close it: the footer still reads `high?`, and pressing the footer reopens it.
4. Clarify: if Claude asks complex-or-simple, answer "2" (simple). The band and footer move to `low?` (or the suggestion is withdrawn to `deciding`). `grep "classifier said" router.log` shows each read.
5. Press `1` in the empty prompt. The band disappears, the transcript shows `effort locked: low 🔒 (router: ...) · /route status`, the footer reads `low 🔒`, and in the terminal a `/effort low` line appears at turn end. No more `classifier said` lines follow.
6. Ask for something that spawns a subagent. `grep "agent=" router.log` shows the subagent's steps at the locked level.
7. Manual switch: `/route this is now a security review`. The band opens with `Effort router: low 🔒 → max? — switch to max: ...` and `1: Accept max  2: Keep low  3: Turn off  x: Close`; the footer reads `low 🔒 → max?`. Press `2` with the band focused (ctrl+x tab), or accept.
8. Footer: press it, then `Turn off`: the band closes and the footer reads `off` (dim); pressing it again offers only `Turn on`. Set the native picker to Low: the next steps log `low -> low`. Press `Turn on`: back to `deciding`.
9. Budget: in a fresh session, send six filler prompts. After the sixth read the footer reads `off` and `/route status` says `no clear task after 6 prompts — /route to ask again`; later prompts add no `classifier said` lines. `/route` still reads.
10. `consent: ask`: set it in `/config`, start fresh, type a bug-fix request. A question dialog with `Accept high / Turn off` appears before the turn runs.
11. Rules: `/route rules init project`, add a line after `$defaults`, run `/route rules`. It lists `spliced: <path>` and shows your line.
12. Desktop: repeat 1, 3, 5 and 8 in the Desktop Code tab. The Desktop effort picker never moves (the app owns it); the footer is the source of truth.
13. If the footer button does not draw or press on some surface, set `footerControl` to `label` in `/config` and use `/route`.

## Org layer

Verified live: a `--settings` file (the `flag` source) carrying `pluginConfigs["effort-router@tommy-mods"].options` with the undeclared `rulesMode`/`allowPin` keys (now `allowOff`; same mechanism), and a custom top-level `effortRouter` key, both reach `$.settings.read({ source })` intact. The router reads the org layer from the `policy` source only. A real managed-settings file was not written (it needs admin rights). The kit test `org layer from policy settings` covers the policy path with a mocked source. To check by hand, put the README's example in the managed-settings.json for your OS, then run `/route rules`, `/route off` and `/route rules init`, and press the footer to open the band (no `Turn off` under `allowOff: false`; a spent budget idles as `deciding`).
