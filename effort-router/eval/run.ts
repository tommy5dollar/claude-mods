// Classifier eval: `bun run eval` (opt-in; calls the real model).
//
// Builds what the router sends for each fixture, asks the model through
// `claude -p` with --safe-mode (no plugins or hooks, so the installed router
// does not run), no tools and --system-prompt, then parses the reply with the
// router's own parser. Two sets:
//   session   the session read as the first check makes it: the shipped rules
//             (rules/default.md) and the session model's notes
//             (rules/models/) in the fixed frame, and the trimmed transcript
//             (FIXTURES), on the session's model at its default effort. Later
//             checks fork the real session, which this can't reproduce.
//   subagent  a subagent's read at spawn as a separate call: the same rules
//             in the subagent frame with the notes for --model (the model the
//             subagent runs on), and the brief (SUBAGENT_FIXTURES). The router
//             asks a fork of the parent instead, which knows the task; this
//             can't reproduce that, so it's the harder case
//
//   bun run eval                       # the session set as an Opus 5.5 session
//   bun run eval -- --model sonnet     # as a Sonnet 5.5 session (or fable)
//   bun run eval -- --effort low       # the session set at a set effort
//   bun run eval -- --set subagent     # one set: session | subagent
//   bun run eval -- --only finance     # fixtures whose name contains "finance"
//   bun run eval -- --runs 3           # each fixture 3 times (the model is not deterministic)
//   bun run eval -- --confidence 0.7   # the bar a pass must clear to count as acted on (default 0.8)
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  classifierPrompt,
  classifierSystem,
  isConfident,
  parseDecision,
  parseSubagentReply,
  percent,
  subagentPrompt,
  subagentSystem,
  supportedModel,
  trimTranscript,
} from '../hooks/policy'
import { FIXTURES, SUBAGENT_FIXTURES, type Expected } from './fixtures'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const model = flag('model') ?? 'opus'
const effort = flag('effort')
const bar = Number(flag('confidence') ?? 0.8)
const only = flag('only')
const set = flag('set')
const concurrency = Number(flag('concurrency') ?? 4)
const runs = Math.max(1, Number(flag('runs') ?? 1))

const rules = readFileSync(join(import.meta.dir, '..', 'rules', 'default.md'), 'utf8')
const known = supportedModel(model)
const notes = known
  ? { name: known.name, notes: readFileSync(join(import.meta.dir, '..', 'rules', 'models', known.notesFile), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim() }
  : undefined

function ask(system: string, prompt: string, on: { model: string; effort?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--safe-mode', '--model', on.model, ...(on.effort ? ['--effort', on.effort] : []), '--tools', '', '--no-session-persistence', '--system-prompt', system],
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
  read: (raw: string) => { got: Got; reason?: string; confidence?: number }
  expect: readonly Expected[]
  on: { model: string; effort?: string }
}

const sessionSystem = classifierSystem(rules, notes)
const agentSystem = subagentSystem(rules, notes)
const modelKey = known?.alias as 'opus' | 'sonnet' | 'fable' | undefined

const cases: Case[] = [
  ...FIXTURES.map((fixture): Case => ({
    set: 'session',
    name: fixture.name,
    system: sessionSystem,
    prompt: classifierPrompt(trimTranscript(fixture.messages, fixture.current)),
    read: raw => {
      const decision = parseDecision(raw)
      return decision.decision === 'lock' ? { got: decision.level, reason: decision.reason, confidence: decision.confidence } : { got: 'undecided' }
    },
    expect: (modelKey && fixture.expectOn?.[modelKey]) || fixture.expect,
    on: { model, effort },
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
    expect: (modelKey && fixture.expectOn?.[modelKey]) || fixture.expect,
    on: { model, effort },
  })),
].filter(c => (!set || c.set === set) && (!only || c.name.includes(only)))

type Outcome = { case: Case; got: Got; reason?: string; confidence?: number; raw: string; pass: boolean }

async function run(c: Case): Promise<Outcome> {
  let raw: string
  try {
    raw = await ask(c.system, c.prompt, c.on)
  } catch (error) {
    raw = `ERROR ${String(error)}`
  }
  const { got, reason, confidence } = c.read(raw)
  return { case: c, got, reason, confidence, raw: raw.trim(), pass: (c.expect as readonly Got[]).includes(got) }
}

/** Whether the router would act on a session read: a level at or above the bar. */
const acted = (o: Outcome): boolean => o.case.set === 'session' && o.got !== 'undecided' && isConfident({ level: o.got as never, reason: '', confidence: o.confidence }, bar)

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

console.log(`effort-router classifier eval: session set as a ${notes?.name ?? model} session${effort ? ` at ${effort}` : ' at its default effort'}${notes ? ' with its notes' : ' (no notes: not a supported model)'}, subagent set as subagents on it; ${cases.length} fixtures x ${runs} run(s), bar ${percent(bar)}`)
for (const which of ['session', 'subagent'] as const) {
  const mine = cases.filter(c => c.set === which)
  if (mine.length === 0) continue
  console.log(`\n${which === 'session' ? 'Session reads (transcript)' : 'Subagent reads (brief at spawn)'}:`)
  for (const c of mine) {
    const own = outcomes.filter(o => o.case === c)
    const ok = own.filter(o => o.pass).length
    const said = own.map(o => (o.reason ? `${o.got}${o.confidence === undefined ? '' : ` ${percent(o.confidence)}`} (${o.reason})` : o.got)).join('; ')
    const tally = runs > 1 ? ` ${ok}/${runs}` : ''
    console.log(`${ok === own.length ? 'PASS' : 'MISS'}${tally}  ${c.name}: ${said}${ok === own.length ? '' : `  expected ${c.expect.join(' | ')}`}`)
  }
  console.log(`${which}: ${score(mine)}`)
  if (which === 'session') {
    const reads = outcomes.filter(o => mine.includes(o.case))
    const sure = reads.filter(acted)
    console.log(`  over the ${percent(bar)} bar (the router would act): ${sure.length}/${reads.length}, of which right ${sure.filter(o => o.pass).length}/${sure.length}`)
  }
}
console.log(`\nall: ${score(cases)}`)
const misses = outcomes.filter(o => !o.pass)
if (misses.length) {
  console.log('\nMisses:')
  for (const o of misses) console.log(`- [${o.case.set}] ${o.case.name}\n  expected: ${o.case.expect.join(' | ')}\n  raw: ${o.raw.replace(/\s+/g, ' ').slice(0, 300)}`)
  process.exitCode = 1
}
