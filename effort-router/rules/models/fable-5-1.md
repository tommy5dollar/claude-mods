<!--
What effort means on Claude Fable 5.1. The router sends these notes with every check while the session runs on this
model, after the routing rules. Source: Anthropic's model migration guide (Migrating to Claude Fable 5.1, "Consider all
effort levels", and Migrating to Claude Fable 5.1 from Claude Fable 5, "Effort" and "Search triggering at low effort"),
as bundled with Claude Code 2.1.286. Add only what evidence supports.
-->
- The default level is high. Recommended: high for most tasks, xhigh for the most capability-sensitive work, medium or low for routine work.
- Lower levels, low included, still perform very well, often beyond what earlier models managed at xhigh or max.
- At higher effort on routine work it can gather context and deliberate beyond what the task needs. Higher effort buys the most rigorous verification.
- At low it calls search and retrieval tools less and answers from memory more, most visibly for named products, models and tools whose current state it may not know.
