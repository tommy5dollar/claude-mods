// Writes eval/routing-approved.json: the judge's levels where the router agrees, the judge's best where it doesn't,
// and the overrides below where a level was decided against the judge (each with its reason, kept in the file).
// Run it after a routing run to rebuild the approvals.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EVAL = 'D:/code/mods/effort-router/eval'
const RES = 'D:/code/misc/claude-mods/evals/routing'
type Row = { set: string; name: string; picks: string[] }
const rowsOf = (pattern: RegExp): Row[] =>
  readdirSync(RES).filter(f => pattern.test(f)).sort().flatMap(f => (JSON.parse(readFileSync(join(RES, f), 'utf8')).rows as Row[]))
const picks = (rows: Row[]) => {
  const out: Record<string, string[]> = {}
  for (const r of rows) out[`${r.set}:${r.name}`] = r.picks // later files win
  return out
}
const now = {
  opus: picks(rowsOf(/-opus-(live|cheap)\.json$/)),
  sonnet: picks(rowsOf(/-sonnet-(live|cheap)\.json$/)),
  fable: picks(rowsOf(/-fable-live\.json$/)),
}
const judge = {
  opus: JSON.parse(readFileSync(join(EVAL, 'routing-judge-opus.json'), 'utf8')),
  sonnet: JSON.parse(readFileSync(join(EVAL, 'routing-judge-sonnet.json'), 'utf8')),
  fable: JSON.parse(readFileSync(join(EVAL, 'routing-judge-fable.json'), 'utf8')),
}

const overrides: Record<string, { opus?: string | string[]; sonnet?: string | string[]; why: string }> = {
  'session:vague feature': { opus: ['medium', 'low', 'undecided'], sonnet: ['medium', 'low', 'undecided'], why: 'Borderline between no task yet and a vague one. Medium or low is cheaper for a session that starts on high, but undecided follows the frame.' },
  'session:cheap: explain an error': { opus: ['low', 'undecided'], sonnet: ['low', 'undecided'], why: 'Diagnosing one error message is a small task. Low is cheapest; undecided is fine too as it comes before other work.' },
  'session:cheap: update snapshots': { opus: ['low', 'medium'], why: 'An intended format change: updating snapshots and running tests is mostly mechanical, so low is fine.' },
  'session:cheap: convert config': { opus: ['low', 'medium'], why: 'A known pattern with a small loader change. Low or medium.' },
  'session:cheap: ordinary bug with a clear cause': { opus: ['low', 'medium'], sonnet: ['low', 'medium'], why: 'The cause is stated in the prompt. Either cheap level does it.' },
  'session:cheap: bump a dependency': { sonnet: ['low', 'medium'], why: 'It is a task, so undecided is wrong. Low or medium.' },
  'session:pay: explain fees, no changes': { opus: ['undecided', 'low', 'medium'], sonnet: ['undecided', 'low', 'medium'], why: 'A question asked before any work, which the frame says is undecided. Low or medium are fine too, since it is read-only tracing.' },
  'session:pay: --json flag': { opus: ['low', 'medium'], sonnet: ['low', 'medium'], why: 'A small feature in one command. Either cheap level.' },
  'session:mechanical rename': { sonnet: ['low', 'medium'], why: 'Mechanical. The judge wanted medium on Sonnet because its notes say low checks in early, but low is fine for a rename.' },
  'session:pay: rename and run tests': { sonnet: ['low', 'medium'], why: 'As the mechanical rename.' },
  'session:repo question before work': { sonnet: ['undecided', 'low'], why: 'Before any task undecided is right. Low on a question is harmless and cheaper.' },
  'session:pull, then what does it do': { sonnet: ['undecided', 'low'], why: 'As the repo question.' },
  'session:install and run (housekeeping)': { sonnet: ['undecided', 'low'], why: 'As the repo question.' },
  'session:held out: morning + git status': { opus: ['undecided', 'low'], sonnet: ['undecided', 'low'], why: 'As the repo question.' },
  'session:pay: what does this repo do': { sonnet: ['undecided', 'low'], why: 'As the repo question.' },
  'session:"2, keep it simple" after a numbered question': { sonnet: ['low', 'medium'], why: '"Keep it simple" narrows the change, it does not ask for less thinking. Low or medium.' },
  'subagent:security review of a branch': { opus: ['medium', 'high'], why: 'Security is one of the hidden-risk areas the rules name, and no user is there to catch a miss. High is acceptable here, but medium is enough for a small diff with a checklist.' },
  'subagent:Plan: design proposal for event-driven reconciliation': { opus: ['medium', 'high'], why: 'A design doc with no user in the loop. Medium is enough; high is tolerated rather than wanted.' },
  'subagent:implement rate limiting from a spec, with tests': { opus: ['medium', 'high'], sonnet: ['medium', 'high'], why: 'A specified feature, so medium should do, but Redis atomicity is a race and the Opus notes say high pays for races.' },
  'subagent:vague: "same for the invoices table"': { sonnet: ['medium', 'high'], why: 'The brief is vague, so the subagent has to work out the earlier change. Medium or high.' },
}

