// Where each run's money and time went: cost, output tokens and request time by sender (main thread, subagents,
// the router's forks, Haiku tool helpers) and by the level the requests went out at.
//
//   bun eval/scenarios/costs.ts <scenario> [...]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.env.EVALS ?? 'D:/code/misc/claude-mods/evals'
const only = process.argv.slice(2)
const kind = (source: string) =>
  source === 'sdk' ? 'main' : source.startsWith('agent:') ? 'subagents' : source === 'hook_prompt' ? 'router forks' : `helpers (${source})`

for (const stamp of readdirSync(root).filter(s => /^\d{4}-/.test(s)))
  for (const scenario of readdirSync(join(root, stamp))) {
    if (only.length && !only.includes(scenario)) continue
    for (const run of readdirSync(join(root, stamp, scenario))) {
      const dir = join(root, stamp, scenario, run)
      if (!existsSync(join(dir, 'run.json'))) continue
      const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
      const groups = new Map<string, { n: number; cost: number; out: number; secs: number }>()
      let total = 0
      for (const line of readFileSync(join(dir, 'otel.jsonl'), 'utf8').split('\n').filter(Boolean)) {
        const r = JSON.parse(line)
        if (!String(r['event.name'] ?? r.body).includes('api_request')) continue
        const key = `${kind(String(r.query_source))}: ${String(r.model).replace('claude-', '')} ${r.effort ?? '-'}`
        const g = groups.get(key) ?? { n: 0, cost: 0, out: 0, secs: 0 }
        g.n++
        g.cost += Number(r.cost_usd ?? 0)
        g.out += Number(r.output_tokens ?? 0)
        g.secs += Number(r.duration_ms ?? 0) / 1000
        groups.set(key, g)
        total += Number(r.cost_usd ?? 0)
      }
      console.log(`\n${stamp} ${scenario}/${run}: $${total.toFixed(2)}, ${(meta.wallMs / 1000).toFixed(0)}s wall`)
      for (const [k, g] of [...groups].sort((a, b) => b[1].cost - a[1].cost))
        console.log(`  ${k.padEnd(48)} ${String(g.n).padStart(4)} req  $${g.cost.toFixed(2).padStart(6)}  ${String(g.out).padStart(7)} out  ${g.secs.toFixed(0).padStart(5)}s of requests`)
    }
  }
