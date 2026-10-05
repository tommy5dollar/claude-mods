// Tokens per run, by sender and model: uncached input, cache reads, cache writes and output, with cost and request
// time. Prints a table per run and writes every run to tokens.json under the evals root, for charts.
//
//   bun eval/scenarios/tokens.ts <scenario>[:<arm>] [...]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.env.EVALS ?? 'D:/code/misc/claude-mods/evals'
const filters = process.argv.slice(2).map(f => f.split(':') as [string, string?])
const wanted = (scenario: string, arm: string) =>
  !filters.length || filters.some(([s, a]) => s === scenario && (!a || a === arm))
const sender = (source: string) =>
  source === 'sdk' ? 'main' : source.startsWith('agent:') ? 'subagents' : source === 'hook_prompt' ? 'router' : 'tool helpers'

type Row = { sender: string; model: string; effort: string; requests: number; input: number; cacheRead: number; cacheWrite: number; output: number; cost: number; secs: number }
const runs: { scenario: string; model: string; arm: string; run: string; stamp: string; wallSecs: number; passed?: string; rows: Row[] }[] = []

for (const stamp of readdirSync(root).filter(s => /^\d{4}-/.test(s)))
  for (const scenario of readdirSync(join(root, stamp)))
    for (const run of readdirSync(join(root, stamp, scenario))) {
      const dir = join(root, stamp, scenario, run)
      const arm = run.replace(/-\d+$/, '')
      if (!existsSync(join(dir, 'run.json')) || !wanted(scenario, arm)) continue
      const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
      const rows = new Map<string, Row>()
      for (const line of readFileSync(join(dir, 'otel.jsonl'), 'utf8').split('\n').filter(Boolean)) {
        const r = JSON.parse(line)
        if (!String(r['event.name'] ?? r.body).includes('api_request')) continue
        const s = sender(String(r.query_source))
        const model = String(r.model).replace('claude-', '').replace(/-\d{8}$/, '')
        const effort = String(r.effort ?? '-')
        const key = `${s}|${model}|${effort}`
        const row = rows.get(key) ?? { sender: s, model, effort, requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0, secs: 0 }
        row.requests++
        row.input += Number(r.input_tokens ?? 0)
        row.cacheRead += Number(r.cache_read_tokens ?? 0)
        row.cacheWrite += Number(r.cache_creation_tokens ?? 0)
        row.output += Number(r.output_tokens ?? 0)
        row.cost += Number(r.cost_usd ?? 0)
        row.secs += Number(r.duration_ms ?? 0) / 1000
        rows.set(key, row)
      }
      const hidden = meta.grade?.hidden
      const passed = hidden ? `${hidden.pass}/${hidden.pass + hidden.fail}` : undefined
      runs.push({ scenario, model: String(meta.model).replace('claude-', ''), arm, run, stamp, wallSecs: Math.round(meta.wallMs / 1000), passed, rows: [...rows.values()] })
    }

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n))
for (const r of runs) {
  const total = r.rows.reduce((t, x) => t + x.cost, 0)
  console.log(`\n${r.scenario} ${r.run} (${r.stamp}): ${r.wallSecs}s wall, $${total.toFixed(2)}${r.passed ? `, hidden tests ${r.passed}` : ''}`)
  console.log('  sender        model         effort  req   input  cache rd  cache wr   output     cost')
  for (const x of r.rows.sort((a, b) => b.cost - a.cost))
    console.log(`  ${x.sender.padEnd(13)} ${x.model.padEnd(13)} ${x.effort.padEnd(6)} ${String(x.requests).padStart(4)} ${k(x.input).padStart(7)} ${k(x.cacheRead).padStart(9)} ${k(x.cacheWrite).padStart(9)} ${k(x.output).padStart(8)}  $${x.cost.toFixed(2).padStart(6)}`)
}
writeFileSync(join(root, 'tokens.json'), JSON.stringify(runs, null, 1))
