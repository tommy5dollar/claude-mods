# Effort behaviour by model: evidence file (2026-10)

Compiled 2026-10-04. Evidence only. Every claim carries a source tag. Where something is not documented it says "not found".

Models: Claude Fable 5.1 (`claude-fable-5-1`), Claude Opus 5.5 (`claude-opus-5-5`), Claude Sonnet 5.5 (`claude-sonnet-5-5`). Secondary: Claude Haiku 4.5 (effort support only).

## How to read this file

Tags: **[A]** = stated by Anthropic (docs, launch posts, system cards, Anthropic engineering blogs). **[I]** = independent (Artificial Analysis, GitHub users). A line without a tag is my arithmetic on tagged numbers and says so.

Source key (all fetched 2026-10-04; the docs pages show no publication date, so "date" for those means "content refers to models released up to 2026-09-28"):

| Tag | Source |
|---|---|
| A1 | Effort docs: https://platform.claude.com/docs/en/build-with-claude/effort |
| A2 | Cost and intelligence docs: https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence |
| A3 | Prompting Opus 5.5: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5 |
| A4 | Prompting Sonnet 5.5: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5 |
| A5 | Prompting Fable 5.1: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1 |
| A6 | Steering thinking: https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost |
| A7 | Models overview: https://platform.claude.com/docs/en/about-claude/models/overview ; Haiku 4.5 page: https://platform.claude.com/docs/en/models/haiku-4-5/overview ; thinking support table: https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting |
| A8 | What's new pages: https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5 , .../models/sonnet-5-5/whats-new-sonnet-5-5 , .../models/fable-5-1/whats-new-fable-5-1 |
| A9 | Claude Code model config (effort section): https://code.claude.com/docs/en/model-config |
| A10 | Bundled claude-api skill (local, version 2.1.286), base `C:/Users/tommy/AppData/Local/Temp/claude/bundled-skills/2.1.286/b4485d3565ff36a6cee51d4e7b33c7ae/claude-api/shared/`. Files `model-migration.md` (line numbers given), `models.md`, `cost-optimization.md`. A summary of the Anthropic docs, so treat it as [A] but second-hand. |
| A11 | Launch posts: Opus 5.5 https://www.anthropic.com/claude-opus-5-5 (2026-09-22); Sonnet 5.5 https://www.anthropic.com/claude-sonnet-5-5 (2026-09-28); Fable 5.1 https://www.anthropic.com/claude-fable-and-mythos-5-1 (September 2026; system card dated 2026-09-01) |
| A12 | System cards (PDF). Opus 5.5 (2026-09-22): https://www-cdn.anthropic.com/fc1b44717c85dc068bc6ba5024219938094694bd/Claude%20Opus%205.5%20System%20Card.pdf . Sonnet 5.5 (2026-09-28): https://www-cdn.anthropic.com/870c8f525702625d2c62fc6dd04c857e3250bec1/Claude%20Sonnet%205.5%20System%20Card.pdf . Fable 5.1 (2026-09-01): https://www-cdn.anthropic.com/0339e6a7c5c7b87f5c07798616dc32c215d14235/Claude%20Fable%205.1%20&%20Claude%20Mythos%205.1%20System%20Card.pdf |
| A13 | Anthropic blogs: "Using Claude Code: Spending your effort" (Thariq Shihipar, 2026-09-25) https://claude.dev/blog/spending-your-effort/ ; "What a task costs on Opus 5.5" (Addy Osmani, 2026-09-25) https://claude.dev/blog/what-a-task-costs-on-opus-5-5/ ; "Building with Claude Sonnet 5.5" (Addy Osmani, 2026-09-28) https://claude.dev/blog/building-with-claude-sonnet-5-5/ ; "Choosing a Claude model and effort level in Claude Code" (Lydia Hallie, published 2026-07-07, modified 2026-08-20, pre-dates the 5.5 models) https://claude.com/blog/claude-model-and-effort-level-in-claude-code |
| I1 | Artificial Analysis (AA) release pages, Intelligence Index v4.3.2, fetched 2026-10-04: https://artificialanalysis.ai/models/releases/claude-opus-5-5 , .../claude-sonnet-5-5 , .../claude-fable-5-1 . Per-variant numbers were read from the page's embedded data, not from a summary. All AA variants are labelled "Default Fallback" (safeguard fallback enabled). |
| I2 | GitHub issues on anthropics/claude-code (numbers given per claim) |

Caveat on method: an AI page-summariser gave several wrong numbers on the first pass (for example it attached Terminal-Bench figures to the wrong rows). Every number below was re-checked against the raw page text, the PDF text, or the page data.

---

## Claude Fable 5.1

### 1. Default effort and supported levels

- Levels: `low`, `medium`, `high`, `xhigh`, `max`. [A] A1: "Claude Fable 5.1 supports all five effort levels. **Start with `high`, the default.**"
- API default `high`. [A] A7 overview table, row "Default effort": Fable 5.1 `high`, Opus 5.5 `medium`, Sonnet 5.5 `high`, Haiku 4.5 "Not supported".
- Claude Code default `high`. [A] A9: "The model's default effort: `high` on every model that supports effort, except that Opus 5.5 and Sonnet 5.5 default to `medium`, Opus 4.7 defaults to `xhigh`".
- Claude Cowork and claude.ai default `medium`. [A] A11 (Fable post): "Fable 5.1 defaults to High effort in Claude Code, and to Medium in Claude Cowork and on Claude.ai."
- Thinking cannot be turned off on Fable models. [A] A9: "You can't turn thinking off on Opus 5.5, Sonnet 5.5, or the Fable models."

### 2. What each level does in practice

Generic (all models), [A] A6: `low` "Claude minimizes thinking. Skips thinking for simple tasks where speed matters most." `medium` "Claude uses moderate thinking. May skip thinking for simple queries." `high` "Claude thinks on most requests that benefit from it." `xhigh` "thinks more readily and at greater depth than at `high`, suited to extended exploration." `max` "thinks the most readily and at the greatest depth, with no constraint on thinking length." Also A1: "Effort is a behavioral signal, not a strict token budget." and "Lower effort also means fewer and terser tool calls."

Fable-specific:

