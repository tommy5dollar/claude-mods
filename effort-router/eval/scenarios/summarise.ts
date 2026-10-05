// One table per scenario: for each arm, how often it passed and the median time, cost and output tokens, split into
// the main thread and subagents, with the levels the requests went out at and what the router's own reads used.
//
//   bun eval/scenarios/summarise.ts <evals folder> [scenario ...]     # every stamp folder under it is included
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
const only = process.argv.slice(3)
if (!root) throw new Error('Pass the evals folder')

type Row = { arm: string; passed?: boolean; wall: number; cost: number; output: number; subCost: number; subOutput: number; levels: string[]; subLevels: string[]; routerReads: string; turns: number }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}
const jsonl = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])
const tally = (xs: string[]) => {
  const counts = new Map<string, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts].map(([k, n]) => `${k}×${n}`).join(' ')
}

const byScenario = new Map<string, Row[]>()
for (const stamp of readdirSync(root)) {
  const stampDir = join(root, stamp)
  if (!existsSync(stampDir) || !/^\d{4}-/.test(stamp)) continue
  for (const scenario of readdirSync(stampDir)) {
    if (only.length && !only.includes(scenario)) continue
    for (const runName of readdirSync(join(stampDir, scenario))) {
      const dir = join(stampDir, scenario, runName)
      if (!existsSync(join(dir, 'run.json'))) continue
      const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
      const requests = jsonl(join(dir, 'otel.jsonl')).filter(r => String(r['event.name'] ?? r.body).includes('api_request'))
      // hook_prompt is a mod's own model call: here, the router's forks (its first-prompt read is not in OTel).
      const main = requests.filter(r => !String(r.query_source).startsWith('agent:') && r.query_source !== 'hook_prompt')
      const sub = requests.filter(r => String(r.query_source).startsWith('agent:'))
      const sum = (rs: Record<string, unknown>[], key: string) => rs.reduce((s, r) => s + Number(r[key] ?? 0), 0)
      const ledger = existsSync(join(dir, 'ledger.json')) ? JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8')) : undefined
      const reads = (ledger?.reads ?? []) as { kind: string; calls: number; output: number; input: number }[]
      const row: Row = {
        arm: run.arm.name,
        passed: run.grade?.passed,
        wall: run.wallMs / 1000,
        cost: sum(requests, 'cost_usd'),
        output: sum(requests, 'output_tokens'),
        subCost: sum(sub, 'cost_usd'),
        subOutput: sum(sub, 'output_tokens'),
        levels: main.map(r => String(r.effort)),
        subLevels: sub.map(r => `${String(r.model).replace('claude-', '')} ${r.effort}`),
        routerReads: reads.map(r => `${r.kind} ${r.calls}: ${r.input} in/${r.output} out`).join(', '),
        turns: run.steps.reduce((s: number, step: { result?: { num_turns?: number } }) => s + Number(step.result?.num_turns ?? 0), 0),
      }
      const key = `${scenario} (${String(run.model).replace('claude-', '')})`
      byScenario.set(key, [...(byScenario.get(key) ?? []), row])
    }
  }
}

for (const [scenario, rows] of byScenario) {
  console.log(`\n### ${scenario}\n`)
  console.log('| Arm | Runs | Passed | Median time | Median cost | Median output tokens | Median turns | Main-thread requests by level | Subagent requests by level |')
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  const arms = [...new Set(rows.map(r => r.arm))]
  for (const arm of arms) {
    const rs = rows.filter(r => r.arm === arm)
    const graded = rs.filter(r => r.passed !== undefined)
    console.log(
      `| ${arm} | ${rs.length} | ${graded.length ? `${graded.filter(r => r.passed).length}/${graded.length}` : '-'} | ${median(rs.map(r => r.wall)).toFixed(0)}s | $${median(rs.map(r => r.cost)).toFixed(3)} | ${median(rs.map(r => r.output)).toFixed(0)} | ${median(rs.map(r => r.turns))} | ${tally(rs.flatMap(r => r.levels))} | ${rs.some(r => r.subLevels.length) ? `${tally(rs.flatMap(r => r.subLevels))}, median $${median(rs.map(r => r.subCost)).toFixed(3)}` : '-'} |`,
    )
  }
  const reads = rows.filter(r => r.routerReads).map(r => r.routerReads)
  if (reads.length) console.log(`\nRouter reads (forks are in the costs above as hook_prompt requests; the first-prompt read is not): ${reads.slice(0, 3).join(' | ')}${reads.length > 3 ? ' ...' : ''}`)
}