// Fable, set 2026-10-05 from three runs starting on high. Its main job is stepping down from high to medium or low.
const fableOverrides: Record<string, { fable: string | string[]; why: string }> = {
  'session:repo question before work': { fable: ['undecided', 'low'], why: 'Before any task undecided is right. Low on a question is harmless and cheaper.' },
  'session:install and run (housekeeping)': { fable: ['undecided', 'low'], why: 'As the repo question.' },
  'session:pay: what does this repo do': { fable: ['undecided', 'low'], why: 'As the repo question.' },
  'session:pull, then what does it do': { fable: ['undecided', 'low'], why: 'As the repo question.' },
  'session:held out: morning + git status': { fable: ['undecided', 'low'], why: 'As the repo question.' },
  'session:vague feature': { fable: ['medium', 'low', 'undecided'], why: 'As on the other models.' },
  'session:pay: explain fees, no changes': { fable: ['undecided', 'low', 'medium'], why: 'As on the other models.' },
  'session:ordinary feature': { fable: ['low', 'medium'], why: 'Fable is strong at low and the judge picked it, but medium for a feature is a fine step down from high.' },
  'session:held out: bank statement importer, vague': { fable: ['low', 'medium'], why: 'As the ordinary feature.' },
  'session:cheap: ordinary feature with tests': { fable: ['low', 'medium'], why: 'As the ordinary feature.' },
  'subagent:vague: "same for the invoices table"': { fable: ['low', 'medium'], why: 'Repeating earlier work on another table. Either cheap level.' },
  'subagent:Plan: design proposal for event-driven reconciliation': { fable: ['medium', 'high'], why: 'As on Opus: a design doc with no user in the loop. Medium is enough; high is tolerated.' },
  'session:held out: pagination': { fable: ['low', 'medium'], why: 'Both step down from high. Medium after the notes said medium checks its own work.' },
  'session:cheap: update snapshots': { fable: ['low', 'medium'], why: 'As pagination, and low or medium on Opus too.' },
  'session:autonomous end-to-end build': { fable: 'medium', why: 'Fable stayed on high for this until its notes said medium copes with long unattended builds (2026-10-05).' },
  'session:pay: security review': { fable: 'high', why: 'Fable went to xhigh until its notes said high covers most edge-case-heavy work (2026-10-05).' },
}

const keys = [...new Set([...Object.keys(now.opus), ...Object.keys(now.sonnet)])]
const out: Record<string, Record<string, unknown>> = {}
for (const key of keys) {
  const entry: Record<string, unknown> = {}
  for (const m of ['opus', 'sonnet', 'fable'] as const) {
    const p = now[m][key]
    const j = judge[m][key]
    if (!p || !j) continue
    const steady = p.every(x => x === p[0]) ? p[0] : undefined
    entry[m] = steady && j.right.includes(steady) ? (j.right.length > 1 ? j.right : steady) : j.best
  }
  const o = overrides[key]
  if (o) {
    if (o.opus) entry.opus = o.opus
    if (o.sonnet) entry.sonnet = o.sonnet
    entry.why = o.why
  }
  const fo = fableOverrides[key]
  if (fo) {
    entry.fable = fo.fable
    entry.why = entry.why ? `${entry.why} Fable: ${fo.why}` : `Fable: ${fo.why}`
  }
  out[key] = entry
}
const missing = [...Object.keys(overrides), ...Object.keys(fableOverrides)].filter(k => !out[k])
if (missing.length) throw new Error(`overrides for unknown fixtures: ${missing.join(', ')}`)
writeFileSync(join(EVAL, 'routing-approved.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log(`${Object.keys(out).length} prompts approved`)
