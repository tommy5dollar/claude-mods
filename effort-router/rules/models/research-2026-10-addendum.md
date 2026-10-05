# Effort behaviour by model: addendum to the 2026-10 evidence file

Compiled 2026-10-05. Extends `research-2026-10.md` (compiled 2026-10-04). Evidence only. Every claim carries a source tag. "Not found" means I looked and it was not there. Where a number is my arithmetic it says so.

Models: Claude Opus 5.5 (`claude-opus-5-5`), Claude Sonnet 5.5 (`claude-sonnet-5-5`), Claude Fable 5.1 (`claude-fable-5-1`). Effort levels: low, medium, high, xhigh, max.

## How to read this file

Tags: **[A]** = published by Anthropic (launch pages, system cards, engineering blog, docs). **[I]** = independent third party measurement. **[P]** = practitioner write-up with its own data. A line without a tag is my arithmetic on tagged numbers and says so.

Method note, because the last file recorded that a page summariser misattributed rows: this time every AA, Cursor, Hex and Anthropic-page number was read from raw HTML or raw payload fetched with curl (not through a summariser), then parsed with a script. For AA I parsed the `initialModels` JSON array embedded in each page's Next.js payload, checked that the 15 variant index scores, costs and token counts equal the values in the 2026-10-04 file, and diffed every field against a copy of the same pages saved on 2026-10-04. For the Anthropic launch pages the chart data is embedded in the page as CSV (`series,x,y,label`) and was read from there; where a chart's title and data are ordered ambiguously in the payload I matched each chart to its benchmark by its values against numbers quoted in the text (for example TB 4.0 Sonnet 5.5 max 70.6, Opus 5.5 xhigh 66.4). The Anthropic system-card figures are raster images, so only the card text was used, except for one figure read by eye (Sonnet card figure 8.4.A, stated in 3.1) where that is said explicitly.

Source key (all fetched 2026-10-05):

