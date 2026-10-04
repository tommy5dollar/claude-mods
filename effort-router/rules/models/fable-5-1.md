<!--
What each effort level can do on Claude Fable 5.1. The router sends these notes with every check while the session (or
a subagent) runs on this model; they are the main guide to the level. Evidence for each line, with sources and
quotes, is in research-2026-10.md (Fable 5.1 sections). Add only what evidence supports.
-->
Claude Code's default here is high. On broad evaluations each step up adds little. Edge-case-heavy work is the exception: on Terminal-Bench 3.0, from low to the top level, security tasks went from 64% to 87% and hardware tasks from 34% to 75%.

- low: still very strong (88.6% of a SWE-bench Pro subset). Anthropic says it often scores higher than Opus and Sonnet models at a similar cost per task. It calls search and retrieval tools less and answers from memory more, most visibly about current products, models and tools, so it suits work that doesn't depend on looking things up.
- medium: roughly Claude Fable 5's quality. It scores best of all levels on coding graded for a clean, mergeable diff: above medium it adds small unrequested changes in files outside the task.
- high: Anthropic's starting point, with more rigorous verification. On routine work it gathers context and deliberates beyond what the task needs.
- xhigh: the most capability-sensitive work, Anthropic's advice for it. Asked for a long deliverable, it can draft it in its thinking and write it out again, roughly doubling output.
- max: matched by xhigh on knowledge work with about 25% fewer tokens, and below xhigh on one terminal benchmark.
