// Prints what happened in each run under a folder: per step the wall time and cost, every model request from OTel
// (who sent it, at what effort, tokens, cost, time) and the router's assessments from its ledger.
//
//   bun eval/scenarios/inspect.ts D:/code/misc/claude-mods/evals/<stamp>/<scenario>
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (!root) throw new Error('Pass a scenario folder')

const jsonl = (file: string) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>) : []

for (const name of readdirSync(root).sort()) {
  const dir = join(root, name)
  if (!existsSync(join(dir, 'run.json'))) continue
  const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
  console.log(`\n## ${name}  (${run.grade.passed ? 'PASS' : 'FAIL'}, ${(run.wallMs / 1000).toFixed(1)}s)`)
  for (const step of run.steps)
    console.log(`step "${step.step.slice(0, 60)}": ${((step.wallMs ?? 0) / 1000).toFixed(1)}s wall, ${((step.result?.duration_api_ms ?? 0) / 1000).toFixed(1)}s api, $${Number(step.result?.total_cost_usd ?? 0).toFixed(3)} so far, ${step.result?.num_turns} turns`)

  const otel = jsonl(join(dir, 'otel.jsonl'))
  const kinds = new Map<string, number>()
  for (const r of otel) kinds.set(String(r['event.name'] ?? r.body), (kinds.get(String(r['event.name'] ?? r.body)) ?? 0) + 1)
  console.log(`otel: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`)
  const requests = otel.filter(r => String(r['event.name'] ?? r.body).includes('api_request'))
  let cost = 0
  let output = 0
  for (const r of requests) {
    cost += Number(r.cost_usd ?? 0)
    output += Number(r.output_tokens ?? 0)
    console.log(`  ${String(r.query_source).padEnd(34)} ${String(r.model).padEnd(18)} effort=${String(r.effort).padEnd(7)} out=${String(r.output_tokens).padStart(6)} in=${String(r.input_tokens).padStart(6)} cacheRead=${String(r.cache_read_tokens).padStart(7)} ${(Number(r.duration_ms) / 1000).toFixed(1)}s $${Number(r.cost_usd).toFixed(4)}${r['effort_router.status'] ? ` [${r['effort_router.status']} setting=${r['effort_router.setting']} level=${r['effort_router.level']}]` : ''}`)
  }
  console.log(`  total ${requests.length} requests, ${output} output tokens, $${cost.toFixed(3)}`)

  const ledgerFile = join(dir, 'ledger.json')
  if (existsSync(ledgerFile)) {
    const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'))
    for (const v of ledger.verdicts ?? []) console.log(`  router ${v.kind} #${v.prompt}: ${v.outcome} (${v.level}${v.confidence === undefined ? '' : `, ${Math.round(v.confidence * 100)}%`}) ${v.reason}${v.why ? `\n    why: ${v.why}` : ''}`)
    for (const r of ledger.reads ?? []) console.log(`  router reads ${r.kind}: ${r.calls} calls, ${r.output} out, ${r.input} in`)
    for (const a of ledger.subagents ?? []) console.log(`  subagent "${a.description}" (${a.model}): ${a.parent ?? '?'} -> ${a.level} in ${a.ms} ms: ${a.reason}`)
  }
}
