# Changelog

## effort-router

### 0.19.0 (2026-10-07)

- **Haiku 5.5 is supported** (Claude Code 2.1.293 or later). It's the first Haiku with effort levels, and without the
  router a Haiku subagent runs at its parent's level, so an Opus session on xhigh runs its Haiku helpers on xhigh too.
  - A Haiku 5.5 subagent is judged by a call on Haiku that reads its brief alone, not a fork of the parent. Haiku jobs
    are short and self-contained, and a fork on a bigger parent model could cost about what it saves.
  - The router picks up to high on Haiku. Each level above that buys little there for many more steps.
  - Its notes (`rules/models/haiku-5-5.md`) cover Anthropic's advice, how each level behaves, cost and steps against
    medium, and the price step at 100,000 tokens.
  - Haiku 4.5 is still left alone.

### 0.18.1 (2026-10-07)

- **A subagent you ask for at a level keeps it.** Claude Code 2.1.292 lets Claude launch a subagent at a level you
  asked for. The router now leaves that subagent alone, as it does one whose agent definition sets an effort. Before,
  it replaced your level with its own. `/er report` counts both under "Set by you or an agent definition".
- **One install command** on Claude Code 2.1.292 or later: `claude plugin install effort-router --marketplace tommy5dollar/effort-router`.

### 0.18.0 (2026-10-05)

- **The repo is now `tommy5dollar/effort-router`** (it was `tommy5dollar/claude-plugins`), and its marketplace is now
  `effort-router` (it was `tommy5dollar`), so the plugin is `effort-router@effort-router`. If you added the old one,
  run `claude plugin marketplace remove tommy5dollar`, then the commands in Install in the README.

- **The check names a level, and the session goes to it.** Each assessment now asks your session's model one
  question: which level gets this session's work done in the least time and total inference cost, counting the rework
  that too little effort causes? Before, it gave every level a probability and the router moved only when 70% of it
  sat on one side of the level running. That made the result depend on where you started. A spec'd feature that read
  as medium went to medium from xhigh but stayed on high from high. Now the same answer lands on the same level from
  any setting. Switching costs you nothing, so the router does what the answer says.
- **The `confidence` option is gone**, and the band and `/er status` show the level the check picked and what it did
  (`Last assessment: medium (spec'd feature), so it moved from high.`) instead of a spread and a percentage.
- Subagent checks are asked the same question about the subagent's work.
- **Built for spending less.** The check is told that people use the router to save time and money, so when two levels
  would both do the work it picks the cheaper one, and steps up only when the work clearly needs it.
- **Your own words about effort count.** "Think really hard about this" or "quick one" in a prompt now moves the level
  while it's unlocked. Without the router, words like that only nudge thinking within the level you set.
- **A shorter prompt.** What a check adds after the conversation went from about 1,200 words to about 800. The
  worked examples and the advice on reading a conversation are gone: the checks run on Opus 5.5 and Fable 5.1, which
  don't need either. Undecided is now just another answer in the one reply format.
- **Model notes are heuristics, in one shape for every model.** How effort pays on the model, Anthropic's advice for it,
  then each level with its cost and time against medium and how it behaves. No benchmark scores: a few points on a hard
  benchmark means a few more of the hardest tasks solved, and a model reads it as every task done better. The Opus
  notes say what medium already does, so ordinary work stays on medium. Lines about max only reach the check when max
  is on offer.
- **Hidden risk means something a careful engineer could miss.** The rules no longer list money or other systems as
  hidden on their own, and the well-known pitfalls of a kind of work don't count. A user being away makes hidden
  problems costlier but doesn't create them. Before this, routine payments work went to high.
- **A routing eval.** 87 prompts, each with an approved level per model, and a judge with a written rubric. Any change
  to the prompt, rules or notes runs it first, and a prompt that moves off its approved level is flagged.
- **The footer shows the level in capitals** (`🔓 HIGH ◑`), which tells the level running apart from the picker's own
  label (your setting). It also fixes the Desktop app cutting off the bottom of "high": the app's footer button clips
  descenders, and capitals have none. While a check runs the footer shows just an ellipsis
  (`🔓 …`), instead of the word ASSESSING.
- **Routed subagents are kept in the ledger.** Each one's level, the level it would have inherited from its parent,
  why, and how long its spawn waited. Before, only the last ten were kept, in memory, for `/er status`.

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
