// For every run under the evals folder: each request's effort, grouped by who sent it (query_source) and model,
// next to the session's effort setting. Checks what subagents run at when the router is off.
//
//   bun eval/scenarios/efforts.ts [scenario ...]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.env.EVALS ?? 'D:/code/misc/claude-mods/evals'
const only = process.argv.slice(2)
for (const stamp of readdirSync(root).filter(s => /^\d{4}-/.test(s)))
  for (const scenario of readdirSync(join(root, stamp))) {
    if (only.length && !only.includes(scenario)) continue
    for (const run of readdirSync(join(root, stamp, scenario))) {
      const dir = join(root, stamp, scenario, run)
      if (!existsSync(join(dir, 'run.json'))) continue
      const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
      const groups = new Map<string, number>()
      for (const line of readFileSync(join(dir, 'otel.jsonl'), 'utf8').split('\n').filter(Boolean)) {
        const r = JSON.parse(line)
        if (!String(r['event.name'] ?? r.body).includes('api_request')) continue
        const key = `${r.query_source} ${String(r.model).replace('claude-', '')} ${r.effort ?? '(no effort)'}`
        groups.set(key, (groups.get(key) ?? 0) + 1)
      }
      console.log(`${scenario}/${run} [setting ${meta.arm.effort}, router ${meta.arm.router ? 'on' : 'off'}]: ${[...groups].map(([k, n]) => `${k} ×${n}`).join(' | ')}`)
    }
  }
