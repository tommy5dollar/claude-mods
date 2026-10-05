// End-to-end eval: runs each scenario's human turns through a real `claude -p` session in a fresh copy of its fixture
// repo, once per arm (router on, router off at a fixed level), then grades the repo with tests the session never saw.
//
//   bun eval/scenarios/run.ts --scenario currency-bug [--arms fixed-medium,router-from-medium] [--repeats 3]
//                             [--out D:/code/misc/claude-mods/evals] [--serial]
//
// Each run keeps everything needed to rebuild it as footage: every stream-json event stamped with ms since start,
// every OTel api_request record (model, effort, query_source, tokens, cost, duration), the router's ledger
// (assessments with their spreads and reasons), the diff and the grade.
//
// Isolation: the session gets a scrubbed environment (no CLAUDE_*, ANTHROPIC_* or OTEL_* from the shell that ran
// this), --setting-sources project and --strict-mcp-config, so no user settings, rules, memory, agents, plugins or
// MCP servers load. The router loads
// only in the arms that ask for it, with --plugin-dir. Arms of one repeat run side by side, so they share conditions.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Arm, type Scenario, scenarios } from './scenarios'

const HERE = import.meta.dir
const ROUTER = resolve(HERE, '../..')
const STEP_TIMEOUT_MS = 20 * 60 * 1000

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const scenario = scenarios.find(s => s.name === flag('scenario'))
if (!scenario) throw new Error(`--scenario must be one of ${scenarios.map(s => s.name).join(', ')}`)
const armNames = flag('arms')?.split(',')
const arms = armNames ? scenario.arms.filter(a => armNames.includes(a.name)) : scenario.arms
const repeats = Number(flag('repeats') ?? 1)
const outRoot = resolve(flag('out') ?? 'D:/code/misc/claude-mods/evals')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

type Attr = { key: string; value: Record<string, unknown> }
type OtlpLogs = {
  resourceLogs?: { scopeLogs?: { logRecords?: { timeUnixNano?: string; body?: Record<string, unknown>; attributes?: Attr[] }[] }[] }[]
}

function otlpValue(v: Record<string, unknown> | undefined): unknown {
  if (!v) return undefined
  return v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue ?? v
}

/** A local OTLP/HTTP JSON receiver for one run's logs, written flat to a JSONL file. */
function startCollector(file: string) {
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      if (req.method === 'POST') {
        const body = await req.text()
        try {
          const payload = JSON.parse(body) as OtlpLogs
          for (const rl of payload.resourceLogs ?? [])
            for (const sl of rl.scopeLogs ?? [])
              for (const r of sl.logRecords ?? []) {
                const attrs = Object.fromEntries((r.attributes ?? []).map(a => [a.key, otlpValue(a.value)]))
                const time = r.timeUnixNano ? Number(BigInt(r.timeUnixNano) / 1_000_000n) : undefined
                appendFileSync(file, `${JSON.stringify({ time, body: otlpValue(r.body), ...attrs })}\n`)
              }
        } catch {
          appendFileSync(`${file}.raw`, `${body}\n`)
        }
      }
      return new Response('{}', { headers: { 'content-type': 'application/json' } })
    },
  })
}

function cleanEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(CLAUDE|ANTHROPIC|OTEL)/.test(k)) env[k] = v
  return { ...env, ...extra }
}

function git(repo: string, ...args: string[]) {
  return spawnSync('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.com', ...args], { cwd: repo, encoding: 'utf8' })
}

type StepRecord = { step: string; sentAt: number; resultAt?: number; wallMs?: number; result?: Record<string, unknown> }

