// Consistency and anchoring eval for the session check's spread (opt-in, real model).
//
//   bun eval/anchor.ts --model opus [--runs 5] [--concurrency 4] [--only <name>] [--out file.json]
//   bun eval/anchor.ts --report file.json [--confidence 0.7]
//
// Each session fixture that names a level is sent `runs` times under five
// conditions: no level stated, and the session at low, medium, high and xhigh.
// The report says how much the spread moves between identical calls, whether
// stating the level in force shifts the spread (sticky: the stated level gains
// probability; grass is greener: it loses), and how often the router would
// move off a level and then move again from where it landed.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { classifierPrompt, classifierSystem, judgeSpread, parseDecision, supportedModel, trimTranscript, type Level, type Spread } from '../hooks/policy'
import { FIXTURES } from './fixtures'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}

const OFFERED = ['low', 'medium', 'high', 'xhigh'] as const satisfies readonly Level[]
const CONDITIONS = ['none', ...OFFERED] as const
type Condition = (typeof CONDITIONS)[number]
type Read = { fixture: string; condition: Condition; run: number; spread: Spread | null; raw: string }
type Results = { model: string; runs: number; reads: Read[] }

function ask(model: string, system: string, prompt: string): Promise<string> {
  return new Promise(resolve => {
    const child = spawn('claude', ['-p', '--safe-mode', '--model', model, '--tools', '', '--no-session-persistence', '--system-prompt', system], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', chunk => (out += chunk))
    child.stderr.on('data', chunk => (err += chunk))
    child.on('error', error => resolve(`ERROR ${String(error)}`))
    child.on('close', code => resolve(code === 0 ? out : `ERROR exit ${code}: ${err.trim() || out.trim()}`))
    child.stdin.end(prompt)
  })
}

async function collect(): Promise<Results> {
  const model = flag('model') ?? 'opus'
  const runs = Number(flag('runs') ?? 5)
  const concurrency = Number(flag('concurrency') ?? 4)
  const known = supportedModel(model)
  if (!known) throw new Error(`not a supported model: ${model}`)
  const rules = readFileSync(join(import.meta.dir, '..', 'rules', 'default.md'), 'utf8')
  const notes = { name: known.name, notes: readFileSync(join(import.meta.dir, '..', 'rules', 'models', known.notesFile), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim() }
  const system = classifierSystem(rules, notes)
  const only = flag('only')
  const fixtures = FIXTURES.filter(f => !f.expect.includes('undecided') && (!only || f.name.includes(only)))
  const jobs = fixtures.flatMap(f => CONDITIONS.flatMap(condition => Array.from({ length: runs }, (_, run) => ({ f, condition, run }))))
  const reads: Read[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < jobs.length) {
        const { f, condition, run } = jobs[next++]!
        const raw = await ask(model, system, classifierPrompt(trimTranscript(f.messages, f.current), undefined, undefined, condition === 'none' ? undefined : condition))
        const parsed = parseDecision(raw)
        reads.push({ fixture: f.name, condition, run, spread: parsed.decision === 'lock' && parsed.spread ? parsed.spread : null, raw: raw.trim() })
        if (reads.length % 25 === 0) console.error(`${model}: ${reads.length}/${jobs.length}`)
      }
    }),
  )
  return { model, runs, reads }
}

