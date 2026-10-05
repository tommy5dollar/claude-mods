// Cheap probe of where the router sends a prompt: a real `claude -p` session with the router on, cut off after one
// model request (--max-turns 1). The first request's OTel record says the level it went out at, and the ledger says
// why. Costs the router's read plus one request per prompt, not a whole run.
//
//   bun eval/scenarios/probe.ts [--model claude-opus-5-5] [--effort medium] [--overlay fees] [--prompts file] [--times n] [--router dir]
// --router runs a copy of the router (a snapshot taken before an edit, say) instead of this checkout.
import { spawn } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const HERE = import.meta.dir
const ROUTER = resolve(process.argv.includes('--router') ? process.argv[process.argv.indexOf('--router') + 1]! : resolve(HERE, '../..'))
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const model = flag('model') ?? 'claude-opus-5-5'
const effort = flag('effort') ?? 'medium'
const overlays = (flag('overlay') ?? 'fees').split(',').filter(Boolean)
const out = join('D:/code/misc/claude-mods/evals/probes', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19))

const times = Number(flag('times') ?? 1)
const prompts = readFileSync(flag('prompts') ?? join(HERE, 'probe-prompts.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .flatMap(p => Array<string>(times).fill(p))

function cleanEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(CLAUDE|ANTHROPIC|OTEL)/.test(k)) env[k] = v
  return { ...env, ...extra }
}

async function probe(prompt: string, i: number) {
  const dir = join(out, String(i + 1))
  const repo = join(dir, 'repo')
  mkdirSync(dir, { recursive: true })
  cpSync(join(HERE, 'fixtures', 'payouts'), repo, { recursive: true })
  for (const o of overlays) cpSync(join(HERE, 'overlays', o), repo, { recursive: true })
  const otel = join(dir, 'otel.jsonl')
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      if (req.method === 'POST') appendFileSync(otel, `${await req.text()}\n`)
      return new Response('{}')
    },
  })
  const args = ['-p', prompt, '--output-format', 'json', '--model', model, '--effort', effort, '--setting-sources', 'project', '--strict-mcp-config',
    '--dangerously-skip-permissions', '--max-turns', '1', '--plugin-dir', ROUTER]
  const env = cleanEnv({ CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_LOGS_EXPORTER: 'otlp', OTEL_METRICS_EXPORTER: 'none',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json', OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${server.port}`, OTEL_LOGS_EXPORT_INTERVAL: '1000' })
  const stdout = await new Promise<string>(done => {
    let text = ''
    const child = spawn('claude', args, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', c => (text += c))
    child.on('close', () => done(text))
  })
  await Bun.sleep(3000)
  server.stop(true)
  let session: string | undefined
  try {
    session = JSON.parse(stdout).session_id
  } catch {}
  const ledgerFile = session && join(homedir(), '.claude', 'effort-router', 'spend', `${session}.json`)
  const verdict = ledgerFile && existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')).verdicts?.[0] : undefined
  const sent = existsSync(otel) ? /"key":"effort","value":\{"stringValue":"(\w+)"/.exec(readFileSync(otel, 'utf8'))?.[1] : undefined
  return { i: i + 1, sent, level: verdict?.level, outcome: verdict?.outcome, reason: verdict?.reason, why: verdict?.why, prompt }
}

const results = []
for (let i = 0; i < prompts.length; i += 4) results.push(...(await Promise.all(prompts.slice(i, i + 4).map((p, j) => probe(p, i + j)))))
console.log(`${model} from ${effort}, ${out}\n`)
for (const r of results) console.log(`${r.i}. sent ${r.sent} | picked ${r.level} (${r.outcome}) ${r.reason}\n   ${r.prompt.slice(0, 110)}\n   why: ${String(r.why ?? '').slice(0, 220)}`)
