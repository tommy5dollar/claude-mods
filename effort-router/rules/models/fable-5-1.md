<!--
What each effort level does on Claude Fable 5.1. The router sends these notes with every check while the session (or a
subagent) runs on this model. Every model's notes have the same shape: one table of coding benchmarks with the same
columns at every level, then the behaviours Anthropic reports that change which level to pick. A line that starts with
a level the check can't pick (max, unless offered) is left out of the prompt. Evidence for each number and line, with
sources and quotes, is in research-2026-10.md and research-2026-10-addendum.md. Add only what published evidence
supports: the plugin's own eval runs are too small and too artificial to go in here.
-->
Three coding benchmarks, measured at every level. CursorBench 4.0 (run by Cursor): ambiguous multi-file tasks taken from real Cursor sessions. Terminal-Bench 4.0 (run by Artificial Analysis): agentic tasks in a terminal, with time per task. FrontierCode (run by Cognition): graded for a clean, mergeable diff, so changes nobody asked for count against it. These are hard tasks, chosen because the levels score differently on them. On everyday work the gaps are smaller: Anthropic reports nearly flat curves on research and knowledge work, and the levels behave more alike when a task is tightly specified.

| level | CursorBench | cost per task | Terminal-Bench | cost per task | time per task | FrontierCode |
|---|---|---|---|---|---|---|
| low | 45% | $5.44 | 40% | $7.32 | 13.2 min | 50-53% |
| medium | 47% | $7.05 | 45% | $9.12 | 15.5 min | 51% |
| high | 49% | $9.08 | 52% | $11.64 | 20.9 min | 50% |
| xhigh | 52% | $13.01 | 55% | $15.78 | 25.8 min | 49% |
| max | 52% | $17.28 | 52% | $19.22 | 31.7 min | 50% |

Other findings:
- Anthropic's advice: start at high, drop to medium or low for routine work, and keep xhigh for the most capability-sensitive work.
- Effort pays most on edge-case-heavy work such as security and hardware tasks, and least on rulebook-style work (Terminal-Bench 3.0, comparing the lowest and highest levels).
- low: looks things up less and answers from memory more, most visibly about current products, models and tools.
- medium: its best FrontierCode level along with low. Above medium it adds small unrequested changes in files outside the task, and on routine work it gathers context and deliberates beyond what the task needs.
- xhigh: asked for one long deliverable, it can draft it in its thinking and write it out again, roughly doubling output.
- max: no better than xhigh on CursorBench, and below it on Terminal-Bench.
