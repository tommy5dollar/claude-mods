// The routing eval: every prompt in the set (eval/fixtures.ts), what the router routes it to, the approved level
// (eval/routing-approved.json, Tommy's sign-off) and a judge's view (eval/routing-rubric.md). Any change of prompt,
// rules or notes runs this first: a prompt whose level moves off its approved level is a regression until Tommy
// signs it off. It is independent of the end-to-end scenarios that show the savings.
//
// Each read is the first-prompt check (a separate call with the trimmed transcript), as `claude -p --safe-mode` with
// no tools, so no installed plugin runs. Later checks fork the real session, which this can't reproduce.
//
//   bun eval/routing.ts                              # the live router, Opus 5.5 sessions, 3 runs each
//   bun eval/routing.ts --model sonnet --runs 1      # Sonnet 5.5 (fable only when Fable's own notes change)
//   bun eval/routing.ts --router <dir> --label 0.17  # another copy of the router (a snapshot with hooks/ and rules/)
//   bun eval/routing.ts --judge                      # also ask the judge (cached per model; --rejudge to redo)
//   bun eval/routing.ts --set session --only pay:    # part of the set
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { FIXTURES, SUBAGENT_FIXTURES } from './fixtures'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined)
const has = (name: string) => args.includes(`--${name}`)

const HERE = import.meta.dir
const LIVE = resolve(HERE, '..')
const routerDir = resolve(flag('router') ?? LIVE)
const label = flag('label') ?? (routerDir === LIVE ? 'live' : routerDir.split(/[\\/]/).slice(-2).join('/'))
const alias = (flag('model') ?? 'opus') as 'opus' | 'sonnet' | 'fable'
const runs = Math.max(1, Number(flag('runs') ?? 3))
const only = flag('only')
const set = flag('set')
const concurrency = Number(flag('concurrency') ?? 6)
const OUT = join(process.env.EVALS ?? '.evals', 'routing')

type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Got = Level | 'undecided' | 'unusable'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const policy: any = await import(join(routerDir, 'hooks', 'policy.ts'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const live: any = await import(join(LIVE, 'hooks', 'policy.ts'))
const known = live.supportedModel(alias) as { id: string; name: string; notesFile: string }
/** Claude Code's default level per model: what a session is on before the router does anything. */
const setting: Level = (flag('setting') as Level) ?? (alias === 'fable' ? 'high' : 'medium')
const levels: readonly Level[] = policy.levelsUpTo()
const strip = (text: string) => text.replace(/<!--[\s\S]*?-->/g, '').trim()
const rules = readFileSync(join(routerDir, 'rules', 'default.md'), 'utf8')
const notes = { name: known.name, notes: strip(readFileSync(join(routerDir, 'rules', 'models', known.notesFile), 'utf8')) }
const liveNotes = strip(readFileSync(join(LIVE, 'rules', 'models', known.notesFile), 'utf8'))

/** What the run has cost so far, router reads and judge apart, from each call's own report. */
const spent = { router: 0, judge: 0 }
function ask(system: string, prompt: string, model: string, effort?: string, purse: keyof typeof spent = 'router'): Promise<string> {
  return new Promise(done => {
    const child = spawn('claude', ['-p', '--safe-mode', '--model', model, ...(effort ? ['--effort', effort] : []), '--tools', '', '--no-session-persistence', '--output-format', 'json', '--system-prompt', system], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', c => (out += c))
    child.on('error', e => done(`ERROR ${e}`))
    child.on('close', code => {
      if (code !== 0) return done(`ERROR exit ${code} ${out}`)
      try {
        const r = JSON.parse(out) as { result?: string; total_cost_usd?: number }
        spent[purse] += r.total_cost_usd ?? 0
        done(r.result ?? '')
      } catch {
        done(out)
      }
    })
    child.stdin.end(prompt)
  })
}

type Case = { set: 'session' | 'subagent'; name: string; system: string; prompt: string; judgeInput: string }
const cases: Case[] = [
  ...FIXTURES.map(f => {
    const transcript: string = policy.trimTranscript(f.messages, f.current)
    return {
      set: 'session' as const,
      name: f.name,
      system: policy.classifierSystem(rules, notes, levels),
      prompt: policy.classifierPrompt(transcript, undefined, undefined, setting),
      judgeInput: `A Claude Code session on ${known.name}, at ${setting} effort (Claude Code's default for it). Levels on offer: ${levels.join(', ')}.\n\nWhat each level does on ${known.name}:\n<model_notes>\n${liveNotes}\n</model_notes>\n\nThe conversation so far, oldest first, ending with the message about to run:\n<transcript>\n${transcript}\n</transcript>\n\nWhich levels are right for the work from here?`,
    }
  }),
  ...SUBAGENT_FIXTURES.map(f => ({
    set: 'subagent' as const,
    name: f.name,
    system: policy.subagentSystem(rules, notes, levels),
    prompt: policy.subagentPrompt(f.brief),
    judgeInput: `A Claude Code subagent on ${known.name}, started by another agent with the brief below. No user is in the loop, and undecided is not an option. Levels on offer: ${levels.join(', ')}.\n\nWhat each level does on ${known.name}:\n<model_notes>\n${liveNotes}\n</model_notes>\n\nAgent type: ${f.brief.subagentType}\n<brief>\n${f.brief.prompt}\n</brief>\n\nWhich levels are right for this subagent?`,
  })),
].filter(c => (!set || c.set === set) && (!only || c.name.includes(only)))

/** Where a reply lands under this version's own rule. 0.17 moved only when 70% of the spread sat on one side. */
function landing(c: Case, raw: string): { got: Got; picked?: Got; reason?: string; why?: string } {
  if (c.set === 'subagent') {
    const p = policy.parseSubagentReply(raw)
    return p ? { got: p.level, reason: p.reason } : { got: 'unusable' }
  }
  const d = policy.parseDecision(raw)
  if (d.decision !== 'lock') return { got: 'undecided' }
  if (policy.judgeSpread && d.spread) {
    const j = policy.judgeSpread(d.spread, setting, levels)
    return { got: j.confidence >= 0.7 ? j.level : setting, picked: j.level, reason: d.reason, why: d.why }
  }
  return { got: d.level, reason: d.reason, why: d.why }
}

type Read = { got: Got; picked?: Got; reason?: string; why?: string; raw: string }
const jobs = cases.flatMap(c => Array.from({ length: runs }, () => c))
const reads = new Map<Case, Read[]>()
let next = 0
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const c = jobs[next++] as Case
      const raw = await ask(c.system, c.prompt, known.id, setting)
      reads.set(c, [...(reads.get(c) ?? []), { ...landing(c, raw), raw: raw.trim().slice(0, 600) }])
    }
  }),
)

