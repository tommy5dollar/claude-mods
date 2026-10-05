<!--
effort-router's default rules: the principles the router gives the model when it picks a level. They say what effort
is for and what to weigh, never which kind of task gets which level: what a level can do differs by model, and the
notes in models/ say it. An eval on 2026-10-04 showed rules that tied tasks to levels overrode those notes.
Each line is here because a frontier model wouldn't know it or would weigh it wrongly: what effort does and doesn't fix
is from Anthropic's Terminal-Bench 3.0 failure analysis, and the spec point from its timings of the same build with a
loose and a tight spec. Sources: Anthropic, "Using Claude Code: Spending your effort" (Thariq Shihipar, 2026-09-25),
and Anthropic's effort docs (see models/research-2026-10.md).
-->
What effort buys: more verification, more edge-case testing and more independent judgement. It does not buy a better approach: higher effort cuts failures from missed edge cases, not from a wrong approach. It costs time and tokens on every turn, and on routine work it can make the model do more than it was asked.

What to weigh:
- How much is hidden: edge cases, existing code the change can break, concurrency, security. The more there is, the more effort pays. Hidden means the request doesn't name it, no spec covers it and the usual way of doing this kind of work doesn't handle it. Work that touches money or other systems is often still routine.
- Whether the user is in the loop. Quick back-and-forth while the user steers wants fast replies. A user who is away and wants the work finished needs the model to check its own work.
- How well specified the task is. A tight spec makes the levels behave more alike, so effort matters less.
- How big and long the work is, and whether it is mechanical (a known pattern, a rename, chores) or needs judgement.
