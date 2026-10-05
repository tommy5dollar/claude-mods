<!--
What each effort level does on Claude Opus 5.5. The router sends these notes with every check while the session (or a
subagent) runs on this model. Every model's notes have the same shape: one table of coding benchmarks with the same
columns at every level, then the behaviours Anthropic reports that change which level to pick. A line that starts with
a level the check can't pick (max, unless offered) is left out of the prompt. Evidence for each number and line, with
sources and quotes, is in research-2026-10.md and research-2026-10-addendum.md. Add only what published evidence
supports: the plugin's own eval runs are too small and too artificial to go in here.
-->
Three coding benchmarks, measured at every level. CursorBench 4.0 (run by Cursor): ambiguous multi-file tasks taken from real Cursor sessions. Terminal-Bench 4.0 (run by Artificial Analysis): agentic tasks in a terminal, with time per task. FrontierCode (run by Cognition): graded for a clean, mergeable diff, so changes nobody asked for count against it. These are hard tasks, chosen because the levels score differently on them. On everyday work the gaps are smaller: Anthropic reports nearly flat curves on research and knowledge work, and the levels behave more alike when a task is tightly specified.

| level | CursorBench | cost per task | Terminal-Bench | cost per task | time per task | FrontierCode |
|---|---|---|---|---|---|---|
| low | 44% | $1.17 | 31% | $2.08 | 5.3 min | 47% |
| medium | 53% | $2.91 | 53% | $4.04 | 10.8 min | 55% |
| high | 56% | $3.97 | 57% | $5.12 | 13.7 min | 54% |
| xhigh | 56% | $6.98 | 60% | $8.78 | 22.1 min | 51% |
| max | 58% | $13.43 | 60% | $13.11 | 28.4 min | 54% |

Other findings:
- Anthropic's advice: start at medium, and keep xhigh for work where a gain has been measured.
- On SWE-bench Pro (fixes in real repositories) it solved 87.4% at low for $0.12 per solved task, 92.8% at medium for $0.22 and about 95% at high for $0.29. xhigh added about 1.4 points over high for 2.5 times the cost.
- low: on edge-case-heavy work it edits before reproducing the problem and stops early (0 of 5 on a storage-engine task where xhigh passed 4).
- medium: its best FrontierCode score. Above medium it makes more changes nobody asked for.
- xhigh: no better than high on CursorBench and below it on FrontierCode, for about 1.7 times the cost.
- max: prone to overthinking.
