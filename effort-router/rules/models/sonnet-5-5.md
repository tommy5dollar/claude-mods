<!--
What each effort level can do on Claude Sonnet 5.5. The router sends these notes with every check while the session (or
a subagent) runs on this model; they are the main guide to the level. Evidence for each line, with sources and
quotes, is in research-2026-10.md (Sonnet 5.5 sections). Add only what evidence supports.
-->
Claude Code's default here is medium (the API's is high). The levels are recalibrated, so a level doesn't mean what it did on earlier Sonnet models. Each step up buys much more on this model than on Opus 5.5: on CursorBench it scored 39% at medium, 48% at high, 53% at xhigh and 56% at max, and it needs xhigh to match Opus 5.5 at medium.

- low: chat, lookups, classification and extraction. It skips thinking on most simple requests. On coding it can skip verifying a change and report it done without running a check that exercises it.
- medium: well-specified agentic coding, Anthropic's starting point for it. It beats Claude Sonnet 5 at high on most agentic coding evaluations at under a fifth of the cost. It thinks briefly before almost every reply. On long tasks it sometimes checks in before the work is done: it pauses to confirm a plan, asks a question it could answer itself, or stops after one part to ask whether to continue.
- high: harder or longer coding tasks, Anthropic's advice for them, and the most that routine work needs. At high and below it rarely starts its own review rounds.
- xhigh: hard work where the extra quality pays. It is especially thorough: after finishing it starts its own rounds of review and verification, sometimes with subagents, and makes related fixes it noticed, which costs time and tokens. It scored higher than max on coding graded for a clean, mergeable diff.
- max: scored lower than xhigh on that coding, more often launching a many-subagent review that timed out or edited beyond the task.
