<!--
What effort means on Claude Sonnet 5.5. The router sends these notes with every check while the session runs on this
model, after the routing rules. Source: Anthropic's model migration guide (Migrating to Claude Sonnet 5.5, "Choosing an
effort level"), as bundled with Claude Code 2.1.286. Add only what evidence supports.
-->
- The default level is high. The levels are recalibrated: a level doesn't produce the same amount of thinking as the same level on earlier Sonnet models.
- On most agentic coding evaluations it scored higher at medium than Claude Sonnet 5 did at high, typically at under a fifth of the cost.
- From medium up it thinks briefly before almost every reply, even a greeting. At low it skips thinking on most simple requests.
