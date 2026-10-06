# End-to-end scenarios

Real `claude -p` sessions on a small payments repo (`fixtures/payouts`), with the router on and off, graded by tests
the session never sees (`hidden/`). Each run also keeps what's needed to rebuild it as a demo: every event with its
time, every model request with its effort, and the router's assessments.

```
bun eval/scenarios/run.ts --scenario double-debit --repeats 3     # all arms of each repeat side by side
bun eval/scenarios/inspect.ts <out>/<stamp>/double-debit          # time, cost, every request's effort, the router's verdicts
bun eval/scenarios/replies.ts <out>/<stamp>/double-debit          # each run's final reply and the files it changed
bun eval/scenarios/summarise.ts <out> [scenario...]                # a table per scenario: pass rate, median time and cost
bun eval/scenarios/costs.ts [scenario...]                          # cost and request time by sender and level
bun eval/scenarios/tokens.ts [scenario[:arm]...]                   # tokens by sender, model and effort, and <out>/tokens.json
```

Output goes to `.evals` (or `EVALS` if it's set) unless `--out` says otherwise. Each run's folder holds:

| File | What's in it |
| --- | --- |
| `events.jsonl` | Every stream-json event, stamped `t` (ms since the session started) |
| `otel.jsonl` | Claude Code's OTel log records, from a local OTLP receiver. `api_request` has model, effort, query_source, tokens, cost and duration, plus the router's attributes |
| `ledger.json` | The router's ledger: each assessment's level, reason and why (rows from before 0.18 also have a spread and confidence), and the tokens its reads used |
| `diff.patch` | What the session changed |
| `run.json` | The arm, each step's wall time and result, and the grade |

The sessions are isolated: the shell's `CLAUDE_*`, `ANTHROPIC_*` and `OTEL_*` variables are dropped, and
`--setting-sources project --strict-mcp-config` keeps out user settings, rules, memory, agents, plugins and MCP
servers. The router loads only in its own arms, with `--plugin-dir`.

The router's assessments are not in OTel or in Claude Code's cost: take their tokens from `ledger.json` (`reads`).