function runSession(s: Scenario, arm: Arm, repo: string, dir: string, port: number) {
  const args = [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', s.model, '--effort', arm.effort, '--setting-sources', 'project', '--strict-mcp-config', '--dangerously-skip-permissions',
  ]
  if (arm.router) args.push('--plugin-dir', ROUTER)
  if (arm.options) {
    const config = { options: arm.options }
    args.push('--settings', JSON.stringify({ pluginConfigs: { 'effort-router@inline': config, 'effort-router@tommy5dollar': config } }))
  }
  const env = cleanEnv({
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'none',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
    OTEL_LOGS_EXPORT_INTERVAL: '1000',
  })
  writeFileSync(join(dir, 'command.json'), JSON.stringify({ args, cwd: repo }, null, 2))
  const events = join(dir, 'events.jsonl')
  // CLAUDE_BIN runs another build, e.g. the Desktop app's bundled engine.
  const child = spawn(process.env.CLAUDE_BIN ?? 'claude', args, { cwd: repo, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const start = Date.now()
  const steps: StepRecord[] = []
  let sessionId: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const send = () => {
    const text = s.steps[steps.length]
    steps.push({ step: text, sentAt: Date.now() - start })
    clearTimeout(timer)
    timer = setTimeout(() => child.kill(), STEP_TIMEOUT_MS)
    child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`)
  }

  return new Promise<{ code: number | null; sessionId?: string; steps: StepRecord[]; wallMs: number }>(done => {
    let buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (!line.trim()) continue
        const t = Date.now() - start
        let event: Record<string, unknown>
        try {
          event = JSON.parse(line)
        } catch {
          appendFileSync(events, `${JSON.stringify({ t, raw: line })}\n`)
          continue
        }
        appendFileSync(events, `${JSON.stringify({ t, ...event })}\n`)
        if (event.type === 'system' && event.subtype === 'init') sessionId = event.session_id as string
        if (event.type === 'result') {
          const current = steps[steps.length - 1]
          const { duration_ms, duration_api_ms, num_turns, total_cost_usd, usage, modelUsage, is_error, subtype } = event
          Object.assign(current, { resultAt: t, wallMs: t - current.sentAt, result: { duration_ms, duration_api_ms, num_turns, total_cost_usd, usage, modelUsage, is_error, subtype } })
          if (steps.length < s.steps.length) send()
          else child.stdin.end()
        }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => appendFileSync(join(dir, 'stderr.txt'), chunk))
    child.on('close', code => {
      clearTimeout(timer)
      done({ code, sessionId, steps, wallMs: Date.now() - start })
    })
    send()
  })
}

// Bun lists failures by name but, outside a terminal, only counts the passes.
function testResults(output: string) {
  const count = (kind: string) => Number(output.match(new RegExp(`^\\s*(\\d+) ${kind}$`, 'm'))?.[1] ?? 0)
  const failed = [...output.matchAll(/^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/gm)].map(m => m[1])
  return { pass: count('pass'), fail: count('fail'), failed }
}

function grade(s: Scenario, repo: string) {
  const visibleRun = spawnSync('bun', ['test', './tests'],{ cwd: repo, encoding: 'utf8' })
  const visible = testResults(`${visibleRun.stdout}\n${visibleRun.stderr}`)
  if (!s.hidden) return { visible }
  // Flat, so each test's '../src' import resolves. Test file names differ across folders.
  for (const folder of [s.hidden].flat()) cpSync(join(HERE, 'hidden', folder), join(repo, 'hidden-tests'), { recursive: true })
  const hiddenRun = spawnSync('bun', ['test', './hidden-tests'], { cwd: repo, encoding: 'utf8' })
  const hidden = testResults(`${hiddenRun.stdout}\n${hiddenRun.stderr}`)
  return { visible, hidden, passed: hidden.fail === 0 && hidden.pass > 0 }
}

async function runOne(s: Scenario, arm: Arm, repeat: number) {
  const dir = join(outRoot, stamp, s.name, `${arm.name}-${repeat}`)
  const repo = join(dir, 'repo')
  mkdirSync(dir, { recursive: true })
  cpSync(join(HERE, 'fixtures', s.fixture), repo, { recursive: true })
  for (const overlay of [s.overlay ?? [], arm.overlay ?? []].flat()) cpSync(join(HERE, 'overlays', overlay), repo, { recursive: true })
  git(repo, 'init', '-q')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'fixture')

  const otelFile = join(dir, 'otel.jsonl')
  const collector = startCollector(otelFile)
  const session = await runSession(s, arm, repo, dir, collector.port as number)
  await Bun.sleep(4000) // the last OTel batch
  collector.stop(true)

  const ledger = session.sessionId && join(homedir(), '.claude', 'effort-router', 'spend', `${session.sessionId}.json`)
  if (ledger && existsSync(ledger)) copyFileSync(ledger, join(dir, 'ledger.json'))
  git(repo, 'add', '-A')
  writeFileSync(join(dir, 'diff.patch'), git(repo, 'diff', '--cached').stdout)
  const result = grade(s, repo)

  const record = { scenario: s.name, model: s.model, arm, repeat, ...session, grade: result }
  writeFileSync(join(dir, 'run.json'), JSON.stringify(record, null, 2))
  const cost = session.steps.reduce((sum, step) => sum + Number(step.result?.total_cost_usd ?? 0), 0)
  console.log(`${s.name} ${arm.name}-${repeat}: exit ${session.code}, ${(session.wallMs / 1000).toFixed(1)}s, $${cost.toFixed(3)}, ${'passed' in result ? (result.passed ? 'PASS' : `FAIL ${result.hidden?.failed.join('; ')}`) : 'no hidden tests'}`)
}

for (let repeat = 1; repeat <= repeats; repeat++) {
  if (process.argv.includes('--serial')) for (const arm of arms) await runOne(scenario, arm, repeat)
  else await Promise.all(arms.map(arm => runOne(scenario, arm, repeat)))
}
console.log(`Runs in ${join(outRoot, stamp, scenario.name)}`)
