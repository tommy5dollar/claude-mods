<!--
How effort pays on Claude Opus 5.5. The router sends these notes with every check while the session (or a subagent) runs
on this model. They are heuristics, not results: benchmark scores are left out because a few points more on a hard
benchmark means a few more of the hardest tasks solved, not every task done better, and a model reads them as the
latter. Cost and time against medium do scale with the level, so they stay, rounded from the
CursorBench 4.0 and Terminal-Bench 4.0 cost and time per task. Every model's notes have the same shape: how effort pays,
Anthropic's advice, then each level with its cost, time and behaviours. A line that starts with a level the check
can't pick (max, unless offered) is left out of the prompt. Evidence: research-2026-10.md and
research-2026-10-addendum.md. Never add eval results, ours or anyone's: these have to stay heuristics.
-->
How effort pays on this model: most of what it buys comes between low and medium. Above medium it only solves more of the hardest tasks, the ones with edge cases medium misses. Well-scoped work comes out the same at medium, and above medium it makes more changes nobody asked for. Medium already reproduces bugs, tests the usual edge cases and checks its own work, so it is enough for most day-to-day work, whether or not the user is watching. High pays only where hidden problems are the hard part of the task.

Anthropic's advice for this model: medium for well-scoped, day-to-day work, high when medium stalls, low for mechanical work such as renames, and xhigh only where a gain has been measured.

Each level, with its cost and time against medium:
- low: about half the cost and time. Right for mechanical work and quick exchanges. On edge-case-heavy work it edits before reproducing the problem and stops early.
- high: about 1.3 times the cost and time. Tests more edge cases and checks more of its own work.
- xhigh: about 2.2 times the cost and twice the time, and no better than high on Cursor's benchmark of real multi-file tasks.
- max: 3 to 5 times the cost and 2.6 times the time. Prone to overthinking.
