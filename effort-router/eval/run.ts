// Classifier eval: `bun run eval` (opt-in; calls the real model).
//
// Builds exactly what the router sends for each fixture, asks the model
// through `claude -p` with --safe-mode (no plugins or hooks, so the installed
// router does not run), no tools and --system-prompt, then parses the reply
// with the router's own parser. Two sets:
//   session   the session read: the shipped rules (rules/default.md) in the
//             fixed frame, and the trimmed transcript (FIXTURES)
//   subagent  a subagent's read at spawn: the same rules in the subagent
//             frame, and the brief (SUBAGENT_FIXTURES)
//
//   bun run eval                       # haiku, the router's default classifierModel
//   bun run eval -- --model sonnet     # another model
//   bun run eval -- --set subagent     # one set: session | subagent
//   bun run eval -- --only finance     # fixtures whose name contains "finance"
//   bun run eval -- --runs 3           # each fixture 3 times (the model is not deterministic)
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { classifierPrompt, classifierSystem, parseDecision, parseSubagentReply, subagentPrompt, subagentSystem, trimTranscript } from '../hooks/policy'
import { FIXTURES, SUBAGENT_FIXTURES, type Expected } from './fixtures'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const model = flag('model') ?? 'haiku'
const only = flag('only')
const set = flag('set')
const concurrency = Number(flag('concurrency') ?? 4)
const runs = Math.max(1, Number(flag('runs') ?? 1))

const rules = readFileSync(join(import.meta.dir, '..', 'rules', 'default.md'), 'utf8')

function ask(system: string, prompt: string): Promise<string> {
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

/** What a reply came to: a level, undecided (session set), or unusable (subagent set: the router would fall back). */
type Got = Expected | 'unusable'

/** One fixture as the eval runs it, whichever set it is from. */
type Case = {
  set: 'session' | 'subagent'
  name: string
  system: string
  prompt: string
  read: (raw: string) => { got: Got; reason?: string }
  expect: readonly Expected[]
}

const sessionSystem = classifierSystem(rules)
const agentSystem = subagentSystem(rules)

const cases: Case[] = [
  ...FIXTURES.map((fixture): Case => ({
    set: 'session',
    name: fixture.name,
    system: sessionSystem,
    prompt: classifierPrompt(trimTranscript(fixture.messages, fixture.current)),
    read: raw => {
      const decision = parseDecision(raw)
      return decision.decision === 'lock' ? { got: decision.level, reason: decision.reason } : { got: 'undecided' }
    },
    expect: fixture.expect,
  })),
  ...SUBAGENT_FIXTURES.map((fixture): Case => ({
    set: 'subagent',
    name: fixture.name,
    system: agentSystem,
    prompt: subagentPrompt(fixture.brief),
    read: raw => {
      const proposal = parseSubagentReply(raw)
      return proposal ? { got: proposal.level, reason: proposal.reason } : { got: 'unusable' }
    },
    expect: fixture.expect,
  })),
].filter(c => (!set || c.set === set) && (!only || c.name.includes(only)))

type Outcome = { case: Case; got: Got; reason?: string; raw: string; pass: boolean }

async function run(c: Case): Promise<Outcome> {
  let raw: string
  try {
    raw = await ask(c.system, c.prompt)
  } catch (error) {
    raw = `ERROR ${String(error)}`
  }
  const { got, reason } = c.read(raw)
  return { case: c, got, reason, raw: raw.trim(), pass: (c.expect as readonly Got[]).includes(got) }
}

const jobs = cases.flatMap(c => Array.from({ length: runs }, () => c))
const outcomes: Outcome[] = new Array(jobs.length)
let next = 0
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++
      outcomes[i] = await run(jobs[i] as Case)
    }
  }),
)

const score = (mine: readonly Case[]): string => {
  const reads = outcomes.filter(o => mine.includes(o.case))
  const passed = reads.filter(o => o.pass).length
  const clean = mine.filter(c => reads.every(o => o.case !== c || o.pass)).length
  return `${passed}/${reads.length} reads passed (${Math.round((100 * passed) / Math.max(1, reads.length))}%); ${clean}/${mine.length} fixtures passed every run`
}

console.log(`effort-router classifier eval: model ${model}, ${cases.length} fixtures x ${runs} run(s), rules/default.md`)
for (const which of ['session', 'subagent'] as const) {
  const mine = cases.filter(c => c.set === which)
  if (mine.length === 0) continue
  console.log(`\n${which === 'session' ? 'Session reads (transcript)' : 'Subagent reads (brief at spawn)'}:`)
  for (const c of mine) {
    const own = outcomes.filter(o => o.case === c)
    const ok = own.filter(o => o.pass).length
    const said = own.map(o => (o.reason ? `${o.got} (${o.reason})` : o.got)).join('; ')
    const tally = runs > 1 ? ` ${ok}/${runs}` : ''
    console.log(`${ok === own.length ? 'PASS' : 'MISS'}${tally}  ${c.name}: ${said}${ok === own.length ? '' : `  expected ${c.expect.join(' | ')}`}`)
  }
  console.log(`${which}: ${score(mine)}`)
}
console.log(`\nall: ${score(cases)}`)
const misses = outcomes.filter(o => !o.pass)
if (misses.length) {
  console.log('\nMisses:')
  for (const o of misses) console.log(`- [${o.case.set}] ${o.case.name}\n  expected: ${o.case.expect.join(' | ')}\n  raw: ${o.raw.replace(/\s+/g, ' ').slice(0, 300)}`)
  process.exitCode = 1
}