| Tag | Source |
|---|---|
| I3 | Artificial Analysis (AA) release pages, raw payload, Intelligence Index v4.3.2: https://artificialanalysis.ai/models/releases/claude-opus-5-5 , .../claude-sonnet-5-5 , .../claude-fable-5-1 . Extra fields (Omniscience accuracy and hallucination rate, Harvey LAB, Terminal-Bench-Science, MMMU Pro and others) from the model page https://artificialanalysis.ai/models/claude-opus-5-5-low (its payload carries all 15 Claude variants). |
| I4 | AA Coding Agent Index v1.5 (agents run in their own harness, so this is Claude Code driving each model): https://artificialanalysis.ai/agents/coding |
| I5 | AA methodology (weights, harness, version history): https://artificialanalysis.ai/methodology/intelligence-benchmarking |
| I6 | AA launch articles: https://artificialanalysis.ai/articles/claude-opus-5-5 (2026-09-22), .../claude-sonnet-5-5 (2026-09-28), .../claude-fable-5-1 (2026-09-01) |
| I7 | Cursor, CursorBench 4.0 leaderboard (run by Cursor, in Cursor's production agent harness): https://cursor.com/cursorbench |
| I8 | Hex DataBench v1.1 leaderboard (judge-graded analytics tasks in Hex's agent harness), last updated 2026-10-05: https://hex.tech/databench/ |
| I9 | LiveBench board pull requests: https://github.com/LiveBench/new-livebench/pull/56 (Opus 5.5), .../pull/59 and .../pull/60 (Sonnet 5.5) |
| I10 | Vals AI: https://www.vals.ai/models/anthropic_claude-opus-5-5 and https://www.vals.ai/benchmarks/vals_index (Vals Index updated 2026-10-02) |
| P1 | paddo.dev, "The Default Was Right" https://paddo.dev/blog/default-was-right/ and "The Careful One Got Cheap" https://paddo.dev/blog/careful-one-got-cheap/ (both 2026-09-29) |
| P2 | Simon Willison: https://simonwillison.net/2026/Sep/22/opus-and-sol-and-luna/ and https://simonwillison.net/2026/Sep/28/claude-sonnet-5-5/ |
| A14 | Anthropic launch pages, chart data embedded in the page: https://www.anthropic.com/claude-opus-5-5 , https://www.anthropic.com/claude-sonnet-5-5 , https://www.anthropic.com/claude-fable-and-mythos-5-1 |
| A15 | "Using Claude Code: Spending your effort", inline SVG chart (Terminal-Bench 3.0): https://claude.dev/blog/spending-your-effort/ |
| A16 | System cards, text only (PDFs in the 2026-10-04 file, key A12). Sonnet 5.5 card sections 8.4, 8.5, 8.8; Opus 5.5 card sections 8.5, 8.8; Fable 5.1 card section 8.4. |
| A17 | Platform docs and release notes re-checked 2026-10-05: https://platform.claude.com/docs/en/about-claude/models/overview , https://platform.claude.com/docs/en/release-notes/overview , https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence ; Claude Code changelog https://code.claude.com/docs/en/changelog ; newsroom https://www.anthropic.com/news ; https://claude.dev/blog/ |

---

## 1. Artificial Analysis, every level of every model [I3, I4, I5, I6]

### 1.0 What AA publishes, and what it does not

- Intelligence Index is still **v4.3.2** (version history page, "Version 4.3.2 September 2026 to current"). [I5] Ten evaluations and weights, [I5] verbatim: "GDPval-AA v2 (10%), AA-Briefcase (15%), AutomationBench-AA (5%), Terminal-Bench 4.0 (10%), SciCode (10%), AA-LCR (5%), AA-Omniscience Accuracy (10%) and Non-Hallucination (5%), HLE (10%), GDP.pdf (10%), CritPt (10%)". Categories: Agents 30%, Coding 20% (Terminal-Bench 4.0 and SciCode), Scientific Reasoning 20%, General 30%.
- I found **no "Coding Index" or "Agentic Index"** in the release pages, model pages or methodology page (v4.3.2 only groups its evaluations into four categories, above). What exists: (a) six **capability indexes** on each model page (Finance and Accounting, Strategy and Ops, Legal, Healthcare and Medical, Engineering, Economics); (b) a separate **Coding Agent Index v1.5** (section 1.4), which is the only coding-specific composite. The Engineering Index is [I3] "Incorporates 6 evaluations: AA-Omniscience, Humanity's Last Exam, CritPt, GDPval-AA v2.1, AA-Briefcase v1.1, Terminal-Bench 4.0" so it is not a coding score.
- Terminal-Bench 4.0 in the Intelligence Index is [I5] "the full Terminal-Bench 4.0 dataset (66 tasks) using the mini-swe-agent harness, with pass@1 scoring averaged over 3 repeats per task", maximum 500 agent steps, "no context compaction or summarization".
- "Cost per task", "output tokens per task" and "time per task" are published for the index as a whole **and** for each of the ten evaluations (section 1.2). Arithmetic check: the weighted sum of the per-eval costs using the weights above reproduces AA's index cost per task exactly (Opus 5.5 max: 0.15x21.05 + 0.10x8.92 + 0.05x1.43 + 0.10x13.11 + 0.10x0.47 + 0.10x0.72 + 0.10x1.55 + 0.10x2.19 + 0.15x0.16 + 0.05x0.68 = 5.98). The same holds for output tokens (119,166). So "cost per index task" is a weighted mean of per-eval task costs, and it is dominated by AA-Briefcase (knowledge work) rather than coding; see 1.2.
- All 15 variants are AA's "Default Fallback" configurations (safeguard fallback enabled). [I3, I6]
- **Caveat from AA on Sonnet 5.5** [I6, Sonnet article]: "These evaluations were conducted on a pre-release deployment of Claude Sonnet 5.5, which Anthropic found to have a bug that can degrade responses to requests that use structured outputs. This is fixed for the public release and Anthropic expects minimal change or slightly understated performance, but we will be re-running relevant evaluations soon." As of the 2026-10-05 fetch no Sonnet 5.5 score, cost or token field has changed since 2026-10-04 (section 1.5), so I could not see a re-run.

### 1.1 Index score, capability sub-indexes, cost, tokens, time (per Intelligence Index task)

| Model | Level | Index | Engineering | Finance and Acct | Strategy and Ops | Legal | Economics | Cost/task | Output tok/task | of which reasoning | of which answer | Time/task |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Opus 5.5 | low | 42.3 | 44.6 | 45.9 | 48.5 | 51.6 | 52.5 | $0.55 | 10.2k | 3.4k | 6.8k | 85 s |
| Opus 5.5 | medium | 51.2 | 53.7 | 54.1 | 57.5 | 57.4 | 59.7 | $1.34 | 25.7k | 11.7k | 14.0k | 220 s |
| Opus 5.5 | high | 53.6 | 56.2 | 55.9 | 59.2 | 59.0 | 60.6 | $1.82 | 35.6k | 18.2k | 17.3k | 292 s |
| Opus 5.5 | xhigh | 56.0 | 58.7 | 58.4 | 61.6 | 60.8 | 63.0 | $3.46 | 65.7k | 40.3k | 25.4k | 514 s |
| Opus 5.5 | max | 57.6 | 60.4 | 60.7 | 63.7 | 63.3 | 65.6 | $5.98 | 119.2k | 83.9k | 35.2k | 803 s |
| Sonnet 5.5 | low | 35.9 | 37.9 | 37.5 | 40.9 | 40.6 | 44.1 | $0.42 | 14.3k | 4.6k | 9.7k | 91 s |
| Sonnet 5.5 | medium | 40.8 | 42.4 | 41.4 | 45.2 | 43.7 | 47.2 | $0.59 | 20.9k | 8.2k | 12.7k | 131 s |
| Sonnet 5.5 | high | 46.8 | 48.3 | 47.1 | 51.6 | 48.7 | 51.8 | $1.12 | 37.3k | 18.7k | 18.6k | 235 s |
| Sonnet 5.5 | xhigh | 51.9 | 53.9 | 52.3 | 56.2 | 52.2 | 55.9 | $2.75 | 74.8k | 48.0k | 26.9k | 441 s |
| Sonnet 5.5 | max | 56.0 | 58.4 | 57.2 | 59.6 | 56.4 | 60.8 | $7.67 | 197.4k | 146.6k | 50.8k | 973 s |
| Fable 5.1 | low | 46.8 | 48.7 | 48.7 | 51.2 | 53.5 | 55.1 | $2.37 | 21.6k | 8.3k | 13.3k | 258 s |
| Fable 5.1 | medium | 48.9 | 51.5 | 51.3 | 53.9 | 56.7 | 57.8 | $2.98 | 27.9k | 12.1k | 15.8k | 309 s |
| Fable 5.1 | high | 51.2 | 54.5 | 53.8 | 56.1 | 58.1 | 60.2 | $3.91 | 38.1k | 18.6k | 19.4k | 423 s |
| Fable 5.1 | xhigh | 53.2 | 56.8 | 56.2 | 58.4 | 60.8 | 62.4 | $5.98 | 60.5k | 34.1k | 26.5k | 591 s |
| Fable 5.1 | max | 53.4 | 56.5 | 56.4 | 59.7 | 60.5 | 62.7 | $7.63 | 78.1k | 47.2k | 30.9k | 775 s |

Notes. Index, cost and output tokens equal the 2026-10-04 file. Time per task is a re-measured value and differs slightly from the 2026-10-04 file (section 1.5). Healthcare and Medical Index is published only for the `max` variants: Opus 5.5 60.5, Sonnet 5.5 58.1, Fable 5.1 58.0. [I3] The capability indexes are AA composites (Finance and Accounting: 7 evals, Strategy and Ops: 6, Legal: 7, Engineering: 6, Economics: 5), values rounded to one decimal here.

### 1.2 Every index evaluation, every level [I3]

Scores: Elo for AA-Briefcase and GDPval-AA, percent for the pass-rate evals, AA-Omniscience Index as published on the page (`omniscience` field). One row per level. Costs are dollars per task of that evaluation, tokens are output tokens per task, time is seconds per task. All three tables per model come from the same fields.

#### Opus 5.5: score

| Level | AA-Briefcase (Elo) | GDPval-AA (Elo) | AutomationBench-AA (%) | Terminal-Bench 4.0 (%) | SciCode (%) | HLE (%) | GDP.pdf (%) | CritPt (%) | AA-Omniscience (index) | AA-LCR (%) |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 1280 | 1235 | 52.9 | 31.3 | 58.6 | 48.3 | 25.6 | 17.7 | 38.9 | 80.7 |
| medium | 1628 | 1586 | 61.2 | 52.5 | 59.3 | 54.7 | 25.6 | 27.7 | 40.3 | 84.3 |
| high | 1689 | 1707 | 63.2 | 56.6 | 60.4 | 55.6 | 28.8 | 30.9 | 40.6 | 82.7 |
| xhigh | 1768 | 1837 | 65.0 | 59.6 | 65.0 | 57.5 | 26.6 | 31.7 | 42.6 | 84.7 |
| max | 1807 | 1866 | 69.5 | 59.6 | 66.9 | 61.4 | 26.2 | 31.7 | 46.4 | 84.7 |

#### Opus 5.5: cost per task of each evaluation (USD)

| Level | AA-Briefcase | GDPval-AA | AutomationBench-AA | Terminal-Bench 4.0 | SciCode | HLE | GDP.pdf | CritPt | AA-Omniscience | AA-LCR |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 1.15 | 0.21 | 0.49 | 2.08 | 0.026 | 0.029 | 0.76 | 0.12 | 0.006 | 0.59 |
| medium | 4.40 | 0.86 | 0.64 | 4.04 | 0.035 | 0.062 | 0.80 | 0.35 | 0.008 | 0.59 |
| high | 6.27 | 1.54 | 0.70 | 5.12 | 0.040 | 0.10 | 0.83 | 0.53 | 0.009 | 0.59 |
| xhigh | 12.27 | 4.21 | 0.88 | 8.78 | 0.068 | 0.24 | 0.96 | 1.17 | 0.013 | 0.60 |
| max | 21.05 | 8.92 | 1.43 | 13.11 | 0.47 | 0.72 | 1.55 | 2.19 | 0.16 | 0.68 |

#### Opus 5.5: output tokens per task (thousands) and time per task (seconds)

| Level | AA-Briefcase | GDPval-AA | AutomationBench-AA | Terminal-Bench 4.0 | SciCode | HLE | GDP.pdf | CritPt | AA-Omniscience | AA-LCR |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 26.7k / 223 s | 6.8k / 56 s | 11.9k / 99 s | 37.8k / 315 s | 0.7k / 6 s | 1.3k / 11 s | 2.9k / 24 s | 5.3k / 44 s | 0.3k / 2 s | 0.6k / 5 s |
| medium | 83.4k / 711 s | 23.4k / 199 s | 15.1k / 128 s | 75.7k / 645 s | 1.1k / 9 s | 3.0k / 26 s | 4.5k / 38 s | 16.3k / 139 s | 0.3k / 3 s | 0.8k / 7 s |
| high | 113.1k / 927 s | 38.8k / 318 s | 16.5k / 136 s | 100.2k / 821 s | 1.3k / 11 s | 5.1k / 42 s | 6.0k / 49 s | 25.5k / 209 s | 0.4k / 3 s | 0.9k / 7 s |
| xhigh | 198.2k / 1550 s | 92.4k / 723 s | 21.8k / 170 s | 169.5k / 1326 s | 2.7k / 21 s | 11.9k / 93 s | 12.9k / 101 s | 57.5k / 450 s | 0.6k / 5 s | 1.2k / 10 s |
| max | 338.1k / 2279 s | 187.2k / 1262 s | 41.1k / 277 s | 252.9k / 1705 s | 22.6k / 152 s | 35.8k / 242 s | 42.3k / 285 s | 108.5k / 731 s | 8.0k / 54 s | 5.1k / 35 s |

#### Sonnet 5.5: score

| Level | AA-Briefcase (Elo) | GDPval-AA (Elo) | AutomationBench-AA (%) | Terminal-Bench 4.0 (%) | SciCode (%) | HLE (%) | GDP.pdf (%) | CritPt (%) | AA-Omniscience (index) | AA-LCR (%) |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 1272 | 1179 | 49.4 | 20.7 | 49.1 | 36.2 | 16.0 | 11.4 | 19.4 | 76.0 |
| medium | 1442 | 1324 | 54.9 | 29.8 | 52.9 | 39.8 | 20.2 | 16.9 | 20.1 | 76.3 |
| high | 1639 | 1551 | 59.4 | 43.9 | 53.7 | 45.8 | 25.2 | 24.6 | 20.9 | 78.0 |
| xhigh | 1751 | 1731 | 65.5 | 57.1 | 57.3 | 50.0 | 24.6 | 31.1 | 23.5 | 79.7 |
| max | 1823 | 1839 | 71.8 | 63.6 | 61.0 | 55.0 | 25.8 | 31.4 | 32.3 | 82.7 |

#### Sonnet 5.5: cost per task of each evaluation (USD)

| Level | AA-Briefcase | GDPval-AA | AutomationBench-AA | Terminal-Bench 4.0 | SciCode | HLE | GDP.pdf | CritPt | AA-Omniscience | AA-LCR |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 0.90 | 0.22 | 0.27 | 1.84 | 0.013 | 0.013 | 0.37 | 0.086 | 0.003 | 0.29 |
| medium | 1.63 | 0.33 | 0.29 | 2.25 | 0.014 | 0.023 | 0.38 | 0.15 | 0.003 | 0.29 |
| high | 4.19 | 0.79 | 0.35 | 3.06 | 0.016 | 0.047 | 0.41 | 0.28 | 0.005 | 0.29 |
| xhigh | 9.66 | 2.46 | 0.47 | 8.87 | 0.024 | 0.12 | 0.46 | 0.65 | 0.008 | 0.30 |
| max | 29.49 | 9.21 | 1.14 | 18.76 | 0.28 | 0.54 | 0.79 | 1.89 | 0.15 | 0.34 |

#### Sonnet 5.5: output tokens per task (thousands) and time per task (seconds)

| Level | AA-Briefcase | GDPval-AA | AutomationBench-AA | Terminal-Bench 4.0 | SciCode | HLE | GDP.pdf | CritPt | AA-Omniscience | AA-LCR |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 45.6k / 292 s | 16.2k / 103 s | 11.2k / 71 s | 40.3k / 258 s | 0.7k / 4 s | 1.2k / 8 s | 1.9k / 12 s | 7.7k / 49 s | 0.2k / 2 s | 0.4k / 3 s |
| medium | 71.6k / 449 s | 23.8k / 149 s | 12.2k / 77 s | 51.6k / 324 s | 0.7k / 5 s | 2.2k / 14 s | 2.8k / 18 s | 14.0k / 88 s | 0.3k / 2 s | 0.5k / 3 s |
| high | 140.0k / 880 s | 40.0k / 251 s | 14.7k / 92 s | 76.7k / 482 s | 0.9k / 6 s | 4.6k / 29 s | 5.6k / 35 s | 27.1k / 170 s | 0.5k / 3 s | 0.7k / 4 s |
| xhigh | 241.6k / 1426 s | 93.5k / 552 s | 20.8k / 123 s | 192.1k / 1133 s | 1.7k / 10 s | 11.7k / 69 s | 10.7k / 63 s | 64.0k / 377 s | 0.8k / 5 s | 1.0k / 6 s |
| max | 625.2k / 3082 s | 285.5k / 1407 s | 60.9k / 300 s | 382.4k / 1885 s | 27.0k / 133 s | 54.3k / 268 s | 44.2k / 218 s | 188.2k / 927 s | 14.6k / 72 s | 5.2k / 26 s |

#### Fable 5.1: score

| Level | AA-Briefcase (Elo) | GDPval-AA (Elo) | AutomationBench-AA (%) | Terminal-Bench 4.0 (%) | SciCode (%) | HLE (%) | GDP.pdf (%) | CritPt (%) | AA-Omniscience (index) | AA-LCR (%) |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 1482 | 1469 | 52.2 | 40.4 | 56.7 | 48.9 | 28.0 | 27.7 | 34.1 | 82.3 |
| medium | 1529 | 1549 | 54.7 | 44.9 | 56.4 | 53.8 | 26.8 | 29.1 | 37.6 | 84.7 |
| high | 1581 | 1635 | 55.3 | 52.0 | 58.7 | 55.9 | 26.8 | 30.3 | 40.8 | 83.7 |
| xhigh | 1657 | 1735 | 57.8 | 55.1 | 60.9 | 58.7 | 26.2 | 31.1 | 42.4 | 83.0 |
| max | 1676 | 1758 | 59.4 | 52.0 | 63.1 | 59.1 | 26.2 | 29.7 | 43.5 | 85.3 |

#### Fable 5.1: cost per task of each evaluation (USD)

| Level | AA-Briefcase | GDPval-AA | AutomationBench-AA | Terminal-Bench 4.0 | SciCode | HLE | GDP.pdf | CritPt | AA-Omniscience | AA-LCR |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 6.72 | 1.43 | 1.52 | 7.32 | 0.069 | 0.12 | 1.92 | 1.26 | 0.009 | 1.47 |
| medium | 8.58 | 2.18 | 1.64 | 9.12 | 0.076 | 0.23 | 1.96 | 1.80 | 0.015 | 1.48 |
| high | 11.40 | 3.48 | 1.77 | 11.64 | 0.089 | 0.40 | 2.02 | 2.75 | 0.021 | 1.48 |
| xhigh | 17.79 | 7.22 | 2.20 | 15.78 | 0.24 | 1.03 | 2.32 | 4.53 | 0.077 | 1.51 |
| max | 22.71 | 9.77 | 2.61 | 19.22 | 0.66 | 1.59 | 2.77 | 5.71 | 0.27 | 1.58 |

#### Fable 5.1: output tokens per task (thousands) and time per task (seconds)

| Level | AA-Briefcase | GDPval-AA | AutomationBench-AA | Terminal-Bench 4.0 | SciCode | HLE | GDP.pdf | CritPt | AA-Omniscience | AA-LCR |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 62.2k / 744 s | 16.9k / 202 s | 15.7k / 188 s | 66.2k / 792 s | 0.7k / 8 s | 2.4k / 29 s | 3.5k / 42 s | 24.1k / 288 s | 0.1k / 2 s | 0.7k / 8 s |
| medium | 77.0k / 854 s | 25.1k / 278 s | 17.4k / 193 s | 84.1k / 932 s | 0.8k / 9 s | 4.6k / 50 s | 4.3k / 47 s | 35.0k / 388 s | 0.3k / 3 s | 0.8k / 9 s |
| high | 99.9k / 1110 s | 38.7k / 430 s | 19.0k / 211 s | 113.0k / 1256 s | 1.1k / 12 s | 8.0k / 89 s | 5.5k / 61 s | 53.8k / 597 s | 0.4k / 4 s | 0.9k / 10 s |
| xhigh | 151.4k / 1477 s | 78.7k / 768 s | 25.0k / 244 s | 158.4k / 1545 s | 4.0k / 39 s | 20.7k / 202 s | 11.6k / 113 s | 89.4k / 873 s | 1.5k / 15 s | 1.4k / 14 s |
| max | 187.5k / 1860 s | 105.5k / 1047 s | 31.1k / 309 s | 191.6k / 1901 s | 12.3k / 122 s | 32.0k / 318 s | 20.4k / 202 s | 113.0k / 1121 s | 5.4k / 53 s | 3.0k / 30 s |

Arithmetic on the tables above (weights from 1.0). Share of each variant's index cost that comes from AA-Briefcase: 31% to 58%; from Terminal-Bench 4.0: 22% to 44%. So the index cost per task in 1.1 mostly prices knowledge work. For coding cost use the Terminal-Bench 4.0 column (for example Opus 5.5 $2.08 per task at `low`, $13.11 at `max`; Sonnet 5.5 $1.84 to $18.76; Fable 5.1 $7.32 to $19.22).

### 1.3 Extra AA evaluations on the model pages (not in the Intelligence Index) [I3]

| Model | Level | Omniscience accuracy % | Omniscience hallucination rate % | Harvey LAB criterion pass % | Terminal-Bench-Science 0.1 % | MMMU Pro % | GPQA % | Terminal-Bench 2.1 % | ITBench-SRE % | AnalystAgent % |
|---|---|---|---|---|---|---|---|---|---|---|
| Opus 5.5 | low | 63.5 | 67.6 | 89.1 | 24.3 | 84.7 | - | - | - | - |
| Opus 5.5 | medium | 64.5 | 68.4 | 90.3 | 43.3 | 85.7 | - | - | - | - |
| Opus 5.5 | high | 64.6 | 67.6 | 90.9 | 49.0 | 85.8 | - | - | - | - |
| Opus 5.5 | xhigh | 65.4 | 65.7 | 91.2 | 61.9 | 86.6 | - | - | - | - |
| Opus 5.5 | max | 66.2 | 58.6 | 91.2 | 59.0 | 87.7 | - | - | 38.2 | 56.2 |
| Sonnet 5.5 | low | 46.3 | 50.2 | 89.0 | 10.5 | - | - | - | - | - |
| Sonnet 5.5 | medium | 47.2 | 51.2 | 91.8 | 16.2 | - | - | - | - | - |
| Sonnet 5.5 | high | 52.0 | 64.6 | 92.1 | 34.3 | - | - | - | - | - |
| Sonnet 5.5 | xhigh | 53.0 | 62.9 | 92.4 | 52.4 | - | - | - | - | - |
| Sonnet 5.5 | max | 53.9 | 47.0 | 93.1 | 53.3 | - | - | - | - | 57.5 |
| Fable 5.1 | low | 60.2 | 65.6 | 92.3 | - | - | 88.1 | 85.0 | - | - |
| Fable 5.1 | medium | 63.1 | 69.1 | 92.6 | - | - | 88.6 | 88.0 | - | - |
| Fable 5.1 | high | 64.9 | 68.8 | 93.0 | - | - | 90.6 | 89.9 | - | - |
| Fable 5.1 | xhigh | 66.2 | 70.5 | 93.3 | - | - | 93.4 | 91.0 | - | - |
| Fable 5.1 | max | 67.2 | 72.6 | 93.0 | 43.3 | - | 93.7 | 91.4 | 49.5 | 57.5 |

`-` = AA publishes nothing for that variant. AA ran Terminal-Bench-Science 0.1 (70 tasks, mini-swe-agent, 1,000-step cap, [I5]) at all five levels for Opus 5.5 and Sonnet 5.5 but only at `max` for Fable 5.1. MMMU Pro appears for Opus 5.5 only. GPQA and Terminal-Bench 2.1 appear for Fable 5.1 only (GPQA Diamond left the index in v4.2 and Terminal-Bench 2.1 was replaced by 4.0 in v4.3, [I5]), so they are not comparable across the three models. ITBench-SRE and AnalystAgent exist only at `max`. Interesting effort effect inside AA-Omniscience: accuracy rises with effort for all three models, but the hallucination rate does not fall consistently: Opus 5.5 67.6% at `low` to 58.6% at `max`; Sonnet 5.5 non-monotonic (50.2% at `low`, 64.6% at `high`, 47.0% at `max`); Fable 5.1 rises (65.6% at `low` to 72.6% at `max`). AA's Fable launch note [I6, Fable article] says "It hallucinates more with this higher attempt rate", but that sentence compares `max` against Opus 5 and Fable 5, not levels.

### 1.4 AA Coding Agent Index v1.5: Claude Code driving each model [I4]

Verbatim description [I4]: "Composite index of 3 benchmarks: DeepSWE v1.1 Software engineering tasks, 113 tasks By Datacurve; Terminal-Bench 4.0 Agentic terminal use, 66 tasks By Laude Institute; SWE-Atlas-QnA Technical Q&A, 124 tasks By Scale AI. Each benchmark score averages pass@1 across three attempts per task. The Index gives equal weight to its 3 benchmark components." Cost is [I4] "average pay-per-token API cost per task (USD)". Time is "Average agent wall time per task".

This is the closest independent coding-agent measurement of these models at several levels. **Sonnet 5.5 has all five levels. Opus 5.5 and Fable 5.1 have `max` only.** AA does not publish `low` to `xhigh` for Opus 5.5 or Fable 5.1 on this index.

| Model | Level | Coding Agent Index | DeepSWE v1.1 % | SWE-Atlas-QnA % | Terminal-Bench v4 % | Cost/task | Wall time/task | Steps/task | Output tok/task | Total tok/task | Cache hit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sonnet 5.5 | low | 42.1 | 61.9 | 39.0 | 25.3 | $0.48 | 381 s | 19 | 16k | 1.0M | 93% |
| Sonnet 5.5 | medium | 45.9 | 65.5 | 44.9 | 27.3 | $0.62 | 511 s | 22 | 21k | 1.3M | 93% |
| Sonnet 5.5 | high | 55.0 | 66.7 | 56.5 | 41.9 | $1.24 | 735 s | 37 | 41k | 2.7M | 95% |
| Sonnet 5.5 | xhigh | 62.9 | 68.4 | 62.1 | 58.1 | $3.33 | 1619 s | 78 | 126k | 7.1M | 96% |
| Sonnet 5.5 | max | 68.4 | 72.0 | 66.9 | 66.2 | $14.19 | 5245 s | 266 | 601k | 27.7M | 95% |
| Opus 5.5 | max | 66.0 | 68.4 | 66.4 | 63.1 | $13.04 | 3867 s | 155 | 333k | 15.6M | 95% |
| Fable 5.1 | max | 62.2 | 64.3 | 64.8 | 57.6 | $12.39 | 2090 s | 37 | 134k | 5.7M | 92% |

Caveats and arithmetic.
- AA's host id for the Sonnet 5.5 rows is `private-anthropic_claude-beignet-eap-<level>`, whereas the Opus 5.5 and Fable 5.1 rows use `anthropic_claude-opus-5-5` / `anthropic_claude-fable-5-1`. Claude Code versions recorded: 2.1.280 for the Sonnet 5.5 and Opus 5.5 rows, 2.1.259 to 2.1.263 for Fable 5.1. I infer the Sonnet rows ran on a private early-access deployment (the pre-release deployment AA mentions in 1.0); AA does not say so on this page. The Fable 5.1 row is labelled "(with fallback)"; Opus 5.5 and Sonnet 5.5 rows carry no label. Refusal-to-fallback counts per eval are in the page data (attempts that fell back on Terminal-Bench v4 and SWE-Atlas-QnA: Opus 5.5 `max` 24 of 198 and 52 of 372; Sonnet 5.5 `xhigh` 3 and 31; Fable 5.1 `max` 28 and 46). [I4]
- Sonnet 5.5 across levels: index 42.1 (low) to 68.4 (max), cost per task $0.48 to $14.19 (29x), wall time 381 s to 5245 s (13.8x). Most of the jump is between `high` (55.0) and `xhigh` (62.9); DeepSWE barely moves (61.9 to 72.0) while Terminal-Bench v4 goes 25.3 to 66.2. Arithmetic.
- Sonnet 5.5 `xhigh` reaches 95% of Opus 5.5 `max`'s index (62.9 vs 66.0) at 26% of the cost ($3.33 vs $13.04) and 42% of the wall time. Arithmetic. Sonnet 5.5 `max` (68.4) is above Opus 5.5 `max` (66.0) on this index at similar cost ($14.19 vs $13.04) but at 1.36x the wall time (5,245 s vs 3,867 s) and 1.7x the steps.
- Fable 5.1 `max` uses far fewer steps (37 per task against 155 for Opus 5.5 and 266 for Sonnet 5.5) and about half the Opus wall time (2,090 s vs 3,867 s) for a lower score (62.2) at a similar cost ($12.39). [I4]
- Terminal-Bench in this index ("Terminal-Bench v4", Claude Code harness) is a different harness from the Terminal-Bench 4.0 inside the Intelligence Index (mini-swe-agent); compare the two in section 4.

### 1.5 What changed on AA since 2026-10-04 [I3]

I diffed every field of all 15 variants between the release pages saved on 2026-10-04 and fetched on 2026-10-05 (about 200 field differences). Result:

- **Unchanged**: Intelligence Index version (v4.3.2), every index score, cost per task, output tokens per task, per-eval pass rates and AA-Omniscience values, all capability indexes.
- **Elo drift under 1.5 points** on AA-Briefcase and GDPval-AA for 5 variants (re-fit noise), for example Opus 5.5 `max` GDPval-AA 1867.05 to 1866.24, Sonnet 5.5 `max` AA-Briefcase 1824.26 to 1823.49.
- **Time per task, time to first answer token and output speed were re-measured** (they are rolling latency statistics, not part of the score). Time per Intelligence Index task moved -4.2% to +5.6%:

| Model | Level | Time per index task, 2026-10-04 -> 2026-10-05 | Median time to first answer token | Output tokens/s |
|---|---|---|---|---|
| Opus 5.5 | low | 87 -> 85 s | 4.5 -> 8.3 s | 71 -> 76 |
| Opus 5.5 | medium | 221 -> 220 s | 24.3 -> 19.2 s | 73 -> 72 |
| Opus 5.5 | high | 295 -> 292 s | 34.4 -> 43.3 s | 72 -> 72 |
| Opus 5.5 | xhigh | 522 -> 514 s | 153.2 -> 128.4 s | 78 -> 77 |
| Opus 5.5 | max | 794 -> 803 s | 716.0 -> 716.0 s | 92 -> 92 |
| Sonnet 5.5 | low | 95 -> 91 s | 1.2 -> 1.1 s | 93 -> 99 |
| Sonnet 5.5 | medium | 137 -> 131 s | 1.1 -> 5.4 s | 95 -> 99 |
| Sonnet 5.5 | high | 238 -> 235 s | 12.9 -> 11.5 s | 96 -> 99 |
| Sonnet 5.5 | xhigh | 455 -> 441 s | 35.8 -> 35.9 s | 101 -> 106 |
| Sonnet 5.5 | max | 921 -> 973 s | 454.6 -> 454.6 s | 132 -> 128 |
| Fable 5.1 | low | 269 -> 258 s | 3.6 -> 3.3 s | 49 -> 54 |
| Fable 5.1 | medium | 317 -> 309 s | 10.6 -> 6.3 s | 53 -> 55 |
| Fable 5.1 | high | 432 -> 423 s | 24.2 -> 22.7 s | 53 -> 56 |
| Fable 5.1 | xhigh | 601 -> 591 s | 122.5 -> 106.9 s | 66 -> 67 |
| Fable 5.1 | max | 757 -> 775 s | 259.1 -> 259.9 s | 66 -> 64 |

The largest relative changes in time to first answer token are Opus 5.5 `low` (4.5 s to 8.3 s), Sonnet 5.5 `medium` (1.1 s to 5.4 s) and Fable 5.1 `medium` (10.6 s to 6.3 s). The `max` values of time to first answer token are identical to the decimal on both dates for all three models (716.0 s, 454.6 s, 259.9 vs 259.1 s for Fable), so they were not refreshed. [I3] The 2026-10-04 file said Sonnet 5.5 time to first answer token is "about 1 s at `low` and `medium`"; on 2026-10-05 `medium` reads 5.4 s. Treat `medium` for Sonnet 5.5 as 1 to 5 s.

- Other AA end-to-end figures now visible on the page (median end-to-end response time for AA's long prompt, seconds): Opus 5.5 low 14.9, medium 26.1, high 50.2, xhigh 134.9, max 721.5; Sonnet 5.5 6.1, 10.5, 16.5, 40.6, 458.5; Fable 5.1 12.5, 15.5, 31.6, 114.3, 267.8. [I3] Almost all of this is thinking time before the first answer token (the answer phase is 4 to 9 s for every variant).

---

## 2. Other independent per-level measurements published since late September 2026

### 2.1 CursorBench 4.0, all 15 variants [I7]

Run by Cursor on "ambiguous, multi-file tasks from real Cursor sessions" in Cursor's production agent harness; the page says "Avg cost / task is computed by applying each model's published per-million-token pricing (input, cache read, cache write, and output) to the tokens it used on each task" and "Results are subject to variance; small differences in scores may not be statistically meaningful." Version 4.0 dates from 2026-09-10 and is not comparable with 3.x. The Opus 5.5 and Sonnet 5.5 system cards quote the same numbers, so this table also fills the Anthropic gaps listed in the 2026-10-04 file (Fable 5.1 at each level; Sonnet 5.5 at `low`).

| Model | Level | Score | Cost/task | Tokens/task | Steps/task |
|---|---|---|---|---|---|
| Opus 5.5 | low | 43.7% | $1.17 | 15,811 | 28 |
| Opus 5.5 | medium | 52.5% | $2.91 | 37,954 | 54 |
| Opus 5.5 | high | 56.0% | $3.97 | 53,078 | 68 |
| Opus 5.5 | xhigh | 56.0% | $6.98 | 101,083 | 109 |
| Opus 5.5 | max | 57.8% | $13.43 | 218,363 | 185 |
| Sonnet 5.5 | low | 35.8% | $0.50 | 11,668 | 18 |
| Sonnet 5.5 | medium | 39.2% | $0.70 | 16,036 | 22 |
| Sonnet 5.5 | high | 47.8% | $1.67 | 37,391 | 41 |
| Sonnet 5.5 | xhigh | 53.1% | $3.88 | 100,158 | 78 |
| Sonnet 5.5 | max | 55.5% | $9.67 | 271,920 | 170 |
| Fable 5.1 | low | 45.1% | $5.44 | 34,795 | 51 |
| Fable 5.1 | medium | 46.8% | $7.05 | 45,411 | 63 |
| Fable 5.1 | high | 49.2% | $9.08 | 58,438 | 77 |
| Fable 5.1 | xhigh | 51.6% | $13.01 | 87,294 | 101 |
| Fable 5.1 | max | 51.8% | $17.28 | 117,236 | 128 |

Arithmetic: Opus 5.5 `high` (56.0%, $3.97) equals `xhigh` (56.0%, $6.98) on score; `max` adds 1.8 points for 1.9x the `xhigh` cost. Sonnet 5.5 `xhigh` (53.1%, $3.88) is the first Sonnet level above Opus 5.5 `medium` (52.5%, $2.91). Fable 5.1 `max` (51.8%, $17.28) is below Opus 5.5 `medium` (52.5%, $2.91). Fable 5.1 climbs steadily 45.1 to 51.8 across the five levels, unlike its FrontierCode curve (section 3.1).

### 2.2 Hex DataBench v1.1 (analytics) [I8]

Judge-graded agentic analytics tasks in Hex's harness; "Last updated: October 5, 2026"; changelog [I8]: "v1.1: Judge calibration improvements September 17, 2026. Updated judges and rubrics to fix accidental rewarding of misleading responses. This makes the benchmark significantly more difficult overall, with Anthropic models especially impacted." Opus 5.5 and Fable 5.1 are listed at all five levels. **Sonnet 5.5 is not on the board** (Sonnet 5 is). Not a coding benchmark. Secondary copy of the same numbers: https://aiagentstore.ai/ai-models/reasoning-effort/claude-opus-5-5 (reviewed 2026-10-05).

| Model | Level | Score | Cost/task | Tokens/task | Median latency/task |
|---|---|---|---|---|---|
| Opus 5.5 | low | 54.0% | $0.61 | 13K | 110.8 s |
| Opus 5.5 | medium | 62.5% | $0.97 | 22.5K | 169.6 s |
| Opus 5.5 | high | 65.0% | $1.25 | 30.5K | 220.1 s |
| Opus 5.5 | xhigh | 67.0% | $2.16 | 62.8K | 387.6 s |
| Opus 5.5 | max | 70.5% | $3.57 | 115.1K | 677.2 s |
| Fable 5.1 | low | 16.3% | $0.92 | 6.1K | 101.7 s |
| Fable 5.1 | medium | 21.0% | $1.18 | 8.1K | 126.3 s |
| Fable 5.1 | high | 20.3% | $1.57 | 11.4K | 192.6 s |
| Fable 5.1 | xhigh | 21.7% | $2.50 | 21.1K | 296.7 s |
| Fable 5.1 | max | 27.0% | $3.36 | 31.3K | 419 s |

Observations. Opus 5.5 rises monotonically, 54.0% to 70.5% (top of the board; the next non-Opus entry is GPT-6 Sol `xhigh` at 61.3%). Fable 5.1 scores 16.3% to 27.0%, 38 to 45 points below Opus 5.5 at every matched level (arithmetic) and in the range of older Opus 5 (15.7% to 19.7%); Hex does not explain it, and the page does not say whether safeguard fallbacks occurred. Fable 5.1 `high` (20.3%) is below `medium` (21.0%). The Hex page shows Opus 5.5 `max` costing 5.9x `low` ($3.57 vs $0.61, arithmetic from the table) for +16.5 points, with median latency 677 s vs 111 s (6.1x).

### 2.3 LiveBench (2026-06-25 question set) [I9]

Only the top two levels are published for Opus 5.5 and Sonnet 5.5; none for Fable 5.1 (no Fable 5.1 entry found). Board PR text, verbatim for the load-bearing parts: Opus: "model overall agentic coding math reasoning claude-opus-5-5-max-effort 83.22 71.72 89.25 97.08 92.15; claude-opus-5-5-xhigh-effort 82.06 65.35 89.25 96.80 90.65"; Sonnet `max`: "Overall 75.67, rank 34/64"; Sonnet `xhigh`: "Overall 77.75 (rank 20/64)".

| Model | Level | Overall | Agentic coding | Coding | Math | Reasoning | Data analysis | Instruction following | Language | Cost per question |
|---|---|---|---|---|---|---|---|---|---|---|
| Opus 5.5 | xhigh | 82.06 | 65.35 | 89.25 | 96.80 | 90.65 | not in PR text | not in PR text | not in PR text | not in PR text |
| Opus 5.5 | max | 83.22 | 71.72 | 89.25 | 97.08 | 92.15 | not in PR text | not in PR text | not in PR text | not in PR text |
| Sonnet 5.5 | xhigh | 77.75 | 39.3 | 88.9 | 96.7 | 86.8 | 78.6 | 70.5 | 83.4 | $0.110 |
| Sonnet 5.5 | max | 75.67 | 56.3 | 91.4 | 96.1 | 91.6 | 59.5 | 56.8 | 78.0 | $0.657 |

Sonnet 5.5 `max` is lower than `xhigh` overall on LiveBench (and 6x the cost per question), driven by data analysis (59.5 vs 78.6), instruction following (56.8 vs 70.5) and language, while agentic coding is higher at `max` (56.3 vs 39.3). The PR notes one outlier task for `max`: "consecutive_events is 40.6, against 74.7 for Sonnet 5 xHigh and 90.6 for Opus 5.5 Max. That single task drives most of the data_analysis gap." [I9] For Opus 5.5 `max` the PR gives the cost basis ($4/$20 per MTok, cache reads $0.20) but not the per-question cost.

### 2.4 Practitioner benchmark: six merged changes, 20 runs per cell, 300 runs [P1]

Setup, verbatim [P1]: "six changes that were actually merged into a large production TypeScript monorepo. Each run started from the commit before the change, with a ticket-style prompt and no git history. The tests the original fix shipped with did the grading. 20 runs per model per level, 300 in all, at API list prices. No run timed out, fell back to another model, or hit a rate limit." Caveats stated by the author: three or four runs per change; one codebase; "Claude effort is inferred. The CLI accepted each level and thinking tokens moved with it, but the requests don't record the setting"; list prices, not the author's bill; the Opus and Sonnet runs used different Claude Code versions. A "clean run" passes every test, old and new.

| Model | Level | Clean runs of 20 | Broke a passing test | Cost at list price (20 runs) |
|---|---|---|---|---|
| Opus 5.5 | low | 11 | 0 | $16.97 |
| Opus 5.5 | medium | 13 | 0 | $44.10 |
| Opus 5.5 | high | 12 | 1 | $65.16 |
| Opus 5.5 | xhigh | 12 | 1 | $139.79 |
| Opus 5.5 | max | 11 | 2 | $307.16 |
| Sonnet 5.5 | low | 10 | 0 | $8.38 |
| Sonnet 5.5 | medium | 11 | 0 | $11.76 |
| Sonnet 5.5 | high | 11 | 0 | $26.60 |
| Sonnet 5.5 | xhigh | 10 | 0 | $96.04 |
| Sonnet 5.5 | max | 13 | 0 | $415.18 |

(GPT-6 Sol rows omitted.) Author's reading, quoted: "Effort changes how much each model wrote and how far it searched. It never made a model more careful." "Opus peaks at medium. Below it, Opus missed more: at low it solved an edge-case-heavy change once in three runs, against three at medium. Above it, Opus broke more: one run at high and xhigh, two at max." "Sonnet at max got 13 clean runs against 11, all from one edge-case change it had missed at medium. It cost 35x as much, and more than Opus at max: $415 against $307." The Opus medium column matches a same-day rerun ("Opus reproduced its result exactly, change by change"). A separate medium-only run in the Sonnet post gives output tokens 247k (Sonnet 5.5) vs 495k (Opus 5.5) and costs $11.76 vs $45.81. Arithmetic: Sonnet 5.5 `max` costs 35.3x its `medium` and 1.35x Opus 5.5 `max`; Opus 5.5 `max` costs 7.0x `medium` for 2 fewer clean runs. Opus 5.5's added diff size at higher effort: "about 480 added lines at medium to about 830 at max" on one change. [P1]

### 2.5 Vals AI, Epoch, LMArena, SWE-rebench, Aider [I10]

- **Vals AI**: published at a single effort level, not per level. [I10] The Opus 5.5, Sonnet 5.5 and Fable 5.1 model pages all say "Compute Effort: max" (Opus 5.5: Terminal-Bench 2.1 ran at "high"). Vals Index (v2.1, updated 2026-10-02): Sonnet 5.5 67.04% at $21.34 per test, Opus 5.5 66.97% at $32.14, Fable 5.1 65.83% at $28.71. Vals states that scores "include some component tasks served by a fallback model after a provider refusal; counting those as failures lowers them to 65.85%, 65.05% and 64.59% respectively". Terminal-Bench 4.0 on Vals: the Opus 5.5 model page table shows 65.15%, while the page's own 2026-09-22 launch note says 61.62% (53.54% with fallback-assisted tasks counted as failures), so Vals' number moved after launch. No per-level data.
- **Epoch AI**: no per-effort results found. Aggregator snippets quote single Epoch Capabilities Index values per model (not verified on epoch.ai, not per level); I did not use them.
- **LMArena**: no per-effort entries for these three models found. An aggregator snippet in the 2026-10-04 file ("Claude Fable 5.1 Max 1498.5") is still unverified. Searches this time returned only August 2026 scores for earlier models.
- **SWE-rebench, Aider polyglot**: nothing for these models found. An aggregator snippet says the Aider polyglot board has been unmaintained since November 2025 (not verified on aider.chat).
- **Simon Willison** [P2], single-prompt anecdotes, not measurements: Opus 5.5 `max` on his pelican SVG prompt "failed to return a response! ... it hit [the 128,000 output token limit] while it was still reasoning about the SVG ... (Those two failures each cost me $2.56 and took nearly 20 minutes.)"; Sonnet 5.5 `max`: "thought for 128,000 tokens (at a cost of $1.28) before running out of tokens and failing to produce an SVG"; Sonnet 5.5 `xhigh` on the same prompt: "a cost of 5.74 cents and taking 41 seconds"; "Fable 5.1 on 'max' didn't over-think". One prompt, one run each. It lines up with AA's finding that `max` is the heavy-token level (AA Sonnet 5.5 `max` 197k output tokens per index task).

---

## 3. Anthropic numbers per level that the 2026-10-04 file was missing

### 3.1 Launch-page chart data, per level [A14]

The three launch pages embed the data of their "score against cost at every effort level" charts. The values below are exactly those data points. Anthropic's own wording for the charts [A14, Sonnet page]: "As effort goes up, models typically work for longer, leading to a higher cost per task but generally also a higher score." The cost axis is cost per attempt or per task in USD as labelled in each chart. Version notes: Terminal-Bench 4.0 here is Anthropic's internal run in Claude Code (bare mode); FrontierCode v1.1 Main is Cognition's run in Claude Code; CursorBench is Cursor's run; the Elo values are AA-run (see the note under the Elo table).

#### Terminal-Bench 4.0 [A14] (score %, cost per attempt USD)

| Level | Sonnet 5.5 | Opus 5.5 | Fable 5.1 |
|---|---|---|---|
| low | 20.0 / $0.76 | 38.5 / $1.29 | 40.2 / $5.70 |
| medium | 28.8 / $0.83 | 57.6 / $2.94 | 43.4 / $7.80 |
| high | 43.0 / $1.94 | 64.2 / $3.88 | 49.4 / $10.50 |
| xhigh | 61.5 / $5.30 | 66.4 / $7.35 | 51.3 / $15.80 |
| max | 70.6 / $12.54 | 64.8 / $11.24 | 55.8 / $19.50 |

Cross-checks against text: Sonnet 5.5 `max` 70.6 and Opus 5.5 `xhigh` 66.4 are the launch headline numbers; Opus 5.5 `max` 64.8 ("at max effort it scores 64.8%, within noise of xhigh") and Fable 5.1 `max` 55.8 appear in the system cards. [A16] Sonnet 5.5 `low` to `xhigh` (20.0, 28.8, 43.0, 61.5) and Opus 5.5 / Fable 5.1 `low` to `high` are **only in the chart data**, not in the card text. Standard error is 2.5 to 2.6 points for Sonnet 5.5 and Opus 5.5 (five trials per task, 66 tasks, [A16]). Footnote [A14, Sonnet page]: "Terminal-Bench 4.0 results are reported for Claude Opus 5.5 at Xhigh effort which represents the model's highest score." Arithmetic: Sonnet 5.5 `xhigh` to `max` is +9.1 points for 2.4x the cost per attempt ($5.30 to $12.54); Sonnet 5.5 `medium` (28.8) is below Opus 5.5 `low` (38.5).

#### FrontierCode v1.1 Main (Cognition; score %, cost per task USD) [A14]

| Level | Sonnet 5.5 | Opus 5.5 | Fable 5.1 |
|---|---|---|---|
| low | 29.3 / $0.19 | 47.3 / $0.40 | 52.8 / $2.47 |
| medium | 36.5 / $0.24 | 54.6 / $0.80 | 50.9 / $3.28 |
| high | 49.4 / $0.42 | 54.0 / $1.09 | 50.3 / $5.27 |
| xhigh | 52.1 / $1.59 | 51.4 / $2.25 | 48.7 / $9.27 |
| max | 46.2 / $20.78 | 54.4 / $6.19 | 50.3 / $12.82 |

This is the scope-penalised "mergeable diff" benchmark. Text confirms Sonnet 5.5 `xhigh` 52.1 / `max` 46.2, Opus 5.5 `medium` 54.6 and `max` 54.4, Fable 5.1 `medium` 50.9. [A16] The `low`, `high` and (for Sonnet) `medium`/`high` values are new. **One discrepancy**: the Opus launch page's chart data gives Fable 5.1 `low` as 52.8, but (a) the Fable 5.1 system card text says Fable 5.1's FrontierCode score "peaks at medium" and "At low and medium effort, Fable 5.1 scores slightly above Fable 5" [A16], and (b) the Sonnet 5.5 system card figure 8.4.A, read by eye, plots Fable 5.1 `low` at about 49.8 with the other four points matching this table. I read 52.8 as probably a data-entry error in the page but cannot confirm; treat Fable 5.1 `low` as 49.8 to 52.8. The same card figure puts average output tokens per task for Sonnet 5.5 at roughly 6k (low), 8k (medium), 13k (high), 48k (xhigh) and 600k (max), read from the log axis by eye (about +/-5%, my reading, low confidence).

#### CursorBench 4.0 (score %, cost per task USD) [A14, same as 2.1]

| Level | Sonnet 5.5 | Opus 5.5 | Fable 5.1 |
|---|---|---|---|
| low | 35.8 / $0.50 | 43.7 / $1.18 | 45.1 / $5.44 |
| medium | 39.2 / $0.70 | 52.5 / $2.90 | 46.8 / $7.05 |
| high | 47.8 / $1.67 | 56.0 / $3.97 | 49.2 / $9.08 |
| xhigh | 53.1 / $3.88 | 56.0 / $6.99 | 51.6 / $13.01 |
| max | 55.5 / $9.67 | 57.8 / $13.43 | 51.8 / $17.28 |

Scores identical to Cursor's own leaderboard (section 2.1); costs differ by at most one cent. Fills the gap "Fable 5.1 on CursorBench 4.0 at each level" and "Sonnet 5.5 at low" (35.8%).

#### Fable 5.1 on the older CursorBench 3.2.0 [A14, Fable page] (score %, cost per task USD)

| Level | Fable 5.1 |
|---|---|
| low | 66.2 / $2.90 |
| medium | 68.0 / $3.53 |
| high | 69.4 / $4.80 |
| xhigh | 72.8 / $6.96 |
| max | 73.4 / $9.64 |

Medium 68.0 and max 73.4 match the 2026-10-04 file; `low`, `high`, `xhigh` are new. The Fable page also plots Fable 5 at all five levels (62.1 to 70.5). Version 3.2.0 is not comparable with 4.0.

#### Other coding-adjacent charts on the launch pages [A14]

Terminal-Bench-Science 0.1, Fable 5.1 (score %): low 26.3, medium 35.7, high 40.0, xhigh 49.5, max 52.6 (cost per task $11.1 to $37.9). Same model with cyber safeguards relaxed (Mythos 5.1) on Terminal-Bench 4.0: low 41.7, medium 46.7, high 57.1, xhigh 59.7, max 60.9. Humanity's Last Exam, Fable 5.1 no tools: low 53.2, medium 55.9, high 58.0, xhigh 60.4, max 60.9; with tools: low 60.0, medium 63.0, high 64.8, xhigh 65.1, max 65.0.

AutomationBench (Zapier; pass rate %, cost per task USD) [A14, Opus page]: Opus 5.5 low 23.3, medium 28.6, high 32.0, xhigh 34.4, max 40.0 (cost $0.50 to $1.37). This is the Zapier AutomationBench, not AA AutomationBench-AA (1.2).


#### GDPval-AA and AA-Briefcase Elo per level, as plotted by Anthropic [A14]

AA-run (Anthropic's cards say so). They differ from AA's current page by 10 to 20 Elo at most levels: AA now shows GDPval-AA for Opus 5.5 as 1235, 1586, 1707, 1837, 1866 and for Fable 5.1 as 1469, 1549, 1635, 1735, 1758 (section 1.2), and AA-Briefcase for Sonnet 5.5 as 1272, 1442, 1639, 1751, 1823. AA's methodology says v4.3.2 re-anchored GDPval-AA and re-fitted both Elo scales with a Crowd-BT model [I5]; I cannot date that relative to the launches, so I do not claim which is later. The Fable 5.1 GDPval-AA `max` value differs most from older sources (1853 in the Fable launch post [A14], 1735 here, 1758 on AA now).

| Level | GDPval-AA Opus 5.5 | GDPval-AA Fable 5.1 | AA-Briefcase Sonnet 5.5 | AA-Briefcase Opus 5.5 |
|---|---|---|---|---|
| low | 1224 | 1450 | 1264 | 1285 |
| medium | 1576 | 1536 | 1461 | 1642 |
| high | 1692 | 1617 | 1634 | 1705 |
| xhigh | 1820 | 1721 | 1746 | 1780 |
| max | 1846 | 1735 | 1811 | 1822 |

### 3.2 Terminal-Bench 3.0 per level, Opus 5.5 and Fable 5.1 [A15]

The "Spending your effort" post has one chart, "Terminal-Bench 3.0 only: share of attempts that passed against median tokens per attempt, log scale". Its alt text gives anchors: "Opus 5.5 scores highest at every setting, from 36.6% at low to 65.7% at max, and Fable 5.1 scores higher than Opus 5 and Fable 5 at every setting. Opus 5.5 at high matches Fable 5.1 at max (58.9% against 58.0%) on half the tokens." The remaining points are not in text. I recovered them from the inline SVG: y axis 20% at pixel 411 and 70% at pixel 61 (7 px per point); x axis 50k tokens at pixel 128.9 and 100k at pixel 303.6 (log scale). The anchored values come out exactly (36.6, 58.9, 65.7, 58.0), so the recovery is accurate to about 0.2 points and about 3% on tokens. All other values here are **my arithmetic from SVG coordinates**.

| Level | Opus 5.5: pass rate / median tokens per attempt | Fable 5.1: pass rate / median tokens per attempt |
|---|---|---|
| low | 36.6% / 43k | 32.0% / 64k |
| medium | 54.6% / 78k | 40.0% / 88k |
| high | 58.9% / 103k | 46.3% / 119k |
| xhigh | 62.6% / 180k | 54.0% / 175k |
| max | 65.7% / 276k | 58.0% / 206k |

Inconsistency inside the same post: the text says Fable 5.1 passed 140 of 370 at `low` (37.8%) with "median 73k tokens each" and 214 of 370 at `max` (57.8%) with 222k; the chart gives about 32.0% and 64k at `low` and 58.0% and 206k at `max`. The `max` points agree to within 0.2 points; the `low` point does not. I cannot tell which is a different aggregation; the 2026-10-04 file cited the text figures. Arithmetic on the chart: Opus 5.5 `low` to `max` is +29.1 points for 6.4x the median tokens; Opus 5.5 `medium` (54.6%) beats Fable 5.1 `high` (46.3%) at fewer tokens (78k vs 119k).

### 3.3 The other listed gaps

- **Fable 5.1 on CursorBench 4.0 at each level**: found, sections 2.1 and 3.1 (45.1, 46.8, 49.2, 51.6, 51.8). [I7, A14]
- **Sonnet 5.5 at `low`**: found for CursorBench 4.0 (35.8%, $0.50), FrontierCode Main (29.3%), Terminal-Bench 4.0 (20.0% Anthropic internal; 20.7% AA mini-swe-agent; 25.3% in Claude Code on AA's Coding Agent Index), AA-Briefcase (1264 Anthropic chart; 1272 AA current), plus every AA index eval (section 1.2). Not in Anthropic's card text, only in chart data. [A14, I3, I4, I7]
- **Opus 5.5 `high` and `xhigh` absolute SWE-bench Pro**: still not stated as numbers by Anthropic. The docs page (re-read 2026-10-05) says [A17, optimizing-for-cost-and-intelligence] "measured against high, Claude Opus 5.5 scored about 2.5 points lower at its default, medium, for about 70% of the cost, and about 8 points lower at low for about a third of the cost; xhigh scored about 1.4 points higher for 2.5 times the cost of high", and the footnote: "everything at high, 94.8% to 95.8% for $0.29". Arithmetic: `xhigh` is therefore about 96.2% to 97.2% at about $0.73 per solved task (one run, 2 attempts cut off by the 16,384-token cap per turn). Not an Anthropic-published figure. No change to the docs page since 2026-10-04 that I could see.
- **Per-level wall-clock times**: still no Anthropic text beyond the examples already in the 2026-10-04 file (Thariq's fitness-app and design tasks; Sonnet 5.5 PhysicianBench; Fable 5.1 corpus benchmark). Independent per-level wall times now exist: AA time per index task and per eval (1.1, 1.2), AA Coding Agent Index wall time for Sonnet 5.5 (1.4), Hex median latency for Opus 5.5 and Fable 5.1 (2.2). Cursor publishes steps but not time (2.1).
- **New Anthropic effort posts since 2026-10-04**: none found. Newsroom last entries are 2026-10-02 (a $100 million engineer training investment) and 2026-10-01 (a Barclays customer story); claude.dev blog newest is 2026-09-28; Platform release notes newest is 2026-10-01 (a Models API `line` field); Claude Code changelog newest is 2.1.290 (2026-10-05). [A17] Effort-relevant lines in Claude Code 2.1.287 to 2.1.290: "Changed automatic model switches after a flagged message to keep your current effort level instead of the new model's default" (2.1.287, 2026-10-01); "Fixed the effort level changing when a flagged message is retried on a fallback model that has a different level saved in settings" (2.1.290, 2026-10-05). Earlier, in 2.1.284: "Changed Ultracode into its own toggle in /effort ... it no longer forces xhigh effort and stays on at any effort level". No default-effort change for Opus 5.5, Sonnet 5.5 or Fable 5.1. [A17] Anthropic's models overview still lists default effort Fable 5.1 high, Opus 5.5 medium, Sonnet 5.5 high. [A17]
- **Claude Opus 5.5 quality report still open**: anthropics/claude-code #98679 (Opus 5.5 behaviour changed overnight on 2026-10-01) is open with labels bug, area:cost, area:model, six comments, last on 2026-10-04, no Anthropic reply. One commenter reports "Effort medium and high are both affected". Single-user reports; unconfirmed. Relevant because AA's re-measured Opus 5.5 latency (1.5) and any future re-run could move after a server-side change. Other effort-related issues opened 2026-10-04 to 2026-10-05 (single-user reports, no measurements): #99759 "Excessive token consumption and agent proliferation on simple tasks with Opus model" ("Claude is over-verifying too much. Simple tasks are consuming millions of tokens and dozens of agents. It's a new behavior in Ultracode ... I've only noticed it with Opus >5", version 2.1.282); #99488 asks for transparency on capability, effort and limit changes (no data); #99387 and #99498 are feature requests (auto-adjust effort by mode; let ultrathink raise effort). None contains evidence that changes the numbers above. Ultracode (a Claude Code toggle that sits outside the five levels as of 2.1.284) is not covered by any measurement in this file.

---

## 4. Same benchmark, different sources: juxtaposition by level

Nothing new is measured here; it puts section 1 to 3 numbers side by side so disagreement is visible. Percent unless stated.

#### Terminal-Bench 4.0, three measurements

AA index = mini-swe-agent harness, 3 repeats [I3]. AA agent = Claude Code harness on AA's Coding Agent Index [I4]. Anthropic = internal run, Claude Code bare mode, five trials [A14].

| Model | Level | AA index (mini-swe-agent) | AA Coding Agent Index (Claude Code) | Anthropic internal (Claude Code) |
|---|---|---|---|---|
| Opus 5.5 | low | 31.3 | - | 38.5 |
| Opus 5.5 | medium | 52.5 | - | 57.6 |
| Opus 5.5 | high | 56.6 | - | 64.2 |
| Opus 5.5 | xhigh | 59.6 | - | 66.4 |
| Opus 5.5 | max | 59.6 | 63.1 | 64.8 |
| Sonnet 5.5 | low | 20.7 | 25.3 | 20.0 |
| Sonnet 5.5 | medium | 29.8 | 27.3 | 28.8 |
| Sonnet 5.5 | high | 43.9 | 41.9 | 43.0 |
| Sonnet 5.5 | xhigh | 57.1 | 58.1 | 61.5 |
| Sonnet 5.5 | max | 63.6 | 66.2 | 70.6 |
| Fable 5.1 | low | 40.4 | - | 40.2 |
| Fable 5.1 | medium | 44.9 | - | 43.4 |
| Fable 5.1 | high | 52.0 | - | 49.4 |
| Fable 5.1 | xhigh | 55.1 | - | 51.3 |
| Fable 5.1 | max | 52.0 | 57.6 | 55.8 |

Reading: the three agree on shape for Sonnet 5.5 (steep: about 20 at `low` to 64 to 71 at `max`) and for Opus 5.5 (a large `low` to `medium` step then a plateau near 60 to 66 from `high` or `xhigh`; AA has `xhigh` = `max` = 59.6, Anthropic 66.4 vs 64.8). They disagree on Fable 5.1 at `max`: AA index 52.0 is below its own `xhigh` 55.1, while Anthropic's internal run is monotonic and ends at 55.8 and the AA agent run at `max` is 57.6. Level of the score differs by up to about 8 points between harnesses (Sonnet 5.5 `max`: 63.6, 66.2, 70.6), so absolute numbers are harness-specific; the ordering of levels is not.

#### Coding benchmarks together, by level (Anthropic and Cursor sources)

| Model | Level | Terminal-Bench 4.0 (Anthropic) | FrontierCode Main | CursorBench 4.0 |
|---|---|---|---|---|
| Opus 5.5 | low | 38.5 | 47.3 | 43.7 |
| Opus 5.5 | medium | 57.6 | 54.6 | 52.5 |
| Opus 5.5 | high | 64.2 | 54.0 | 56.0 |
| Opus 5.5 | xhigh | 66.4 | 51.4 | 56.0 |
| Opus 5.5 | max | 64.8 | 54.4 | 57.8 |
| Sonnet 5.5 | low | 20.0 | 29.3 | 35.8 |
| Sonnet 5.5 | medium | 28.8 | 36.5 | 39.2 |
| Sonnet 5.5 | high | 43.0 | 49.4 | 47.8 |
| Sonnet 5.5 | xhigh | 61.5 | 52.1 | 53.1 |
| Sonnet 5.5 | max | 70.6 | 46.2 | 55.5 |
| Fable 5.1 | low | 40.2 | 52.8 | 45.1 |
| Fable 5.1 | medium | 43.4 | 50.9 | 46.8 |
| Fable 5.1 | high | 49.4 | 50.3 | 49.2 |
| Fable 5.1 | xhigh | 51.3 | 48.7 | 51.6 |
| Fable 5.1 | max | 55.8 | 50.3 | 51.8 |

Shape by benchmark. Terminal-Bench 4.0 and CursorBench 4.0 keep rising or plateau with effort for Opus 5.5 and Sonnet 5.5; FrontierCode Main (scope-penalised) peaks at `medium` for Opus 5.5 (54.6) and Fable 5.1 (50.9), and at `xhigh` for Sonnet 5.5 (52.1). Hex DataBench is monotonic for Opus 5.5; the practitioner bench [P1] peaks at `medium` for Opus 5.5 and at `max` (one change) for Sonnet 5.5. Different benchmarks reward different things; the shared pattern is that `max` is not reliably above `xhigh` on scope-graded or real-repo work, and is reliably the most expensive level.


---

## 5. Claude Haiku 5.5

**Not released as of 2026-10-05.** Evidence:

- Anthropic's Sonnet 5.5 launch post (2026-09-28) [A14]: "Claude Haiku 5.5, built for high-volume and cost-sensitive applications, will join the Claude 5.5 family in the coming weeks." Simon Willison's 2026-09-22 post says of the Opus 5.5 launch: "Anthropic say that Sonnet 5.5 and Haiku 5.5 are coming soon." [P2] No date, price or specs were given.
- Platform docs models overview, fetched 2026-10-05 [A17]: lists exactly four current models: Claude Fable 5.1, Claude Opus 5.5, Claude Sonnet 5.5, Claude Haiku 4.5 (`claude-haiku-4-5`, default effort "Not supported", $1 / $5 per MTok, retirement "Not sooner than October 15, 2026"). A guessed docs URL for a Haiku 5.5 model page (`.../docs/en/models/haiku-5-5/overview`) returns the docs site's "Not Found" page.
- Platform release notes (newest entry 2026-10-01) and Anthropic newsroom (newest entry 2026-10-02): no Haiku 5.5 entry. Anthropic's Haiku product page still shows Haiku 4.5 (2025-10-15). Claude Code changelog through 2.1.290 (2026-10-05) contains no Haiku 5.5. [A17]
- Aggregators (for example emergent.sh, cellcog.ai, docsbot.ai) say the same: announced, undated, no id, no pricing, no benchmarks. They are secondary and add nothing checkable.

So for the questions asked: model id **not found** (no `claude-haiku-5-5` published anywhere I could read), effort support **not found**, default effort **not found**, price **not found**, per-level numbers **not found**. What exists today is Haiku 4.5: no effort parameter, manual extended thinking only. (2026-10-04 file, Haiku section; unchanged.) Plan for the plugin: treat Haiku 5.5 as unknown until Anthropic publishes a model page; re-check the platform models overview and release notes.

---

## What changed against the 2026-10-04 file

1. **New data, not in the old file**: AA per-eval cost, tokens and time for all ten evals at all 15 variants (1.2); AA capability sub-indexes at every level (1.1); AA Coding Agent Index with Sonnet 5.5 at all five levels in Claude Code, Opus 5.5 and Fable 5.1 at `max` (1.4); extra AA evals (1.3); Cursor's full CursorBench 4.0 table with cost, tokens and steps (2.1); Hex DataBench per level for Opus 5.5 and Fable 5.1 (2.2); LiveBench `xhigh` and `max` for Opus 5.5 and Sonnet 5.5 (2.3); a 300-run real-repo practitioner bench at every level for Opus 5.5 and Sonnet 5.5 (2.4); Anthropic launch-chart data for Terminal-Bench 4.0, FrontierCode Main and CursorBench 4.0 at every level for all three models, and Terminal-Bench 3.0 per level (3.1, 3.2).
2. **Gaps closed**: Fable 5.1 CursorBench at each level (4.0: 45.1, 46.8, 49.2, 51.6, 51.8; 3.2.0: 66.2, 68.0, 69.4, 72.8, 73.4); Sonnet 5.5 at `low` on CursorBench 4.0 (35.8), FrontierCode (29.3) and Terminal-Bench 4.0 (20.0); Fable 5.1 FrontierCode Main per level; independent per-level wall-clock times. **Gaps still open**: Opus 5.5 `high`/`xhigh` SWE-bench Pro absolute (only arithmetic), Anthropic-stated per-level times for the models beyond the old examples, Opus 5.5 and Fable 5.1 Coding Agent Index below `max`, any Haiku 5.5 data, LMArena/Epoch/SWE-rebench/Aider per level.
3. **Numbers that differ from the 2026-10-04 file**:
   - AA time per index task re-measured (-4.2% to +5.6%), time to first answer token and output speed re-measured (table in 1.5). Opus 5.5 `low` 87 s is now 84.5 s; Sonnet 5.5 `max` 921 s is now 973 s; Fable 5.1 `max` 757 s is now 775 s. Sonnet 5.5 `medium` time to first answer token "about 1 s" is now 5.4 s.
   - Elo values for AA-Briefcase and GDPval-AA drifted by under 1.5 points on 5 variants. All other AA scores, costs and tokens are identical, and the index is still v4.3.2.
   - The old file's Terminal-Bench 3.0 text figures for Fable 5.1 at `low` (140 of 370 = 37.8%, median 73k tokens) disagree with the chart in the same Anthropic post (about 32.0%, 64k) (3.2). `max` agrees.
   - New contradiction inside Anthropic data: Fable 5.1 FrontierCode Main at `low` is 52.8 in the Opus launch page chart data but about 49.8 in the Sonnet card figure, and the Fable card says its score peaks at medium (3.1).
4. **Confirmations**: the old file's "Opus 5.5 Terminal-Bench 4.0 `xhigh` = `max`" holds on AA (0.596 both) and Anthropic has xhigh 66.4 vs max 64.8; Sonnet 5.5's `max` below `xhigh` on FrontierCode and LiveBench holds in two more sources; Fable 5.1 not monotonic on AA Terminal-Bench 4.0 (0.520 at `max` vs 0.551 at `xhigh`) holds.
5. **Caveats that grew**: AA's Sonnet 5.5 results come from a pre-release deployment and AA says it will re-run (1.0); no re-run was visible. Anthropic issue #98679 (Opus 5.5 behaviour change from 2026-10-01) is still open (3.3). Hex DataBench puts Fable 5.1 far below Opus 5.5 (16 to 27 vs 54 to 71) for reasons not given.
6. **Haiku 5.5**: still unreleased as of 2026-10-05 (section 5). No change to the Haiku 4.5 facts.
