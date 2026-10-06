<!--
How effort pays on Claude Sonnet 5.5. The router sends these notes with every check while the session (or a subagent) runs
on this model. They are heuristics, not results: benchmark scores are left out because a few points more on a hard
benchmark means a few more of the hardest tasks solved, not every task done better, and a model reads them as the
latter. Cost and time against medium do scale with the level, so they stay, rounded from the
CursorBench 4.0 and Terminal-Bench 4.0 cost and time per task. Every model's notes have the same shape: how effort pays,
Anthropic's advice, then each level with its cost, time and behaviours. A line that starts with a level the check
can't pick (max, unless offered) is left out of the prompt. Evidence: research-2026-10.md and
research-2026-10-addendum.md. Never add eval results, ours or anyone's: these have to stay heuristics.
-->
How effort pays on this model: each step up buys much more than on Opus 5.5, and it takes xhigh to match Opus 5.5 at medium on hard coding tasks. On routine, well-specified work medium still does the job.

Anthropic's advice for this model: medium for well-specified agentic coding, high for harder or longer tasks, and xhigh only where a gain has been measured.

Each level, with its cost and time against medium:
- low: about 0.8 times the cost and time. Can skip verifying a change and report it done without running a check.
- low and medium: on long agentic tasks it sometimes checks in before the work is done. It pauses to confirm a plan, asks a question it could answer itself, or stops after one part to ask whether to continue.
- high: 1.5 to 2.5 times the cost and 1.5 times the time.
- xhigh: 4 to 5 times the cost and 3.5 times the time. After finishing it starts its own rounds of review and verification, sometimes with subagents.
- max: 8 to 14 times the cost and 6 times the time. More often launches a many-subagent review that times out or edits beyond the task.