- Thinking and tool behaviour at `low`: [A] A5: "At `low` effort, Claude Fable 5.1 is less likely than Claude Fable 5 to call a search or retrieval tool, and more likely to answer from memory." A5 vision section (via A10 line ~1836): at `low` the model "may answer from an overall impression without calling" its crop tool.
- At `xhigh`/`max`: [A] A5: "At `xhigh` and especially `max` effort, Claude Fable 5.1 can think for longer before it starts writing its reply. When a single request asks for a long deliverable ... it may draft much of that deliverable in its thinking and then write it out again as the reply, which means a longer wait and more output tokens." A10 `model-migration.md` lines 1764-1770 put this at "roughly double the output tokens".
- At higher effort on routine work: [A] A10 `model-migration.md` line 1472: "At higher effort on routine work, Claude Fable 5.1 can gather context and deliberate beyond what the task needs (the flip side: higher effort buys excellent verification behavior and the most rigorous outputs)."
- Turn length: [A] A10 line 1468: "Individual requests on hard tasks can run many minutes at higher effort (a 15-minute single request is normal ...)".
- Progress narration: [A] A5: fewer user-facing updates during long tool-calling turns, "more pronounced at higher effort and in longer tool chains".
- Tokens and time, measured, Terminal-Bench 3.0, 370 attempts per setting, Anthropic internal runs [A] A13 (Spending your effort): Fable 5.1 at `low`: "median 73k tokens each", 140 of 370 passed. At `max`: "median 222k tokens each", 214 of 370 passed. Failures "missed a case" fell 59 to 24, "a bug its tests missed" 40 to 14. Same post: higher effort "does not fix when the model has the wrong approach"; "picked the wrong reading" rose 25 to 47.
- Same post, task `html-js-filter`: "Fable 5.1 went from 1/5 at low to 5/5 at xhigh." Low attempt "about 2 minutes", high-effort run "about 33 minutes".
- Time per episode, corpus defect benchmark, Fable 5.1 solo [A] A2: "15.2, 17.5, and 19.9 hours per episode at `low`, `medium`, and `high`". Cost "$468 to $552 per episode across the three effort settings, and only its accuracy moved."
- Research loops (measured with Fable 5, not 5.1) [A] A2: "`low` took 4.5 minutes per problem on DeepWideSearch, compared with 7.9 minutes at the default."
- Independent measurement of the same trend (Artificial Analysis Intelligence Index v4.3.2, 10 evals) [I] I1. Per Intelligence Index task:

| Fable 5.1 effort | Index score | Cost per task | Output tokens per task | Time per task | Median time to first answer token | Output tokens/s |
|---|---|---|---|---|---|---|
| low | 46.8 | $2.37 | 21.6k | 269 s | 3.6 s | 49 |
| medium | 48.9 | $2.98 | 27.9k | 317 s | 10.6 s | 53 |
| high | 51.2 | $3.91 | 38.1k | 432 s | 24.2 s | 53 |
| xhigh | 53.2 | $5.98 | 60.5k | 601 s | 122.5 s | 66 |
| max | 53.4 | $7.63 | 78.1k | 757 s | 259.1 s | 66 |

  Arithmetic on the above: `max` costs 3.2x `low` for +6.5 index points; `xhigh` to `max` adds +0.2 points for +28% cost.
