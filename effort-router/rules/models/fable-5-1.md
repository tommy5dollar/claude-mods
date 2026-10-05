<!--
How effort pays on Claude Fable 5.1. The router sends these notes with every check while the session (or a subagent) runs
on this model. They are heuristics, not results: benchmark scores are left out because a few points more on a hard
benchmark means a few more of the hardest tasks solved, not every task done better, and a model reads them as the
latter (Tommy, 2026-10-05). Cost and time against medium do scale with the level, so they stay, rounded from the
CursorBench 4.0 and Terminal-Bench 4.0 cost and time per task. Every model's notes have the same shape: how effort pays,
Anthropic's advice, then each level with its cost, time and behaviours. A line that starts with a level the check
can't pick (max, unless offered) is left out of the prompt. Evidence: research-2026-10.md and
research-2026-10-addendum.md. Never add eval results, ours or anyone's: these have to stay heuristics.
-->
How effort pays on this model: little, on most work. Even low is very strong, and each step up changes the result less than on Opus 5.5 or Sonnet 5.5. Effort pays most on edge-case-heavy work such as security and hardware, and least on routine and rulebook-style work. Even there, high covers most of it.

Anthropic's advice for this model: start at high, drop to medium or low for routine work, and keep xhigh for the most capability-sensitive work.

Each level, with its cost and time against medium:
- low: about 0.8 times the cost and time. Looks things up less and answers from memory more, most visibly about current products, models and tools.
- high: about 1.3 times the cost and time. From here up it adds small unrequested changes in files outside the task, and on routine work it deliberates beyond what the task needs.
- xhigh: about 1.8 times the cost and 1.7 times the time. Asked for one long deliverable, it can draft it in its thinking and write it out again, roughly doubling output.
- max: 2 to 2.5 times the cost and twice the time, and no better than xhigh.