// The judge: Opus 5.5 at high, with the rubric, never shown the router's pick. Cached per model and fixture.
type Verdict = { right: Got[]; best: Got; why: string }
const judgeFile = join(HERE, `routing-judge-${alias}.json`)
const judged: Record<string, Verdict> = existsSync(judgeFile) ? JSON.parse(readFileSync(judgeFile, 'utf8')) : {}
if (has('judge') || has('rejudge')) {
  const rubric = strip(readFileSync(join(HERE, 'routing-rubric.md'), 'utf8'))
  const todo = cases.filter(c => has('rejudge') || !judged[`${c.set}:${c.name}`])
  let j = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
      while (j < todo.length) {
        const c = todo[j++] as Case
        const raw = await ask(rubric, c.judgeInput, 'claude-opus-5-5', 'high', 'judge')
        const match = raw.match(/\{[\s\S]*\}/)
        try {
          const v = JSON.parse(match?.[0] ?? '') as Verdict
          judged[`${c.set}:${c.name}`] = { right: v.right.map(l => l.toLowerCase() as Got), best: v.best.toLowerCase() as Got, why: v.why }
        } catch {
          console.error(`judge reply unreadable for ${c.name}: ${raw.slice(0, 200)}`)
        }
      }
    }),
  )
  writeFileSync(judgeFile, `${JSON.stringify(judged, null, 2)}\n`)
}

// Approved levels per fixture and model: one level, or the levels that are all fine where two are defensible. The
// approved level holds whatever level the session starts on (the setting has no special weight), so a run from high
// checks against the same approvals.
const approvedFile = join(HERE, 'routing-approved.json')
const approved: Record<string, Partial<Record<typeof alias, Got | Got[]>>> = existsSync(approvedFile) ? JSON.parse(readFileSync(approvedFile, 'utf8')) : {}
const allowed = (ok: Got | Got[] | undefined): Got[] | undefined => (ok === undefined ? undefined : Array.isArray(ok) ? ok : [ok])

const rows = cases.map(c => {
  const mine = reads.get(c) ?? []
  const key = `${c.set}:${c.name}`
  const ok = allowed(approved[key]?.[alias])
  const verdict = judged[key]
  return {
    set: c.set,
    name: c.name,
    picks: mine.map(r => r.got),
    picked: mine.map(r => r.picked ?? r.got),
    reasons: mine.map(r => r.why ?? r.reason ?? ''),
    approved: ok,
    moved: ok ? mine.filter(r => !ok.includes(r.got)).length : undefined,
    judge: verdict,
    judgeAgrees: verdict ? mine.filter(r => verdict.right.includes(r.got)).length : undefined,
  }
})

mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const file = join(OUT, `${stamp}-${alias}-${label.replace(/[\\/]/g, '_')}.json`)
writeFileSync(file, `${JSON.stringify({ model: known.name, alias, router: label, setting, levels, runs, rows }, null, 2)}\n`)

console.log(`routing eval: ${label} router, ${known.name} at ${setting}, ${runs} run(s) per prompt -> ${file}\n`)
for (const r of rows) {
  const flagMove = !r.moved ? '' : r.moved * 2 >= r.picks.length ? `  MOVED from approved ${r.approved?.join('|')} (${r.moved}/${r.picks.length})` : `  wobble off ${r.approved?.join('|')} (${r.moved}/${r.picks.length})`
  const judge = r.judge ? `  judge: ${r.judge.right.join('|')} (best ${r.judge.best})${r.judgeAgrees === r.picks.length ? '' : ' DISAGREES'}` : ''
  console.log(`${r.set === 'session' ? 'S' : 'A'} ${r.name.padEnd(46)} ${r.picks.join(' ').padEnd(26)}${flagMove}${judge}`)
}
// A move is most runs off the approved level: that needs sign-off. One run in three off is the model's variance,
// shown as a wobble, and becomes a move if it keeps happening.
const moves = rows.filter(r => r.moved && r.moved * 2 >= r.picks.length)
const wobbles = rows.filter(r => r.moved && r.moved * 2 < r.picks.length)
if (wobbles.length) console.log(`\n${wobbles.length} prompts wobbled (a minority of runs off the approved level).`)
console.log(`\nCost: $${spent.router.toFixed(2)} for the router's reads${spent.judge ? `, $${spent.judge.toFixed(2)} for the judge` : ''}.`)
console.log(`\n${moves.length ? `${moves.length} prompts moved off their approved level: sign-off needed.` : rows.some(r => r.approved) ? 'No prompt moved off its approved level.' : 'Nothing approved yet for this model.'}`)