- Per-eval AA detail, Fable 5.1, [I] I1 (Elo values are printed by the page to 3 significant figures, so rounded here): Terminal-Bench 4.0 pass rate low 0.404, medium 0.449, high 0.520, xhigh 0.551, max 0.520 (max below xhigh). GDPval-AA Elo low ~1470, medium ~1550, high ~1630, xhigh ~1740, max ~1760 (Anthropic's card reports 1853 `max` and 1835 `xhigh` from AA's own run, so AA's current index run differs from the card). AA-Omniscience low 34.1, medium 37.6, high 40.8, xhigh 42.4, max 43.5 (output tokens per task 145 at low, 5,372 at max).

### 3. Anthropic's recommended use per level

- [A] A1: "Start with `high`, the default. Step up to `xhigh` or `max` for the most capability-sensitive agentic and coding work, and step down to `medium` or `low` for routine or latency-sensitive work once your evals show quality holds."
- [A] A5: "Start at the default effort level, `high`, then test the other levels ... Re-run the sweep even if you already ran one on Claude Fable 5: effort level names don't correspond to the same amount of thinking across models."
- [A] A5: "At `medium`, results roughly match Claude Fable 5 at lower cost, so step down to `medium` or `low` where your evals show quality holds."
- [A] A5: "At `low`, Claude Fable 5.1 is often competitive with Claude Opus and Claude Sonnet models on cost per task while scoring higher, so include it in the comparison wherever you'd otherwise run a smaller model at a higher effort level."
- [A] A5 on long deliverables: "The simplest approach is to run requests like these at `high`, the recommended starting point, and move to `xhigh` or `max` only where you've measured a quality gain."
- [A] A9 (Claude Code level table, all models): `low` "Quick exchanges where you review each result, such as brainstorming, a first sketch, or a small change like a rename"; `high` "Work where verification matters or edge cases are likely, such as fixing a bug in an existing codebase"; `max` "Hard problems you want Claude to work through without you, such as finding security vulnerabilities. `max` may show diminishing returns and is prone to overthinking, so test before adopting it broadly".
- [A] A13 (Thariq, Opus 5.5 and Fable 5.1): "Low: for when I want quick responses that are in the loop, e.g. brainstorming, sketching, easy changes. Medium: for most of my regular software engineering work ... High: for work where verification is important or there are edge cases ... Max: When I want Claude to operate fully autonomously to solve difficult problems". Also: "higher effort is best for tasks with lots of hidden edge cases"; Terminal-Bench 3.0 Fable 5.1 pass rate low to top effort: security 64% to 87%, hardware 34% to 75%, ML 54% to 73%, science 41% to 61%, software 43% to 56%, media 18% to 30%, operations 12% to 22% ("Rulebook-style work stays low").
- [A] A13 (Hallie, claude.com blog): "Fable, even at low effort, is that specialist glancing at the problem everyone else is stuck on and still spotting the thing no one else would ... it's worth saving for the tasks that genuinely need it." Also: "In our testing, it finished jobs Opus and Sonnet can't reach at any effort level."

### 4. Cross-model comparisons involving Fable 5.1

- [A] A2: "Claude Fable 5.1 at `low` effort solved 88.6% of tasks for $0.54 per solved task, against 77.4% for $0.84 from Claude Sonnet 5 at its default" (SWE-bench Pro subset). Footnote in A2 gives an earlier `low` run at 88.6% for $0.48 per task, so the cost varies by run.
- [A] A2: Opus 5.5 at default `medium` "matched Fable 5.1 at its default (92.8% against 92.3%, inside run-to-run noise) for about a fifth of the cost per solved task ($0.22 against $1.19)."
- [A] A2: coding benchmark: Opus 5.5 86.6% vs "84.2% for Fable 5.1 at `medium` (a single Fable 5.1 run), for under a third of the cost per attempt ($0.84 against $2.68)".
- [A] A2: DeepResearch Bench II: "Fable 5.1 at `low` scored 10 points above Sonnet 5 (66% against 56%) at about four times the cost per task ($4.66 against $1.20)"; Opus 5 default 71% for $6.71 vs Fable 5.1 default 65% for $7.12, "so on research too Fable 5.1 earns its price only at `low`".
- [A] A2: Chartography: Opus 5.5 `low` 68.7 for ~$0.03 a chart vs 62.5 for $0.15 from Fable 5.1 `low`.
- [A] A2: "For most agent workloads, start with Claude Opus 5.5 at its default effort (`medium`), and use Claude Fable 5.1 for demanding reasoning and long-horizon agentic work, or when your evals on Claude Opus 5.5 at higher effort still fall short."
- [A] A12 (Opus 5.5 system card, section 8.8): CursorBench v4.0: Opus 5.5 `medium` 52.5% "still above Claude Fable 5.1 at max effort" (51.8% for $17.28 per task).
- [I] AA index (table above vs Opus 5.5 table): Fable 5.1 `high` 51.2 at $3.91 equals Opus 5.5 `medium` 51.2 at $1.34.
- Tension to note: A5 says Fable `low` is "competitive with Claude Opus and Claude Sonnet models on cost per task while scoring higher", but on the AA index Fable `low` (46.8, $2.37) scores below and costs more than Opus 5.5 `medium` (51.2, $1.34). A5 does not say which Opus/Sonnet versions it compares with.

### 5. Known quirks

- Over-deliberation at higher effort on routine work: see section 2 (A10 line 1472). [A]
- Scope creep at higher effort: [A] A12 (Fable system card, section 8.4 FrontierCode): "Fable 5's score keeps climbing with effort, whereas Fable 5.1's peaks at medium, scoring below Fable 5 at high, xhigh, and max." Cause given: "at higher efforts, Fable 5.1 occasionally adds more small, unrequested changes in files outside the task, such as a documentation comment in an adjacent file, an edit to a docs page, or a new CI job". FrontierCode Main: 50.9% at medium. "Adding a brevity instruction ... helped reduce out-of-scope edits". Anthropic's no-tidying prompt is in A10 line 1472.
- `max` is not always better: AA Terminal-Bench 4.0 max 0.520 vs xhigh 0.551 [I]. Anthropic: GDPval-AA "xhigh matches max within the confidence interval while using about 25% fewer output tokens"; AA-Briefcase xhigh 1686 vs max 1694 "while using 19% fewer output tokens", and `high` (1611) "beats every non-Claude model while using 47% fewer tokens" [A] A12 sections 8.15.3 and 8.15.4.
- Under-searching at `low`: see section 2. Anthropic's fix is raising effort for those turns or a prompt line (A5).
- Per-message effort changes steer more reliably than top-level ones: [A] A1: "A top-level change restarts the cache and also steers the model less reliably: its earlier replies were written at the previous level, and it tends to stay consistent with them."
- Long deliverables at `xhigh`/`max`: see section 2.
- Claude Code reports, unverified: [I] I2 #88949 (2026-08-23, Claude Code 2.1.241) and #95743 (2026-09-20, 2.1.278): users asked Fable 5.1 what effort value it sees. At `high` it reported `<reasoning_effort>10</reasoning_effort>`; at `xhigh` it reported 40. The model reads 10 as "low" and said it would "keep deliberation brief". These are model self-reports from single users, Anthropic's reply is only referenced second-hand ("public statement by Thariq ... that '10' has no real meaning"), and I did not find the statement itself. Not evidence of actual behaviour; recorded because it suggests a model-specific numeric scale behind the level names.
- Single-user reports with no evidence attached: #92499 (2026-09-06) quota used up fast with 3-4 parallel Fable 5.1 sessions at `low`; #96153 (2026-09-22) ECONNRESET at normal effort that disappeared at `max`. [I]

### 6. Benchmarks by effort level (numbers)

- Terminal-Bench 3.0, Fable 5.1, 370 attempts: low 140 passed (37.8%, arithmetic), max 214 passed (57.8%, arithmetic); medians 73k vs 222k tokens. [A] A13.
- SWE-bench Pro subset (478 problems): `low` 88.6%, $0.54 per solved task. [A] A2.
- DeepResearch Bench II: `low` 66% for $4.66 per task; `medium` 65% for $7.12; `high` "nearly the same". [A] A2: "raising the effort in this case does not increase the quality of the output noticeably".
- Research and knowledge-work benchmarks (WideSearch, DeepWideSearch, BrowseComp, GDPval; run with **Fable 5**, not 5.1): "`low` gave up 1 to 3 points for a third to a half off the cost per task, `medium` matched the default's accuracy at about 70% to 87% of its cost, and the default bought nothing measurable over `medium`". [A] A2.
- Corpus benchmark: $468 to $552 per episode over three efforts; only accuracy moved. [A] A2.
- FrontierCode v1.1: Main 50.9% at `medium`; Extended 63.6% at `medium`; score falls above `medium` (scope penalty). Cost vs Fable 5: "cheaper per task than Fable 5 at every effort level (by roughly half at low, medium, and high effort and by about 30% at xhigh and max)". [A] A12.
- CursorBench v3.2.0: 73.4% at `max`; 68.0% at `medium` for $3.53 per task. [A] A12 section 8.8. (Version 3.2.0; Opus 5.5 and Sonnet 5.5 cards use v4.0, so these are not comparable.)
- GDPval-AA Elo: 1853 `max`, 1835 `xhigh`. AA-Briefcase Elo: 1694 `max`, 1686 `xhigh`, 1611 `high`. [A] A12 (run by AA).
- AA Intelligence Index per level: see section 2 table. [I]

### 7. Pricing and cost impact of effort

- Price: $10 input / $50 output per MTok; cache reads $0.25 per MTok; batch $5 / $25. [A] A10 `models.md` Fable 5.1 entry; A7: "prompt cache reads cost 10% of the base input price (2.5% on Claude Fable 5.1 ...)".
- Effort changes billed output (thinking is billed as output): [A] A13 (Osmani): "Output includes thinking. You pay for all of it, even when Claude Code only shows you a summary."
- Measured cost multipliers: AA index `max` is 3.2x `low` on cost (table above). Anthropic: Fable 5.1 SWE-bench Pro (per A2 comparison) cost per solved task $0.54 at `low`, $1.19 at default; `xhigh` of Opus 5.5 is 2.5x `high` cost (that is Opus, see below).
- A2 table: lower effort cuts cost "Knowledge work: `medium` 13% to 31%, `low` a third to a half; long coding: `medium` about 30% and `low` about two thirds, both against `high`" (generic, not Fable-only).
- Fable 5.1 vs Fable 5: cache reads cheaper so "Fable 5.1 matches Claude Fable 5's score for 43% less per solved task, most of it the lower cache-read price" [A] A2.

---

## Claude Opus 5.5

### 1. Default effort and supported levels

- Levels: all five. [A] A1: "Claude Opus 5.5 supports all five effort levels, and `medium` is the default (Claude Opus 5 and earlier Opus models default to `high`, so a request that omits `effort` runs one level lower than it did on Claude Opus 5)."
- Default `medium` on the API and in Claude Code. [A] A7, A9: "Opus 5.5 starts at `medium` unless one of the sources above sets a level for it".
- Claude Code detail: [A] A9: "a top-level `effortLevel` in your user settings file doesn't count for Opus 5.5" (that older key still applies to Opus 5, Fable 5.1 and earlier).
- Thinking cannot be disabled (`thinking: disabled` returns 400 at every level). [A] A1, A8.

### 2. What each level does in practice

- Generic level behaviour: see Fable section 2 (A6, A1).
- [A] A3: "At a given level, Claude Opus 5.5 tends to think more per turn than Claude Opus 5, especially at `xhigh` and `max`. If you keep the `effort` value you set for Claude Opus 5, expect longer turns and more output tokens."
- [A] A3: "To get less thinking, lower the effort level first. Lowering effort reduces thinking, and with it cost and latency, more reliably than prompt instructions do."
- At `low`: [A] A3: "At `low` the model keeps its thinking short. How often it skips thinking altogether depends on your prompts". Charts: "even at its lowest effort setting it read values off dense charts more accurately than Claude Opus 5 did at its highest, using a small fraction of the output tokens."
- Claude Code behaviour at higher level: [A] A9: "Claude at a higher level tested more edge cases and verified more of its work before answering. It also made more choices on its own. At a lower level, Claude returned a starting point sooner."
- Tool calls: [A] A13 (Osmani): "At lower effort it makes fewer tool calls and keeps them shorter."
- Wall-clock, same prompt, Opus 5.5 in Claude Code [A] A13 (Thariq): underspecified fitness-app task `low` 1.5 min, `medium` 4 min, `high` 11 min, `max` 67 min. Highly specified version of the same build: `low` 16 min, `medium` 22 min, `high` 33 min, `max` 79 min ("the models behaved much more similarly" when the spec was detailed). Design task: `low` 1 min vs `max` 28 min.
- Same post, Terminal-Bench 3.0 failures at low: `mvcc-lsm-compaction` "Opus 5.5 went from 0/5 at low to 4/5 at xhigh" (low: ~1 minute, "would edit the code before building it or running the reproducer"; xhigh ~11 minutes); `cli-2ph-simplex` 0/5 at low to 5/5 at high (low attempts "stopped around 10k tokens"); `gsea-proteomics` 0/5 to 4/5 at high.
- Independent measurement [I] I1, per Intelligence Index task:

| Opus 5.5 effort | Index score | Cost per task | Output tokens per task | Time per task | Median time to first answer token | Output tokens/s |
|---|---|---|---|---|---|---|
| low | 42.3 | $0.55 | 10.2k | 87 s | 4.5 s | 71 |
| medium | 51.2 | $1.34 | 25.7k | 221 s | 24.3 s | 73 |
| high | 53.6 | $1.82 | 35.6k | 295 s | 34.4 s | 72 |
| xhigh | 56.0 | $3.46 | 65.7k | 522 s | 153.2 s | 78 |
| max | 57.6 | $5.98 | 119.2k | 794 s | 716.0 s | 92 |

  Arithmetic: `max` vs `low` is 10.9x cost, 11.7x output tokens per task, 9.1x time, for +15.3 index points. `medium` reaches 89% of `max` score at 22% of `max` cost.
- AA per-eval, Opus 5.5 [I] I1: Terminal-Bench 4.0 pass rate low 0.313, medium 0.525, high 0.566, xhigh 0.596, max 0.596. GDPval-AA Elo low ~1236, medium ~1590, high ~1710, xhigh ~1840, max ~1870 (rounded; the system card reports 1846 `max` and 1820 `xhigh`). SciCode low 0.586, medium 0.593, high 0.604, xhigh 0.650, max 0.669 (output tokens per task 700 at low to 22,607 at max). AA-Omniscience low 38.9, medium 40.3, high 40.6, xhigh 42.6, max 46.4.

### 3. Anthropic's recommended use per level

- [A] A1: "Run an effort sweep on your own evals rather than carrying settings over from an earlier model, and set a large `max_tokens` at the higher levels".
- [A] A3: "Start at `medium` ... Reserve `xhigh` and `max` for work where you've measured a quality gain."
- [A] A10 `model-migration.md` line 2012: "Start at `medium` and test the neighboring levels; reserve `xhigh` and `max` for work where you have measured a quality gain".
- [A] A13 (Osmani): "Try medium for well-scoped, day-to-day work. When medium stalls, try high ... Use low for mechanical work, like renames or applying a known pattern across files." "A rough way to think about effort pricing: say high adds 20K thinking tokens across a task. On Opus 5.5 that's $0.40 ... So high pays for itself on a task where it saves one retry. On a task medium would have finished the first time, it's wasted." Also: "Raise effort before you change models." and for "a mechanical edit across many files, keep Opus 5.5 and set effort to low".
- [A] A13 (Osmani): before raising effort "check whether the model has a way to check its work. A test run costs one turn and its output. More effort adds thinking to every turn."
- [A] A9 level table: `medium` "fits day-to-day engineering work with a clear scope, such as implementing a new feature"; `high` for bug fixes in an existing codebase; `max` with "diminishing returns".
- [A] A13 (Thariq) workflow: interview then implement on `low`, review, "Verify and test on high effort".
- Re-run failures pattern (SWE-bench Pro subset, Opus 5.5): [A] A2: "With Claude Opus 5.5 at `low`, 13% of tasks failed; with those re-run at `high`, about 97% passed for about $0.17 each, against 95.3% for $0.29 running everything at `high`". Starting at `medium` instead: "about 97% for about $0.24".
- Customer quotes published by Anthropic [A] A11 (Opus post): "Claude Opus 5.5 is the first model we'd default to at medium effort. In our testing it matched Opus 5 on high effort, while using 20 to 25% fewer output tokens." And: "Even at its lowest effort setting, Claude Opus 5.5 caught 72% of known bugs in our code reviews to Opus 5's 56% at high effort". These are vendor-selected testimonials.

### 4. Cross-model comparisons involving Opus 5.5

- vs Opus 5: [A] A3: "Claude Opus 5.5 at `medium` matches or exceeds Claude Opus 5 at `high` on coding and knowledge-work evaluations, and on several coding evaluations `low` comes close to it at much lower cost." [A] A10 line 2036: at default "matched or beat Claude Opus 5's `high`-effort results on such tasks, in fewer steps and with about half the tokens"; knowledge work "at `medium` it produced better long analytical deliverables than Claude Opus 5 at `high` with roughly 40% fewer output tokens".
- Terminal-Bench 4.0: [A] A11: "Opus 5.5 at default effort beats Opus 5 at max effort for about a fifth of the cost." FrontierCode: at default `medium` 54.6%, "beating GPT-6 Astra's top score (53.3%) for about a fifth of the cost per task".
- vs Fable 5.1: see Fable section 4. [A] A2 "matched Fable 5.1 at its default (92.8% against 92.3%) ... for about a fifth of the cost".
- vs Sonnet 5.5, CursorBench 4.0 [A] A12 (section 8.8 of both cards): Opus 5.5 57.8% `max`, 56.0% `xhigh` and `high`, 52.5% `medium`. Sonnet 5.5 55.5% `max`, 53.1% `xhigh`, 47.8% `high`, 39.2% `medium`. So Sonnet 5.5 reaches Opus 5.5 `medium` only at `xhigh`.
- vs Sonnet 5.5, AA index [I]: Opus 5.5 `medium` 51.2 at $1.34 vs Sonnet 5.5 `xhigh` 51.9 at $2.75; Opus 5.5 `low` 42.3 at $0.55 vs Sonnet 5.5 `medium` 40.8 at $0.59 and `high` 46.8 at $1.12.
- Haiku 4.5 on GPQA Diamond: 63% at about a fifth of Opus 5.5's cost per question; Opus 5.5 92%. [A] A2.

### 5. Known quirks

- Default dropped from `high` to `medium` versus Opus 5, so omitting `effort` is now one level lower. [A] A1, A8.
- More thinking per turn at the same level than Opus 5, especially `xhigh`/`max`. [A] A3, A8: "Re-run your effort sweep rather than carrying a setting over".
- Not monotonic on scope-graded coding: [A] A12 section 8.4: "Opus 5.5's highest FrontierCode scores--54.6% on Main and 65.3% on Extended--are at medium effort. Scores decline above medium effort but mostly recover at max. At max effort, Opus 5.5 scores 54.4% on Main and 63.6% on Extended." Reason: the grader "penalizes out-of-scope changes that may be unnecessary, even if they are high quality or helpful".
- Diminishing returns above `high` on some evals: CursorBench 4.0 `high` = `xhigh` = 56.0% [A] A12. GDPval-AA: "xhigh achieves similar performance as max while using about 51% fewer output tokens"; AA-Briefcase: "xhigh ... using about 41% fewer output tokens" [A] A12. AA Terminal-Bench 4.0 `xhigh` = `max` = 0.596 [I].
- `max` overthinking: [A] A9: "`max` may show diminishing returns and is prone to overthinking". [A] A10 line ~1030 (Opus 5 section): "can show diminishing returns and overthink simpler tasks".
- Low-effort behaviour: [A] A12 (Opus 5.5 card): at low effort a refusal of a hidden side task "typically stays in its reasoning" (safety eval, not a quality note).
- Tool-call and chat: [A] A3: in multi-turn chat the model "sometimes goes back over an earlier answer while it thinks about a new message, even a short follow-up, which adds thinking and latency on later turns"; removing "think carefully" lines from chat system prompts "made replies start sooner, with no clear decline in the quality".
- Independent, single-user observations [I]:
  - #98679 (2026-10-01): at explicit `high`, median thinking tokens per request 47 (Opus 5, 64 sessions) to 67 (Opus 5.5, 2026-09-23 to 30, 29 sessions) to 126 (Opus 5.5 on CLI 2.1.286, 2026-10-01, 8 sessions); median output tokens per request 417 to 447 to 711. The reporter attributes it to a model or server-side change on 2026-10-01; a second commenter ties a similar shift to a server-delivered system prompt change at the minute, with client version unchanged (2.1.283). Unconfirmed by Anthropic in what I read; sample sizes are small.
  - #97117 (2026-09-25): one user reports scope creep and task drift on Opus 5.5 vs Opus 4.6. A commenter (nijave) says: "If you have effort above medium, try lowering it ... it behaves like a required threshold instead of an upper bound like Fable ... the model will 'find things to do' that weren't asked for if it's set too high." Anecdote; Sonnet 5.5 card and Fable 5.1 card (FrontierCode notes) independently describe out-of-scope edits at higher effort.
  - #95232 (2026-09-17): "Opus 5 with medium effort ... latency and token rate have increased exponentially". Opus 5, not 5.5, no data attached.

### 6. Benchmarks by effort level (numbers)

SWE-bench Pro, Anthropic subset (478 problems), average of two runs at low/medium/high and one at xhigh, 2026-09-19 to 20 [A] A2 (reference 3): vs `high`, `medium` "about 2.5 points lower ... for about 70% of the cost", `low` "about 8 points lower ... for about a third of the cost", `xhigh` "about 1.4 points higher for 2.5 times the cost of `high`". Absolute: `low` 87.4% at $0.12 per solved task; `medium` 92.8% at $0.22; everything at `high` 94.8% to 95.8% for $0.29 (reference 3 text). Scores "are not comparable to the SWE-bench Pro results in the Claude Opus 5.5 system card, which come from runs at `max` effort on a different problem set."

Other, Opus 5.5 [A]:
- Internal agentic-coding benchmark (370 repository tasks, 128k output cap) [A] A2: `medium` (the default) 86.6% at $0.84 per attempt; `high` about 88.4% (arithmetic: A2 says the Opus 5.5 `high` + Fable 5.1 advisor pairing's 90.1% is "1.7 points over Opus 5.5 alone at `high`") at about $1.38 per attempt (A2 gives $1.38 for the executor alone at `high`); `xhigh` 91.1% for $4.11 per attempt (one attempt per task; `medium` and `high` had five). The pairing at `high` scored 90.1% at $2.92 per attempt, "about what more effort does".
- Chartography: `low` 68.7 at ~$0.03 per chart.
- FrontierCode (Cognition): `medium` 54.6% Main / 65.3% Extended (peak); `max` 54.4% / 63.6%. A12.
- CursorBench 4.0: `medium` 52.5%, `high` 56.0%, `xhigh` 56.0%, `max` 57.8%. A12.
- GDPval-AA Elo: `xhigh` 1820, `max` 1846. AA-Briefcase Elo: `high` 1705, `xhigh` 1780, `max` 1822. A12 (AA-run).
- Independent AA index, all five levels: section 2 table. [I]

### 7. Pricing and cost impact of effort

- Price: $4 / $20 per MTok; 5-minute cache write $5, 1-hour $8; cache reads $0.20; batch $2 / $10; fast mode $8 / $40. [A] A10 line 2030 and A7. A13: "Input and output tokens are 20% cheaper than on Opus 5. Cache reads are 60% cheaper."
- [A] A13 (Osmani): "On Opus 5.5, an output token costs 100 times a cache read. The 60K output tokens of a typical task cost $1.20, the same as reading 6M tokens from cache. Output includes thinking."
- Cost vs `high` (SWE-bench Pro): `medium` ~70%, `low` ~33%, `xhigh` ~250%. [A] A2.
- AA cost per Intelligence Index task: $0.55 (`low`) to $5.98 (`max`), "Prices vary up to 11x across models." [I] I1.
- Opus 5.5 default effort vs Opus 5 default: "40% less to run than Opus 5" at typical workloads [A] A11, which A13 explains as price cut plus fewer tokens at `medium`; A13 also warns "Opus 5.5 can use more tokens on an answer, because it always thinks before it replies."
- Cache: changing effort mid-session on the API: top-level change invalidates cache; per-message effort (beta `mid-conversation-output-config-2026-07-01`) does not. [A] A1. In Claude Code on API key or subscription "changing effort keeps the cache"; on Bedrock, Google Cloud's Agent Platform or a gateway it "still clears the cached conversation". [A] A13 (Osmani).

---

## Claude Sonnet 5.5

### 1. Default effort and supported levels

- Levels: all five. [A] A1: "Claude Sonnet 5.5 supports all five effort levels, and `high` is the default on the Claude API."
- **Default differs by surface.** API `high` [A] A1, A7. Claude Code and Claude apps `medium` [A] A11 (Sonnet post): "In Claude Code and our apps, the default effort is set to Medium, while the Claude Platform defaults to High." Same in A9 ("Opus 5.5 and Sonnet 5.5 default to `medium`") and A13 (Osmani): "surfaces can ship with different default efforts for Sonnet, such as high on Claude Platform and medium in Claude Code."
- Levels are recalibrated versus Sonnet 5. [A] A1: "a level doesn't produce the same amount of thinking as the same level on Claude Sonnet 5."
- Thinking cannot be disabled; `thinking: {"type": "between_tools"}` is the lowest setting, valid only at `low`, `medium`, `high`. [A] A1, A4. At `xhigh`/`max` it returns 400 and up-front thinking cannot be turned off.

### 2. What each level does in practice

- [A] A4: "From `medium` up, the model thinks briefly before almost every reply, even a greeting, which adds to the time before the first visible token. Asking it in the system prompt to think less doesn't reliably reduce its thinking. At `low`, it skips thinking on most simple requests."
- `low`: [A] A4: "At `low`, it keeps its thinking short and can skip verifying a change." "At `low`, it sometimes reports a change as done without running a check that exercises it".
- `low`/`medium` on long agentic tasks: [A] A4: "On agentic coding tasks at `low` and `medium` effort, the model sometimes checks in before the work is done. It might pause to confirm a plan, ask a question it could answer itself, or stop after one part of a multipart task to ask whether to continue. Try a higher effort level first."
- `xhigh`/`max`: [A] A4: "At these levels the model is especially thorough. After it finishes a task, it can start its own rounds of review and verification, sometimes with subagents if your harness provides them. It can also make related fixes it noticed along the way. This takes more time and tokens, so run routine work at `high` or below, where it's rare." Their stop-instruction prompt "stopped the model from launching reviewer subagents and cut session cost by about a third, with no change in quality" at `max`.
- Unrequested additions: "It does this at every effort level, and more at higher effort." (tests, docs, small supporting files) [A] A4.
- Evidence of per-level tool behaviour in launch post: "Our coding evals showed a third fewer tool calls and roughly half the shell runs to finish a task" (customer quote, vs Sonnet 5, not per level). [A] A11.
- Health benchmark effect of level, Sonnet 5.5 system card [A] A12: HealthBench (general Q&A) "All five effort levels score within 0.7 points of each other on the length-adjusted score (64.7% to 65.4%). Response time is 8 to 13 seconds per answer from low to xhigh and about 36 seconds at max." Agentic PhysicianBench: "Effort matters a great deal. low and medium effort are not distinguishable (27.2% and 30.0%), and every step above that is a gain, with model time per task rising from under 2 minutes at high to about 4 minutes at xhigh and about 14 and a half minutes at max."
- Independent measurement [I] I1, per Intelligence Index task:

| Sonnet 5.5 effort | Index score | Cost per task | Output tokens per task | Time per task | Median time to first answer token | Output tokens/s |
|---|---|---|---|---|---|---|
| low | 35.9 | $0.42 | 14.3k | 95 s | 1.2 s | 93 |
| medium | 40.8 | $0.59 | 20.9k | 137 s | 1.1 s | 95 |
| high | 46.8 | $1.12 | 37.3k | 238 s | 12.9 s | 96 |
| xhigh | 51.9 | $2.75 | 74.8k | 455 s | 35.8 s | 101 |
| max | 56.0 | $7.67 | 197.4k | 921 s | 454.6 s | 132 |

  Arithmetic: `max` vs `low` is 18.4x cost, 13.9x output tokens per task, 9.7x time for +20.1 index points. Median time to first answer token is about 1 s at `low` and `medium`, then 12.9 s at `high` and 35.8 s at `xhigh`.
- AA per-eval, Sonnet 5.5 [I] I1: Terminal-Bench 4.0 pass rate low 0.207, medium 0.298, high 0.439, xhigh 0.571, max 0.636. GDPval-AA Elo low ~1180, medium ~1320, high ~1550, xhigh ~1730, max ~1840 (rounded; the system card reports 1725 `xhigh` and 1844 `max`). AA-Omniscience low 19.4, medium 20.1, high 20.9, xhigh 23.5, max 32.3. SciCode 0.491 / 0.529 / 0.537 / 0.573 / 0.610.

### 3. Anthropic's recommended use per level

- [A] A1 and A4: "Start with `high` unless your workload is agentic or latency-sensitive. For agentic coding and multistep tool use, start with `medium` for well-specified tasks and move to `high` for harder or longer ones. For chat and other latency-sensitive work, start with `medium` or `low`. Use `xhigh` or `max` only where your evals show a quality gain."
- [A] A10 line 2178 (model-migration): "`medium` for agentic coding and multistep tool use; `low` for chat, content generation, classification, extraction, and search. Reserve `xhigh` and `max` for work with a measured quality gain".
- [A] A13 (Osmani): "If you're tempted to use xhigh or max effort, keep in mind that Sonnet 5.5 will think longer and cost more. On some tasks, you may lose some of what makes Sonnet useful: its balance of quality, speed, and cost. In that case, consider Opus 5.5."
- [A] A11: "On several benchmarks, Sonnet 5.5 at Low or Medium effort beats Sonnet 5's best score for about a tenth of the cost per task. It complements Opus 5.5 best when running at lower effort settings, where it costs less per task. At higher settings, it can perform comparably at a similar cost."
- [A] A4 on max_tokens: "For agentic coding, set `max_tokens` to 128,000, the model's maximum, and stream the response."
- [A] A4: add a "run a real check" paragraph when coding at `low` ("makes skipped or superficial checks rare, with no measurable change in task quality and only a slightly higher cost per task").

### 4. Cross-model comparisons involving Sonnet 5.5

- vs Sonnet 5: [A] A10 line 2179: "On most agentic coding evals it scored higher at `medium` than Claude Sonnet 5 did at `high`, typically at under a fifth of the cost; on computer use at `high` it completed substantially more tasks than Claude Sonnet 5 at its highest effort, with under a third of the tokens." [A] A11: Terminal-Bench 4.0 at `medium` "far exceeds Sonnet 5's best score for less than a tenth of the cost per task"; CursorBench: Sonnet 5.5 at `low` "exceeds Sonnet 5's best score for less than a tenth of the cost per task"; FrontierCode at `high` scores "10 points higher than Sonnet 5 at the same setting, at about one fifteenth of the cost per task".
- vs Opus 5.5: [A] A11: "On several evaluations, Sonnet 5.5 at Max effort even performs comparably to Opus 5.5. However ... Opus 5.5 remains clearly stronger at complex, open-ended work requiring sustained judgment." CursorBench and AA comparisons are in the Opus section 4. GDPval-AA: Sonnet 5.5 1844 at `max` vs Opus 5.5 1846; `xhigh` 1725. AA-Briefcase: Sonnet 5.5 `max` 1811 vs Opus 5.5 1822; `xhigh` 1746 "uses about 61% fewer output tokens than at max". [A] A12.
- Anthropic framing: [A] A13 (Hallie): "Sonnet at high effort is like giving a really good generalist the whole afternoon. They'll read everything, run things, double-check their work, and end up understanding your specific code thoroughly. What they bring less of is that 'I've seen exactly this before' recognition." And "Opus at low effort is like getting five minutes with an expert". (Pre-5.5 wording, but the Sonnet/Opus contrast is the post's point.)
- Claude Code default `medium` for Sonnet 5.5 is the lowest level at which A4 says the model thinks before almost every reply.

### 5. Known quirks

- Recalibrated levels: do not carry Sonnet 5 settings over (A1, A4, A8).
- `low`/`medium` check in early and skip verification (see section 2). [A] A4.
- `max` below `xhigh` on scope-graded coding: [A] A12 section 8.4: FrontierCode Main `xhigh` 52.1%, `max` 46.2%; Extended `xhigh` 64.4%, `max` 59.1%. [A] A11 footnote: "Sonnet 5.5 scores lower at Max effort than at Xhigh ... At Max effort, Sonnet 5.5 more often ran Claude Code's code-review skill, which splits the review across many subagents, and in two cases Cognition examined, this led to a timeout or to extra edits beyond the task's scope".
- Steep curve between levels, unlike Opus 5.5: CursorBench 4.0 Sonnet 5.5 `medium` 39.2% to `max` 55.5%; AA Terminal-Bench 4.0 0.298 (`medium`) to 0.571 (`xhigh`). [A] A12, [I] I1.
- `between_tools` / per-message effort interaction: per-message effort needs adaptive thinking; with `between_tools`, a differing per-message effort returns 400. [A] A1, A4.
- Tool use in chat: [A] A10 line 2198: "On chat and knowledge-work tasks the model sometimes answers from its own knowledge or from public web results when a connected tool ... would serve better, and can hold off on tools until asked directly." (not level-specific)
- GitHub issues specific to Sonnet 5.5 effort behaviour: not found. One older report "/effort medium command produces no response in Claude Sonnet" #90561 (2026-08-29) is about the slash command, not model behaviour. [I]

### 6. Benchmarks by effort level (numbers)

- CursorBench 4.0 (Cursor-run): `medium` 39.2%, `high` 47.8%, `xhigh` 53.1%, `max` 55.5%. [A] A12 section 8.8.
- FrontierCode v1.1 (Cognition): Main `xhigh` 52.1%, `max` 46.2%; Extended `xhigh` 64.4%, `max` 59.1%. [A] A12 section 8.4. At `high`, matches "GPT-6 Sol's best score for about a fifth of the cost per task" [A] A11 (no number in text).
- GDPval-AA Elo: `xhigh` 1725, `max` 1844. AA-Briefcase Elo: `xhigh` 1746, `max` 1811. [A] A12 (AA-run).
- HealthBench, PhysicianBench: section 2. [A] A12.
- AA index all levels and per-eval: section 2. [I]
- Terminal-Bench 4.0 and others at `medium`/`low`: reported only as charts in A11/A12 (not extractable as text). Not found as numbers from Anthropic.

### 7. Pricing and cost impact of effort

- Price: $2 / $10 per MTok; cache writes $2.50 (5 min) / $4 (1 h); cache reads $0.20; "same prices" as Sonnet 5. [A] A10 line 2075, A13 (Osmani) pricing table.
- Sonnet 5.5 "typically needs far fewer tokens to do the same work, it costs up to 30% less for most work" than Sonnet 5. [A] A13 (Osmani).
- AA cost per Intelligence Index task: $0.42 (`low`), $0.59 (`medium`), $1.12 (`high`), $2.75 (`xhigh`), $7.67 (`max`). [I] I1.
- Cache: top-level effort change invalidates cache; per-message effort keeps it. [A] A4.

---

## Claude Haiku 4.5 (effort support only)

- Effort not supported. [A] A7 (Haiku page): row "Default effort | Not supported"; overview table "Default effort ... Not supported"; models list for the effort feature in A1 (`supportedModels`) does not include Haiku 4.5.
- Thinking on Haiku 4.5 is manual extended thinking only. [A] A7: "Claude Haiku 4.5 uses manual extended thinking (`thinking.type: "enabled"`), not adaptive thinking." The thinking-support table in A7 lists Haiku 4.5 as "Extended only" with thinking default "Off".
- Claude Code accepts `/effort max` on Haiku 4.5 and reports success, though the model does not support effort. [I] I2 #96386 (2026-09-23), cites a related 400 error when a carried-over effort hits Haiku (#30760, not read).
- Price: $1 / $5 per MTok. [A] A7 overview table.
- Anthropic says a "Claude Haiku 5.5 will join the family in the coming weeks". [A] A13 (Osmani, 2026-09-28). Effort support for Haiku 5.5: not found.

---

## Cross-model

1. Level names are not comparable across models, per Anthropic. [A] A9: "The effort scale is calibrated per model, so the same level name does not represent the same underlying value across models." [A] A5: "effort level names don't correspond to the same amount of thinking across models". [A] A10 `cost-optimization.md` line 165: "the token allocation behind each level can change between models".
2. Defaults differ: Fable 5.1 `high` (API and Claude Code; `medium` in Cowork/claude.ai), Opus 5.5 `medium`, Sonnet 5.5 `high` on the API and `medium` in Claude Code. [A] A7, A9, A11. Haiku 4.5 none.
3. Anthropic-stated equivalences within a line:
   - Opus 5.5 `medium` >= Opus 5 `high` on coding and knowledge work (A3).
   - Sonnet 5.5 `medium` > Sonnet 5 `high` on most agentic coding evals (A10 line 2179).
   - Fable 5.1 `medium` roughly equals Fable 5 (A5).
   - Sonnet 5 `medium` ~ Sonnet 4.6 `high` (older, A10 line 1233).
4. Anthropic-stated cross-line comparisons:
   - Opus 5.5 default ~ Fable 5.1 default on SWE-bench Pro subset at ~1/5 the cost per solved task (A2).
   - Opus 5.5 `medium` (52.5%) > Fable 5.1 `max` (51.8%) on CursorBench 4.0 (A12 Opus card).
   - Opus 5.5 `low` beats Fable 5.1 `low` on Chartography, 68.7 vs 62.5, at ~1/5 the cost (A2).
   - Sonnet 5.5 needs `xhigh` (53.1%) to match Opus 5.5 `medium` (52.5%) on CursorBench 4.0 (A12 arithmetic across cards).
   - Fable 5.1 `low` "often competitive with Claude Opus and Claude Sonnet models on cost per task while scoring higher" (A5).
   - Opus 5.5 default beats Opus 5 `max` at ~1/5 the cost on Terminal-Bench 4.0 (A11).
5. Independent AA index ordering (v4.3.2, [I] I1), score and cost per task:

| Config | Score | Cost per task |
|---|---|---|
| Opus 5.5 low | 42.3 | $0.55 |
| Sonnet 5.5 medium | 40.8 | $0.59 |
| Sonnet 5.5 high | 46.8 | $1.12 |
| Opus 5.5 medium | 51.2 | $1.34 |
| Opus 5.5 high | 53.6 | $1.82 |
| Fable 5.1 low | 46.8 | $2.37 |
| Sonnet 5.5 xhigh | 51.9 | $2.75 |
| Fable 5.1 medium | 48.9 | $2.98 |
| Opus 5.5 xhigh | 56.0 | $3.46 |
| Fable 5.1 high | 51.2 | $3.91 |
| Fable 5.1 xhigh | 53.2 | $5.98 |
| Opus 5.5 max | 57.6 | $5.98 |
| Fable 5.1 max | 53.4 | $7.63 |
| Sonnet 5.5 max | 56.0 | $7.67 |

   On this index Fable 5.1 is below Opus 5.5 at every matched level from `medium` up and costs more. The index is AA's own 10-eval mix (agentic knowledge work, terminal tasks, science), not a coding-only or long-horizon measure.
6. Shape of the effort curve differs by model on the same index [I] I1: Opus 5.5 gains most from `low` to `medium` (+8.9 index points, 2.4x cost) then flattens (+2.3 to `high`, +2.4 to `xhigh`, +1.6 to `max`). Sonnet 5.5 gains steadily every level (+5.0, +5.9, +5.1, +4.1) and cost climbs steeply at the top (`max` 2.8x `xhigh`). Fable 5.1 gains least per level (+2.1, +2.2, +2.1, +0.2) and its time per task rises least (`low` 269 s to `max` 757 s).
7. Where effort pays versus not, per Anthropic: research and knowledge work nearly flat; long-horizon coding real tradeoff (A2: "Research and knowledge work: nearly flat curves ... Long-horizon coding: a real tradeoff"). Edge-case-heavy and verification-heavy work benefits (A13 Thariq: security, hardware, ML). Scope-graded "mergeable diff" coding peaks at `medium` for both Opus 5.5 and Fable 5.1 and at `xhigh` for Sonnet 5.5 (A12 section 8.4 of each card). Health Q&A is flat across levels, agentic health tasks are steep (Sonnet 5.5 card).
8. Tool-call behaviour: lower effort gives fewer and terser tool calls on all models (A1). Model-specific: Fable 5.1 searches less at `low` (A5); Sonnet 5.5 skips verification at `low` and checks in early at `low`/`medium` (A4); Opus 5.5 `low` "keeps its thinking short" with unquantified skipping (A3).
9. Cache: changing top-level effort invalidates the prompt cache on all three; per-message effort (beta) keeps it on all three, but needs adaptive thinking on Sonnet 5.5. Fable 5.1: prefer per-message because "steers the model less reliably" otherwise (A1).
10. Subagent effort inherits the session's by default; no per-call effort on the Agent tool. [I] I2 #92660 (2026-09-07), #98391. Claude Code docs: skill and subagent frontmatter `effort` overrides it (A9).

---

## Gaps (not found or not verifiable)

- Per-level token multipliers from Anthropic: none given as text for any of the three models. Only AA's per-index-task measurements (above) and the Terminal-Bench 3.0 medians for Fable 5.1 `low` vs `max` (A13). Anthropic's launch-post and system-card charts of score vs cost at each level are images; their data points are not in the page text.
- Sonnet 5.5 at `low` and `medium` on Terminal-Bench 4.0 and FrontierCode: Anthropic reports "beats Sonnet 5's best score" in words only. Sonnet 5.5 `low` on CursorBench 4.0: not in text.
- Fable 5.1 `low`/`high`/`xhigh` on CursorBench: only `medium` (68.0%, v3.2.0) and `max` (73.4%) in text. Fable 5.1 `high`/`xhigh`/`max` for FrontierCode: described as lower than `medium`, no numbers.
- Opus 5.5 `high`/`xhigh` SWE-bench Pro absolute scores: only deltas to `high` and the `low`/`medium`/`high` absolute figures.
- Benchmark versions differ across cards (CursorBench 3.2.0 in the Fable card, 4.0 in the Opus and Sonnet cards; SWE-bench Pro subset differs between A2 and the system cards; A2 says 482 problems in one place and 478 in another). Do not compare across them.
- Anthropic's own docs disagree in one place: A8 (Fable 5.1 what's new) says "For most workloads, start with Claude Opus 5", while A2 and A7 (newer) say start with Opus 5.5.
- LMArena or other crowd-vote leaderboards: no per-effort results for these three models found. One aggregator snippet lists "Claude Fable 5.1 Max 1498.5" but I could not verify it on lmarena.ai and it omits Opus 5.5 and Sonnet 5.5.
- Independent practitioner write-ups with measurements: none found beyond AA and GitHub issues. SEO and aggregator pages (mindstudio, apidog, cometapi and similar) restate the Anthropic docs and add no data; ignored.
- GitHub issues: nothing found on quality at a given level for Sonnet 5.5; the Fable 5.1 reports are single-user and unsubstantiated (`reasoning_effort` numbers are model self-reports); the Opus 5.5 2026-10-01 shift (#98679) is unconfirmed and could change the Opus numbers above.
- AA data is for the safeguard-fallback configurations ("Default Fallback") on index v4.3.2 and was fetched on 2026-10-04; AA may re-run or change index versions, and AA's page does not state per-variant run counts.
- Haiku 4.5: effort not supported is documented, but the effect of a carried-over effort setting (400 vs ignored) in current Claude Code was not tested; #96386 says untested. Haiku 5.5 effort support: not found.
- Date of docs pages: not shown on platform.claude.com pages; the claude.com "Choosing a Claude model and effort level" post was published 2026-07-07 and modified 2026-08-20, so it predates Opus 5.5 and Sonnet 5.5 and says nothing model-specific about them.
- The Opus 5.5 migration guide, Sonnet 5.5 migration guide and the Fable 5.1 prompting page were fetched; the Anthropic "Prompting Claude Opus 5" and "Prompting Claude Sonnet 5" pages and the Opus 5.5 and Fable 5.1 system card sections outside coding/knowledge-work evals (alignment, welfare, safety) were not read for effort content.
