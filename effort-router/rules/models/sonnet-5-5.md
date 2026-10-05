<!--
What each effort level does on Claude Sonnet 5.5. The router sends these notes with every check while the session (or a
subagent) runs on this model. Every model's notes have the same shape: one table of coding benchmarks with the same
columns at every level, then the behaviours Anthropic reports that change which level to pick. A line that starts with
a level the check can't pick (max, unless offered) is left out of the prompt. Evidence for each number and line, with
sources and quotes, is in research-2026-10.md and research-2026-10-addendum.md. Add only what published evidence
supports: the plugin's own eval runs are too small and too artificial to go in here.
-->
Three coding benchmarks, measured at every level. CursorBench 4.0 (run by Cursor): ambiguous multi-file tasks taken from real Cursor sessions. Terminal-Bench 4.0 (run by Artificial Analysis): agentic tasks in a terminal, with time per task. FrontierCode (run by Cognition): graded for a clean, mergeable diff, so changes nobody asked for count against it. These are hard tasks, chosen because the levels score differently on them. On everyday work the gaps are smaller: Anthropic reports nearly flat curves on research and knowledge work, and the levels behave more alike when a task is tightly specified.

| level | CursorBench | cost per task | Terminal-Bench | cost per task | time per task | FrontierCode |
|---|---|---|---|---|---|---|
| low | 36% | $0.50 | 21% | $1.84 | 4.3 min | 29% |
| medium | 39% | $0.70 | 30% | $2.25 | 5.4 min | 37% |
| high | 48% | $1.67 | 44% | $3.06 | 8.0 min | 49% |
| xhigh | 53% | $3.88 | 57% | $8.87 | 18.9 min | 52% |
| max | 56% | $9.67 | 64% | $18.76 | 31.4 min | 46% |

Other findings:
- Anthropic's advice: medium for well-specified agentic coding, high for harder or longer tasks, and xhigh only where a gain has been measured.
- low: can skip verifying a change and report it done without running a check that exercises it.
- low and medium: on long agentic tasks it sometimes checks in before the work is done. It pauses to confirm a plan, asks a question it could answer itself, or stops after one part to ask whether to continue.
- xhigh: after finishing it starts its own rounds of review and verification, sometimes with subagents, which costs time and tokens.
- max: more often launches a many-subagent review that times out or edits beyond the task, which is why it scores below xhigh on FrontierCode.
