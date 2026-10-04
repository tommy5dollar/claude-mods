// Classifier eval: `bun run eval` (opt-in; calls the real model).
//
// Builds exactly what the router sends (the shipped rules in rules/default.md
// inside the fixed frame, and the trimmed transcript) for each fixture, asks
// the model through `claude -p` with --safe-mode (no plugins or hooks, so the
// installed router does not run), no tools and --system-prompt, then parses
// the reply with the router's own parseDecision.
//
//   bun run eval                       # haiku, the router's default classifierModel
//   bun run eval -- --model sonnet     # another model
//   bun run eval -- --only finance     # fixtures whose name contains "finance"
//   bun run eval -- --runs 3           # each fixture 3 times (the model is not deterministic)
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { classifierPrompt, classifierSystem, parseDecision, trimTranscript } from '../hooks/policy'
import { FIXTURES, type Expected, type Fixture } from './fixtures'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const model = flag('model') ?? 'haiku'
const only = flag('only')
const concurrency = Number(flag('concurrency') ?? 4)
const runs = Math.max(1, Number(flag('runs') ?? 1))

const rules = readFileSync(join(import.meta.dir, '..', 'rules', 'default.md'), 'utf8')
const system = classifierSystem(rules)

function ask(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--safe-mode', '--model', model, '--effort', 'low', '--tools', '', '--no-session-persistence', '--system-prompt', system],
      { stdio: ['pipe', 'pipe', 'pipe'], shell: false },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', chunk => (out += chunk))
    child.stderr.on('data', chunk => (err += chunk))
    child.on('error', reject)
    child.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`claude -p exited ${code}: ${err.trim() || out.trim()}`))))
    child.stdin.end(prompt)
  })
}

type Outcome = { fixture: Fixture; got: Expected; reason?: string; raw: string; pass: boolean }

async function run(fixture: Fixture): Promise<Outcome> {
  const prompt = classifierPrompt(trimTranscript(fixture.messages, fixture.current))
  let raw: string
  try {
    raw = await ask(prompt)
  } catch (error) {
    raw = `ERROR ${String(error)}`
  }
  const decision = parseDecision(raw)
  const got: Expected = decision.decision === 'lock' ? decision.level : 'undecided'
  return { fixture, got, reason: decision.decision === 'lock' ? decision.reason : undefined, raw: raw.trim(), pass: fixture.expect.includes(got) }
}

const fixtures = FIXTURES.filter(f => !only || f.name.includes(only))
const jobs = fixtures.flatMap(f => Array.from({ length: runs }, () => f))
const outcomes: Outcome[] = new Array(jobs.length)
let next = 0
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++
      outcomes[i] = await run(jobs[i] as Fixture)
    }
  }),
)

console.log(`effort-router classifier eval: model ${model}, ${fixtures.length} fixtures x ${runs} run(s), rules/default.md\n`)
for (const fixture of fixtures) {
  const mine = outcomes.filter(o => o.fixture === fixture)
  const ok = mine.filter(o => o.pass).length
  const said = mine.map(o => (o.reason ? `${o.got} (${o.reason})` : o.got)).join('; ')
  const tally = runs > 1 ? ` ${ok}/${runs}` : ''
  console.log(`${ok === mine.length ? 'PASS' : 'MISS'}${tally}  ${fixture.name}: ${said}${ok === mine.length ? '' : `  expected ${fixture.expect.join(' | ')}`}`)
}
const passed = outcomes.filter(o => o.pass).length
const clean = fixtures.filter(f => outcomes.every(o => o.fixture !== f || o.pass)).length
console.log(`\n${passed}/${outcomes.length} reads passed (${Math.round((100 * passed) / outcomes.length)}%); ${clean}/${fixtures.length} fixtures passed every run`)
const misses = outcomes.filter(o => !o.pass)
if (misses.length) {
  console.log('\nMisses:')
  for (const o of misses) console.log(`- ${o.fixture.name}\n  expected: ${o.fixture.expect.join(' | ')}\n  raw: ${o.raw.replace(/\s+/g, ' ').slice(0, 300)}`)
  process.exitCode = 1
}
