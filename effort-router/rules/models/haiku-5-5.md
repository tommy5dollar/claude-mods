<!--
How effort pays on Claude Haiku 5.5, the first Haiku with effort levels (Claude Code 2.1.293 or later). The router sends
these notes with every check while the session (or a subagent) runs on this model. They are heuristics, not results:
benchmark scores are left out, as in every model's notes. Cost and steps against medium are rounded from CursorBench 4.0's
cost and steps per task (it gives no time), which come from long, hard tasks: on the short, scoped work Haiku is usually
given the gaps are smaller, so the notes say so. Behaviours are from Anthropic's Haiku 5.5 prompting guide and effort
docs. The price step is from Anthropic's pricing page. Haiku is a subagent model in practice, so the router offers it up
to high (see SupportedModel.highest in policy.ts). Never add eval results, ours or anyone's: these have to stay heuristics.
-->
How effort pays on this model: it is mostly given short, scoped work such as searching, reading, summarising and small mechanical changes, where medium does the job and low is often enough. Each step up buys real gains on long or tricky tasks, but costs more than the same step on the larger models, because this model writes more and takes more steps as the level rises. Its price per token goes up 5 times once a request's prompt passes 100,000 tokens. Short jobs stay well under that, but a long task at a higher level is more likely to cross it, and every request after that costs 5 times as much at API prices. So step up only when the task clearly needs it.

Anthropic's advice for this model: medium for most work, including agentic coding, low for chat, short tool tasks and simple high-volume requests, high for knowledge work, longer agent tasks and strict instruction following, and xhigh or max only where a gain has been measured.

Each level, with its cost and steps against medium on long tasks (the gaps are smaller on short ones):
- low: about half the cost and 0.6 times the steps. Right for lookups and mechanical work. In long agent prompts it may skip a search or a check, or stop early and hand the task back.
- low and medium: sometimes reports a change as done without running a check.
- high: about 1.9 times the cost and 1.5 times the steps. Searches and checks more, and follows strict instructions more closely.
- xhigh: about 3.3 times the cost and 2.4 times the steps. In conversations it sometimes puts its whole answer in its thinking and replies with nothing.
- max: about 6.6 times the cost and 4 times the steps.
