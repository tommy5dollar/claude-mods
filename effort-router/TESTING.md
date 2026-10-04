# Testing effort-router

## Automated

```
bun test                            # 38 tests: trimming, reply parsing, $defaults layering, settings layers, /route grammar, state
claude plugin test .                # 10 tests in the engine's kit: band render + button presses, footer button + menu Select,
                                    # turn.step rewrites for main loop and subagents, /route, org enforce/allowPin, fail-open
claude plugin validate . --strict
```

## Live, headless (verified 2026-10-04, CLI 2.1.289)

The router logs every request to the debug log as
`effort-router: step index=N model=M effort <sent by engine> -> <sent by router>`.

```
EFFORT_ROUTER_CONSENT=none claude --plugin-dir D:/code/mods/effort-router -p "hi, just getting set up. Reply with one word." --model sonnet --output-format json --debug-file r1.log
claude --plugin-dir D:/code/mods/effort-router -p "There's a bug in calc.js: add() returns the wrong result when the first argument is negative. Fix it in place." --resume <session_id> --model sonnet --permission-mode acceptEdits --debug-file r2.log
claude --plugin-dir D:/code/mods/effort-router -p "Thanks. What did you change?" --resume <session_id> --model sonnet --debug-file r3.log
grep "effort-router: \|effort locked" r*.log
```

Expected: r1 `classifier said {"decision":"undecided"}` and `medium -> medium`. r2 `classifier said {"decision":"lock","level":"high",...}`, then `effort locked: high`, then later steps `medium -> high`. r3 (a resumed session) `step index=0 ... medium -> high` with no classifier call.

## Live, interactive terminal (still to run by hand)

Run `claude --plugin-dir D:/code/mods/effort-router --model sonnet --debug-file router.log` in a scratch repo.

1. Footer: before any prompt, the footer right of the prompt reads `auto · medium` (your `effortLevel`).
2. Filler: type `hi`. Footer unchanged, no band.
3. Real task: type a bug-fix request. Within about a second the band shows `Route this session at HIGH — ...` with `1: Lock high  2: medium  3: low  4: max  x: Not now`, and the footer reads `auto · medium · high?`.
4. Press `1` in the empty prompt. The band disappears, the transcript shows `effort locked: high — ... · /route to change`, the footer reads `auto · high 🔒`, and at turn end a `/effort high` line appears and the native picker label says High. `grep "medium -> high\|high -> high" router.log` shows the requests after the click.
5. Ask for something that spawns a subagent. `grep "agent=" router.log` shows the subagent's steps at high.
6. Click the footer label. A pane opens with "Locked at high: ..." and a Select. Pick `Pin max`: the footer reads `pin · max` and the next steps log `-> max`.
7. `/route pin picker`: the footer reads `picker · medium` and the picker label is back to Medium.
8. `/route auto`: the footer reads `auto · medium`; the next real prompt offers a level again.
9. "Not now": in a fresh session, offer a level, then focus the band (ctrl+x tab or a click) and press `x` (a letter hotkey needs the band focused; only digits work from the empty prompt). No new offer for 5 prompts.
10. `consent: ask`: set it in `/config`, start fresh, type a bug-fix request. A question dialog with `Lock high / Lock medium / Lock low / Not now` appears before the turn runs.
11. Rules: `/route rules init project`, add a line after `$defaults`, run `/route rules`. It lists `spliced: <path>` and shows your line.
12. Desktop: repeat 1, 3, 4 and 6 in the Desktop Code tab (band, footer and pane are raised on desktop too).

## Org layer

Verified live: a `--settings` file (the `flag` source) carrying `pluginConfigs["effort-router@tommy-mods"].options` with the undeclared `rulesMode`/`allowPin` keys, and a custom top-level `effortRouter` key, both reach `$.settings.read({ source })` intact. The router reads the org layer from the `policy` source only. A real managed-settings file was not written (it needs admin rights). The kit test `org layer from policy settings` covers the policy path with a mocked source. To check by hand, put the README's example in the managed-settings.json for your OS, then run `/route rules`, `/route pin low` and `/route rules init`.
