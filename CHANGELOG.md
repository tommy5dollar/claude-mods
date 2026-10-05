# Changelog

## effort-router

### 0.17.3 (2026-10-05)

- **The footer shows the level in capitals** (`🔓 HIGH ◑`), which tells the level running apart from the picker's own
  label (your setting). It also fixes the Desktop app cutting off the bottom of "high": the app's footer button clips
  descenders, and capitals have none.

### 0.17.2 (2026-10-05)

- **Resuming inside a running session** (`/resume` in the terminal, or `/clear`) now redraws the footer for the
  session you moved to. Before, it kept showing the old one (often just the padlock and circle) until you clicked it.

### 0.17.1 (2026-10-05)

- **Telemetry for organisations.** When Claude Code's OpenTelemetry is on, each `api_request` record (which already
  carries the level the request went out at) also carries `effort_router.setting`, `status`, `level`, `off_reason`
  and `version`, so a collector can see what the router changed. Nothing is sent anywhere new.

### 0.17.0 (2026-10-05)

A redesign of the main thread's rule, the footer, the band and the command. Settings from earlier versions other than the five below are ignored.

The marketplace is now `tommy5dollar`, at `tommy5dollar/claude-plugins` (it was `tommy-mods`, at `tommy5dollar/claude-mods`). To move, run `claude plugin marketplace remove tommy-mods`, then the commands in Install in the README.

- **The rule.** Each of a session's first five prompts (`promptsToAssess`) is assessed. The router moves to the middle of the spread when it's at least 70% sure the level running is wrong (`confidence`), and otherwise stays. After the fifth it locks whatever is running. A move never locks early.
- **Statuses.** Unlocked, locked and off, shown in the footer as 🔓, 🔒 and ⏸️ with the level and a circle for the window's progress. The level word is dim while the last assessment was less than 50% sure of it. Levels have no colours.
- **The band** opens only from the footer or `/er`. It says the footer in words, the last assessment and how many subagents were routed, over four fixed slots: Hide, Lock or Unlock, Turn off or on, and Assess. A greyed-out slot stays in place and says why when pressed.
- **Lock and Unlock.** Lock ends assessing early. Unlock keeps the level and assesses your next five prompts from there. Assess while locked runs one fresh assessment and keeps the result locked. Turning on offers locked at the router's last level, or unlocked from your own setting.
- **One line per change** in the conversation, never sent to the model.
- **Changing the effort picker turns routing off**, whether locked or unlocked. Your setting is saved with the session, so a change made across a restart or resume is seen too.
- **`/effort-router`, alias `/er`,** replaces `/route`. Its verbs are explicit (`lock`, `unlock`, `on`, `off`, `assess [hint]`, `report`, `status`, `rules`), and anything else is refused rather than run as a hint.
- **Removed:** asking first (`consent: ask`, the question card and `EFFORT_ROUTER_CONSENT`), giving up after a budget, the organisation's `rulesMode: enforce` and `allowOff`, `/route rules init` and `critique`, and the options `decideWithin`, `showChecks`, `classifierModel`, `classifyTimeoutMs`, `classifierMaxChars`, `skipAboveTokens`, `firstCheckInstructions` and `footerControl`.
- **Assessments** always run on the session's model, as a fork when there's a conversation to fork. The prompt being assessed goes to a separate call in whole, outside the 24,000-character cap.
- **Sessions first seen mid-flow** count their earlier prompts toward the window, and start off with five or more. The 20,000-token rule is gone.
- **A session set to max** is offered levels up to max, so it can stay there. Before, it was always moved down.
- **State** is saved in each session's ledger, so the plugin store and its 100-session limit are gone.
- An assessment may take up to 30 seconds (was 15): on Fable 5.1 at xhigh a fork took 15 seconds in testing.
- `/er status` and `/er report` print short blocks and bulleted lists, which read in the Desktop app as well as the terminal.
- A failed assessment still uses up its prompt. Each assessment in the ledger names the prompt it assessed.

### 0.16 (2026-10-05)

- 0.16.5: each check says what level it was judged against.
- 0.16.4: the router never runs `/effort`, which in the terminal also saved the level as your default for new sessions.
- 0.16.3: copy fixes from the pre-launch review.
- 0.16.2: changing the picker yourself stops routing.
- 0.16.1: the first check is judged against the picker's level as the first request shows it.
- 0.16.0: checks give a spread over the levels, judged against the level in force.

### 0.10 to 0.15 (2026-10-04)

- 0.15.0: Reassess now and Reassess with my next prompt. The auto notice says what changed.
- 0.14.0: consent `auto` by default.
- 0.13.0: a plainer band, and each check says why.
- 0.12.0: the levels in between on the question card.
- 0.11.0: evidence-led notes on what each level can do per model, no Haiku checks, xhigh at most unless allowed.
- 0.10.0: checks on the session's own model, as a fork of the conversation, with a confidence bar.

### 0.5 to 0.9 (2026-10-04)

- 0.9.0: `/route report` shows where the effort went, from a ledger of every request.
- 0.8.0: ask before overriding the picker on the main thread.
- 0.7.0: each subagent routed from its own brief at launch. 0.7.1: an agent's own `effort:` is left alone.
- 0.6.0: the read happens before the turn runs, and long chats from before the router are left alone.
- 0.5.0 to 0.5.2: a decision budget, `/route [hint]`, reads after answered questions and the first eval.

### 0.1 to 0.4 (2026-10-04)

The first versions: a footer state, a band, and leaving manual levels to the effort picker.