const p = (s: Spread, l: Level): number => s[l] ?? 0
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const pts = (x: number): string => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)} pts`

function report({ model, reads }: Results, bar: number): string {
  const ok = reads.filter((r): r is Read & { spread: Spread } => r.spread !== null)
  const fixtures = [...new Set(ok.map(r => r.fixture))]
  const cell = (f: string, c: Condition) => ok.filter(r => r.fixture === f && r.condition === c).map(r => r.spread)
  const lines = [`${model}: ${ok.length}/${reads.length} reads with a spread, ${fixtures.length} fixtures`]

  // 1. Consistency between identical calls.
  let cells = 0
  let sameMedian = 0
  let sameAction = 0
  const wobble: number[] = []
  for (const f of fixtures)
    for (const c of CONDITIONS) {
      const spreads = cell(f, c)
      if (spreads.length < 2) continue
      cells++
      const medians = spreads.map(s => judgeSpread(s, undefined, OFFERED).level)
      if (new Set(medians).size === 1) sameMedian++
      if (c !== 'none') {
        const actions = spreads.map(s => {
          const j = judgeSpread(s, c, OFFERED)
          return j.confidence >= bar ? j.level : 'wait'
        })
        if (new Set(actions).size === 1) sameAction++
      }
      for (const l of OFFERED) {
        const xs = spreads.map(s => p(s, l))
        const m = mean(xs)
        wobble.push(mean(xs.map(x => Math.abs(x - m))))
      }
    }
  const stated = cells - fixtures.length
  lines.push(`  consistency: same median level in every run for ${sameMedian}/${cells} fixture-conditions; same router action (move to X, or wait) in every run for ${sameAction}/${stated} with a level stated; each level's probability wobbles by ${(100 * mean(wobble)).toFixed(1)} pts on average between identical calls`)

  // 2. Anchoring: does stating a level change that level's probability?
  const shifts: string[] = []
  const all: number[] = []
  for (const l of OFFERED) {
    const deltas = fixtures.map(f => mean(cell(f, l).map(s => p(s, l))) - mean(cell(f, 'none').map(s => p(s, l)))).filter(d => !Number.isNaN(d))
    all.push(...deltas)
    shifts.push(`${l} ${pts(mean(deltas))}`)
  }
  lines.push(`  anchoring (the stated level's probability, minus the same level's with no level stated; + sticky, - grass is greener): overall ${pts(mean(all))}; ${shifts.join(', ')}`)
  const medianShift = OFFERED.map(l => {
    const moved = fixtures.map(f => {
      const a = cell(f, l).map(s => OFFERED.indexOf(judgeSpread(s, undefined, OFFERED).level as never))
      const b = cell(f, 'none').map(s => OFFERED.indexOf(judgeSpread(s, undefined, OFFERED).level as never))
      return mean(a) - mean(b)
    }).filter(d => !Number.isNaN(d))
    return `${l} ${mean(moved) >= 0 ? '+' : ''}${mean(moved).toFixed(2)}`
  })
  lines.push(`  median level shift in levels when a level is stated (vs none; + higher): ${medianShift.join(', ')}`)

  // 3. Ping-pong: from each starting level, where the router lands, and whether it would move again from there.
  let moves = 0
  let movesAgain = 0
  let pingPong = 0
  const examples: string[] = []
  for (const f of fixtures)
    for (const start of OFFERED) {
      for (const s of cell(f, start)) {
        const j = judgeSpread(s, start, OFFERED)
        if (j.level === start || j.confidence < bar) continue
        moves++
        // From where it landed, any run that would move again?
        const again = cell(f, j.level).map(t => judgeSpread(t, j.level, OFFERED)).filter(k => k.level !== j.level && k.confidence >= bar)
        if (again.length) {
          movesAgain++
          if (again.some(k => k.level === start)) {
            pingPong++
            if (examples.length < 4) examples.push(`${f}: ${start} -> ${j.level} -> ${start}`)
          }
        }
      }
    }
  lines.push(`  moves: ${moves} confident moves; after ${movesAgain} of them at least one run from the landing level would move again, ${pingPong} straight back to the start${examples.length ? ` (${examples.join('; ')})` : ''}`)

  // Per fixture: the mean spread with no level stated, and where each start lands.
  lines.push('  per fixture: mean spread with no level stated | landing from low / medium / high / xhigh (majority of runs, "=" stays, "?" below the bar)')
  for (const f of fixtures) {
    const none = cell(f, 'none')
    const avg = OFFERED.map(l => `${l[0]}${Math.round(100 * mean(none.map(s => p(s, l))))}`).join(' ')
    const lands = OFFERED.map(start => {
      const acts = cell(f, start).map(s => {
        const j = judgeSpread(s, start, OFFERED)
        return j.confidence < bar ? '?' : j.level === start ? '=' : j.level
      })
      const top = [...new Set(acts)].map(a => [a, acts.filter(x => x === a).length] as const).sort((x, y) => y[1] - x[1])[0]
      return top ? `${top[0]}${top[1] < acts.length ? `(${top[1]}/${acts.length})` : ''}` : '-'
    })
    lines.push(`    ${f.padEnd(52).slice(0, 52)} ${avg.padEnd(20)} | ${lands.join(' / ')}`)
  }
  return lines.join('\n')
}

const reportFile = flag('report')
const bar = Number(flag('confidence') ?? 0.7)
if (reportFile) {
  console.log(report(JSON.parse(readFileSync(reportFile, 'utf8')) as Results, bar))
} else {
  const results = await collect()
  const out = flag('out') ?? `anchor-${results.model}.json`
  writeFileSync(out, JSON.stringify(results, null, 1))
  console.log(report(results, bar))
  console.log(`\nraw reads: ${out}`)
}
