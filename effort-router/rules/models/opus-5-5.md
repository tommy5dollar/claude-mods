<!--
What each effort level can do on Claude Opus 5.5. The router sends these notes with every check while the session (or
a subagent) runs on this model; they are the main guide to the level. Evidence for each line, with sources and
quotes, is in research-2026-10.md (Opus 5.5 sections). Add only what evidence supports.
-->
Claude Code's default here is medium. Most of what this model gains from effort comes between low and medium. Above medium the gains are small and the cost climbs.

- low: quick exchanges and mechanical work, such as renames or applying a known pattern across files. It keeps its thinking short and makes fewer, shorter tool calls. On several coding evaluations it comes close to Claude Opus 5 at high at much lower cost. It fails on edge-case-heavy work: it edits before reproducing the problem and stops early (0 of 5 on a storage-engine task where xhigh passed 4).
- medium: day-to-day engineering with a clear scope, such as a new feature. It matches or beats Claude Opus 5 at high on coding and knowledge work. It scores best of all levels on coding graded for a clean, mergeable diff, because above medium it makes more changes nobody asked for.
- high: work where verification matters or edge cases are likely, such as fixing a bug in existing code, debugging, tests and review. It tests more edge cases and checks more of its own work. On SWE-bench Pro it scored about 2.5 points above medium for about 40% more cost. On CursorBench it scored the same as xhigh.
- xhigh: hard, edge-case-heavy problems (storage engines, concurrency, security) and long work done alone. On SWE-bench Pro it scored about 1.4 points above high for 2.5 times the cost. It thinks noticeably more per turn than Claude Opus 5 did at the same level.
- max: matched by xhigh on knowledge work with about half the output tokens. Prone to overthinking.
