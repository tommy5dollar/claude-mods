// Integration tests under the engine's own kit: `claude plugin test .`
import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const FOOTER = { component: 'SessionMode', props: { modes: [] } } as const

const QUESTIONS = {
  questions: [
    { question: 'Which platforms?', header: 'Platforms', options: [{ label: 'Xero', description: '' }, { label: 'QuickBooks', description: '' }], multiSelect: true },
    { question: 'What is it for?', header: 'Purpose', options: [{ label: 'Month-end close', description: '' }, { label: 'Live dashboard', description: '' }], multiSelect: false },
  ],
}
const ANSWERS = 'User has answered your questions: "Which platforms?"="Xero, QuickBooks", "What is it for?"="Month-end close". You can now continue.'

const BUG_REPLY = '{"decision":"lock","level":"high","confidence":0.9,"reason":"bug fix in existing code"}'
const SEARCH_REPLY = '{"decision":"lock","level":"low","confidence":0.9,"reason":"codebase search"}'

type World = {
  sent: (string | number | undefined)[]
  efforts: string[]
  lines: string[]
  debug: string[]
  classifierCalls: number
  reply: string
  messages: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[]
  prompts: string[]
  toasts: string[]
  clock: MockClock
  /** classifierCalls as the beneath prompt.submit saw them (after the plugin's hook ran). */
  callsAtSubmit: number[]
  /** What a subagent's read answers (a fork of its parent, or a separate call whose prompt starts `Agent type:`); THROW and HANG as for `reply`. */
  subagentReply: string
  /** Subagent reads: their system and user prompts. */
  subagentReads: { system: string; prompt: string }[]
  /** Spawns that reached the engine, as the plugin passed them on. */
  spawned: Record<string, unknown>[]
  /** Set: the engine refuses spawns with this reason. */
  denySpawn?: string
  /** Files `$.fs` sees, by path with forward slashes (backslashes are folded). */
  files: Record<string, string>
  /** Files `$.fs.read` finds by the end of their path (the plugin's own, whose root the kit does not give). */
  endingIn: Record<string, string>
  /**
   * How the person answers the router's own question (`$.ui.ask`, header
   * Effort): USE the first option, KEEP the second, DISMISS it (the engine
   * rejects, as it does in -p), or GATE (wait until the test calls release).
   */
  answer: 'USE' | 'MIDDLE' | 'KEEP' | 'DISMISS' | 'GATE'
  /** The router's questions as asked: text and option labels. */
  asked: { text: string; options: string[] }[]
  /** Set: every model request reports this many output tokens (otherwise no usage). */
  usage?: number
  /** Paths `$.fs.write` wrote, in order. */
  written: string[]
  /** Answers a GATE question with USE, KEEP or DISMISS. */
  release?: (answer: 'USE' | 'KEEP' | 'DISMISS') => void
  /** The session's model, as `$.session.model()` answers. */
  model: string
  /** Set: `$.model.fork` answers with `reply` (otherwise there is nothing to fork). */
  forkable: boolean
  /** Forks made: their prompts. */
  forks: string[]
  /** Separate checks made: their model and whether they carried effort. */
  completes: { model: string; effort?: string; prompt: string }[]
}

const AUTO = { EFFORT_ROUTER_CONSENT: 'auto' }

/** `$.fs` paths with forward slashes and no drive (the kit resolves `/repo` to `D:\repo` on Windows). */
const slashed = (path: string): string => path.replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '/')

/** Answers every `$` call the mod makes, beneath it. */
// Most tests exercise the question card, so the world runs under consent ask unless a test passes its own env
// (AUTO, or {} with DEFAULT_CONSENT for the plugin's own default, auto).
const ASK = { EFFORT_ROUTER_CONSENT: 'ask' }
const DEFAULT_CONSENT = {}

function worldOf(on: On, reply = BUG_REPLY, sources: Record<string, unknown> = {}, env: Record<string, string> = ASK): World {
  const clock = mock.clock(on)
  const world: World = {
    sent: [], efforts: [], lines: [], debug: [], classifierCalls: 0, reply, messages: [], prompts: [], toasts: [], clock, callsAtSubmit: [],
    subagentReply: SEARCH_REPLY, subagentReads: [], spawned: [], files: {}, endingIn: {}, answer: 'USE', asked: [], written: [],
    model: 'claude-sonnet-5-5', forkable: false, forks: [], completes: [],
  }
  mock.store(on)
  mock.env(on, env)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({ value: world.messages as never }))
  on('session.model', () => ({ value: world.model }))
  on('model.fork', async ($, e) => {
    if (e.prompt.includes('do not start the subagent yourself')) {
      world.subagentReads.push({ system: '', prompt: e.prompt })
      if (world.subagentReply === 'THROW') throw new Error('boom')
      if (world.subagentReply === 'HANG') await clock.sleep(60_000)
      return { value: { isAnswered: true, text: world.subagentReply, usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } } }
    }
    if (!world.forkable) return { value: { isAnswered: false, reason: 'nothing-to-fork' } as never }
    world.forks.push(e.prompt)
    world.classifierCalls += 1
    world.prompts.push(e.prompt)
    if (world.reply === 'THROW') throw new Error('boom')
    return { value: { isAnswered: true, text: world.reply, usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.read', ($, e) => {
    const path = slashed(e.path)
    const text = world.files[path] ?? Object.entries(world.endingIn).find(([end]) => path.endsWith(end))?.[1]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', ($, e) => {
    world.files[slashed(e.path)] = e.text
    world.written.push(slashed(e.path))
    return { value: undefined }
  })
  on('fs.list', ($, e) => {
    const dir = `${slashed(e.path).replace(/\/$/, '')}/`
    const names = Object.keys(world.files).filter(path => path.startsWith(dir) && !path.slice(dir.length).includes('/'))
    if (names.length === 0) return { deny: 'ENOENT' }
    return { value: names.map(path => ({ name: path.slice(dir.length), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('model.complete', async ($, e) => {
    const subagent = e.prompt.startsWith('Agent type:')
    const reply = subagent ? world.subagentReply : world.reply
    if (subagent) world.subagentReads.push({ system: e.system ?? '', prompt: e.prompt })
    else {
      world.classifierCalls += 1
      world.prompts.push(e.prompt)
      world.completes.push({ model: e.model, ...(e.effort ? { effort: String(e.effort) } : {}), prompt: e.prompt })
    }
    if (reply === 'THROW') throw new Error('boom')
    if (reply === 'HANG') {
      await clock.sleep(60_000)
      return { value: { isAnswered: true, text: BUG_REPLY, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
    }
    return { value: { isAnswered: true, text: reply, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  on('command.run', { command: 'effort' }, ($, e) => {
    world.efforts.push(e.args)
    return { text: `Set effort level to ${e.args}` }
  })
  on('ui.log', ($, e) => {
    ;(e.to === 'debug' ? world.debug : world.lines).push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ children: [] }))
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.step', async function* ($, e) {
    world.sent.push(e.effort)
    const usage = world.usage === undefined ? null : { input_tokens: 10, output_tokens: world.usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: e.model }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.context', ($, e) => ({ blocks: e.blocks }))
  on('agent.spawn', ($, e) => {
    if (world.denySpawn) return { deny: world.denySpawn }
    world.spawned.push({ ...e })
    return { model: 'claude-sonnet-5-5', agentId: `agent-${world.spawned.length}` }
  })
  on('settings.read', ($, e) => ({ value: (e.source ? sources[e.source] ?? {} : { effortLevel: 'medium' }) as never }))
  on('prompt.submit', ($, e) => {
    world.callsAtSubmit.push(world.classifierCalls)
    return { text: e.text }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e) => {
    const first = (e.questions as unknown as { question: string; header?: string; options: { label: string }[] }[])[0]
    if (first?.header !== 'Effort') return { result: { questions: QUESTIONS.questions, answers: {} }, text: ANSWERS } as never
    const options = first.options.map(o => o.label)
    world.asked.push({ text: first.question, options })
    let answer: string = world.answer
    if (answer === 'GATE') answer = await new Promise<string>(resolve => (world.release = resolve))
    if (answer === 'DISMISS') return { deny: 'the user dismissed the question' } as never
    const label = answer === 'USE' ? options[0] : answer === 'MIDDLE' ? options[1] : options[options.length - 1]
    return { result: { questions: e.questions, answers: { [first.question]: label } }, text: `User has answered your questions: "${first.question}"="${label}". You can now continue.` } as never
  })
  return world
}

type Mounted = {
  find: (q: Record<string, unknown>) => Promise<{ type: string; props: Record<string, unknown>; text: string } | undefined>
  findAll: (q: Record<string, unknown>) => Promise<{ type: string; props: Record<string, unknown>; text: string }[]>
}

/** The footer button: its element type and label. */
async function footerOf(footer: Mounted) {
  const found = await footer.find({ key: 'route-state' })
  return { type: found?.type, shown: found?.props.label as string | undefined, text: found?.text }
}

/** The router's band: its headline (undefined when not drawn) and button labels. */
async function bandOf(band: Mounted) {
  const headline = (await band.find({ type: 'Text', text: /^Effort router: / }))?.text
  const buttons = (await band.findAll({ type: 'Button' })).map(b => b.props.label as string)
  return { headline, buttons }
}

/** One model request; `effort` is the engine's level for it (the picker's, on the main thread). */
async function step($: Engine, index: number, agentId?: string, effort: 'low' | 'medium' | 'high' | 'xhigh' = 'medium', model = 'claude-sonnet-5-5'): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index, model, effort, messageCount: 3, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // drain
  }
}

async function submit($: Engine, text: string): Promise<void> {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
}

/** Spawns a subagent; resolves with its agentId once the plugin's hook let it start. */
async function spawn($: Engine, input: { prompt: string; description?: string; subagentType?: string; fork?: boolean; parentAgentId?: string }): Promise<string | undefined> {
  const result = await $.agent.spawn({
    tool_use_id: 'tu-1',
    description: 'a task',
    subagentType: 'general-purpose',
    parentModel: 'claude-sonnet-5-5',
    background: true,
    fork: false,
    ...input,
  } as never)
  return result.agentId
}

async function route($: Engine, args = ''): Promise<string> {
  return (await $.command.run({ command: 'route', args } as never)).text ?? ''
}

const STARTED = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

/** Lets anything left running settle. */
async function settle(_: Engine): Promise<void> {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

describe('effort-router', () => {
  // --- the rule on the main thread (consent ask, the default) -------------------------

  test('undecided: the turn goes ahead at the picker level, no question', async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    await submit($, 'hi, just looking around')
    expect(world.callsAtSubmit).toEqual([1]) // the read finished before prompt.submit went on
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(world.asked).toEqual([])
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('undecided')
  })

  test("the picker's level: the turn goes ahead, no question, locked there; reading stops", async ($, on) => {
    const world = worldOf(on, '{"decision":"lock","level":"medium","confidence":0.9,"reason":"regular feature work"}')
    await $.session.start(STARTED)
    await submit($, 'add a dark mode toggle')
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(world.asked).toEqual([])
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('using medium')
    expect(world.lines).toContain('Effort router: medium for the rest of this session (regular feature work).')
    await submit($, 'and the settings page too')
    expect(world.classifierCalls).toBe(1)
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.efforts).toEqual([]) // already the picker's level: nothing to sync
  })

  test('a different level holds the request on the question; Use locks the router level, then reading stops', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'the checkout total is wrong when a coupon expires mid-session, fix it')
    expect(world.sent).toEqual([]) // nothing asked or sent yet: the verdict waits for the request
    await step($, 0)
    expect(world.asked).toEqual([{ text: 'Effort router: Bug fix in existing code. Use high effort instead of medium?', options: ['Use high', 'Keep medium'] }])
    expect(world.sent).toEqual(['high']) // the request went out after the answer, at the chosen level
    await step($, 1)
    expect(world.sent).toEqual(['high', 'high'])
    expect(world.asked).toHaveLength(1)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('using high')
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.efforts).toEqual(['high']) // the terminal picker is synced when idle
    await submit($, 'now add a test for it')
    expect(world.classifierCalls).toBe(1)
  })

  test("Keep locks the picker's level: the request goes out unchanged, and reading stops", async ($, on) => {
    const world = worldOf(on)
    world.answer = 'KEEP'
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    await step($, 1)
    expect(world.sent).toEqual(['medium', 'medium'])
    expect(await route($, 'status')).toStartWith('Using medium for this session (your choice).')
    await submit($, 'and the lexer')
    expect(world.classifierCalls).toBe(1)
  })

  test('the footer reads high? while the question is open, and the request waits for the answer', async ($, on) => {
    const world = worldOf(on)
    world.answer = 'GATE'
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    const stepping = step($, 0)
    await settle($)
    expect(world.asked).toHaveLength(1)
    expect(world.sent).toEqual([]) // held
    expect((await footerOf(footer)).shown).toBe('high?')
    expect(await route($, 'status')).toStartWith('high? Waiting for your answer: use high effort instead of medium')
    world.release?.('USE')
    await stepping
    expect(world.sent).toEqual(['high'])
    expect((await footerOf(footer)).shown).toBe('using high')
  })

  test('dismissed: this request goes at the picker level, the router stays deciding, and the next read can ask again', async ($, on) => {
    const world = worldOf(on)
    world.answer = 'DISMISS'
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    await step($, 1)
    expect(world.sent).toEqual(['medium', 'medium'])
    expect(world.asked).toHaveLength(1) // one question per verdict
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('undecided')

    world.answer = 'USE'
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await submit($, 'it is in the tokenizer')
    expect(world.classifierCalls).toBe(2)
    await step($, 0)
    expect(world.asked).toHaveLength(2)
    expect(world.sent.at(-1)).toBe('high')
  })

  test('-p: no one to answer, so the question rejects and the request goes at the picker level; /effort never runs', async ($, on) => {
    const world = worldOf(on)
    world.answer = 'DISMISS'
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.sent).toEqual(['medium'])
    expect(world.efforts).toEqual([])
    expect(await route($, 'status')).toStartWith('Deciding.')
  })

  test('answered AskUserQuestion questions (checks on another model): read before the answers return, then asked at the next request (a later index)', { options: { decideWithin: 3, classifierModel: 'opus' } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    world.messages = [{ role: 'user', text: 'pull latest code', toolUses: [] }]
    await submit($, 'implement for me a new finance solution pulling from multiple accountancy platforms')
    await step($, 0)
    expect(world.asked).toEqual([])

    world.messages = [
      { role: 'user', text: 'pull latest code', toolUses: [] },
      { role: 'user', text: 'implement for me a new finance solution pulling from multiple accountancy platforms', toolUses: [] },
      { role: 'assistant', text: 'A couple of questions first.', toolUses: [{ tool: 'AskUserQuestion', tool_use_id: 'q1', input: QUESTIONS } as never] },
    ]
    world.reply = '{"decision":"lock","level":"high","confidence":0.9,"reason":"multi-platform finance integration"}'
    await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', ...QUESTIONS } as never)
    expect(world.classifierCalls).toBe(2) // awaited: done when the tool result came back
    const prompt = world.prompts.at(-1) ?? ''
    expect(prompt).toContain('ASSISTANT asked: Which platforms? [options: Xero | QuickBooks]')
    expect(prompt).toContain('USER answered: User has answered your questions: "Which platforms?"="Xero, QuickBooks"')
    await step($, 3)
    expect(world.asked).toEqual([{ text: 'Effort router: Multi-platform finance integration. Use high effort instead of medium?', options: ['Use high', 'Keep medium'] }])
    expect(world.sent).toEqual(['medium', 'high'])

    await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q2', agentId: 'agent-1', ...QUESTIONS } as never)
    expect(world.classifierCalls).toBe(2) // a subagent's question is not the user's turn

    const status = await route($, 'status')
    expect(status).toContain("It acts once a check is at least 70% sure. If that level isn't your setting, it asks you first (consent: ask).")
    expect(status).toMatch(/Checks this session: 2, on Opus 5\.5\./)
    expect(world.completes.map(c => c.model)).toEqual(['opus', 'opus'])
    expect(status).toMatch(/Last check \(after answered questions, \d+s ago, took [\d.]+s\): high, 90% sure \(multi-platform finance integration\)\./)
  })

  test('a verdict waiting when the budget runs out is still asked; dismissed, the router then turns off', { options: { decideWithin: 1 } }, async ($, on) => {
    const world = worldOf(on)
    world.answer = 'DISMISS'
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.asked).toHaveLength(1)
    expect(await route($, 'status')).toContain('Off (no clear task after 1 prompt)')
  })

  // --- /route and the band --------------------------------------------------------------

  test('/route asks from the command when the verdict differs, and locks the answer', async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    await submit($, 'hi')
    await step($, 0)
    world.messages = [{ role: 'user', text: 'fix the crash in the parser', toolUses: [] }]
    world.reply = BUG_REPLY
    expect(await route($)).toBe('Changed from medium to high for this session.')
    expect(world.asked).toEqual([{ text: 'Effort router: Bug fix in existing code. Use high effort instead of medium?', options: ['Use high', 'Keep medium'] }])
    await step($, 1)
    expect(world.sent.at(-1)).toBe('high')
  })

  test('/route while locked: asked against the locked level, and Keep keeps it', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0) // Use high: locked at high; the request arrived at medium (the picker)
    await step($, 1)
    expect(world.sent).toEqual(['high', 'high'])
    world.reply = '{"decision":"lock","level":"low","confidence":0.9,"reason":"quick follow-up"}'
    world.answer = 'KEEP'
    expect(await route($, 'keep it quick')).toBe('high for this session.')
    expect(world.asked.at(-1)).toEqual({ text: 'Effort router: Quick follow-up. Use low effort instead of high?', options: ['Use low', 'Use medium', 'Keep high'] })
    await step($, 2)
    expect(world.sent.at(-1)).toBe('high')
  })

  test("the check's why: kept with the level, shown in /route status and the band", async ($, on) => {
    const world = worldOf(on, '{"decision":"level","level":"high","confidence":0.9,"reason":"bug fix in existing code","why":"The crash needs tracing through the parser, but the fix is local."}')
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(await route($, 'status')).toStartWith('Using high for this session (bug fix in existing code). The crash needs tracing through the parser, but the fix is local.')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    await footer.press({ key: 'route-state' })
    expect((await bandOf(band)).headline).toBe('Effort router: using high for this session (bug fix in existing code). The crash needs tracing through the parser, but the fix is local.')
  })

  test('a jump of two levels offers the one in between too, and choosing it locks there', async ($, on) => {
    const world = worldOf(on, '{"decision":"lock","level":"xhigh","confidence":0.9,"reason":"tricky migration"}')
    await $.session.start(STARTED)
    world.answer = 'MIDDLE'
    await submit($, 'migrate the ledger to the new schema, it is really tricky')
    await step($, 0)
    expect(world.asked).toEqual([{ text: 'Effort router: Tricky migration. Use xhigh effort instead of medium?', options: ['Use xhigh', 'Use high', 'Keep medium'] }])
    await step($, 1)
    expect(world.sent).toEqual(['high', 'high'])
    expect(await route($, 'status')).toContain('Using high')
    world.messages = [{ role: 'user', text: 'actually just fix the typo in the error message', toolUses: [] }]
    world.reply = '{"decision":"lock","level":"low","confidence":0.9,"reason":"typo fix"}'
    expect(await route($)).toBe('Changed from high to medium for this session.') // asked low, medium or keep high; chose the middle
    expect(world.asked.at(-1)?.options).toEqual(['Use low', 'Use medium', 'Keep high'])
  })

  test('/route with the same level as in use changes nothing; the picker level while locked elsewhere locks there', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0) // locked high
    world.messages = [{ role: 'user', text: 'fix the crash in the parser', toolUses: [] }]
    expect(await route($)).toBe('high still fits (bug fix in existing code, 90% sure). Nothing changed.')
    expect(world.asked).toHaveLength(1)
    world.reply = '{"decision":"lock","level":"medium","confidence":0.9,"reason":"regular feature work"}'
    expect(await route($)).toBe('Changed from high back to medium, your setting, for this session (regular feature work, 90% sure).')
    expect(world.asked).toHaveLength(1)
  })

  test('manual /route with a hint: reaches the classifier prompt, ignores the budget, works when off', { options: { decideWithin: 1 } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    await submit($, 'hi')
    expect(await route($, 'status')).toContain('Off (no clear task after 1 prompt)')

    expect(await route($, 'not sure yet')).toContain('No clear task yet, even with your hint')
    expect(await route($, 'status')).toStartWith('Off')

    world.reply = '{"decision":"lock","level":"max","confidence":0.9,"reason":"security review"}'
    expect(await route($, 'this is a security review')).toBe('Changed from medium to xhigh for this session.') // held to highestLevel
    expect(world.prompts.at(-1)).toContain('<user_hint>\nthis is a security review\n</user_hint>')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('using xhigh')
  })

  test('highestLevel max lets the router pick max; never Haiku as the check model', { options: { highestLevel: 'max', classifierModel: 'haiku' } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"lock","level":"max","confidence":0.9,"reason":"security review"}', {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'find and fix every vulnerability in the auth service, I am away all day')
    expect(world.completes.map(c => c.model)).toEqual(['claude-sonnet-5-5']) // haiku is ignored: the session's model checks
    await step($, 0)
    expect(world.sent).toEqual(['max'])
  })

  test('Check now from the band: a check that changes nothing says so in the band', async ($, on) => {
    worldOf(on, '{"decision":"undecided"}')
    await $.session.start({ ...STARTED, surface: 'desktop' })
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...BAND } as never)
    await footer.press({ key: 'route-state' })
    await band.press({ key: 'suggest' })
    await settle($)
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: No clear task yet. Nothing changed.', buttons: ['Hide'] })
    expect((await footerOf(footer)).shown).toBe('undecided')
    await footer.press({ key: 'route-state' }) // the footer closes it too
    expect((await bandOf(band)).headline).toBeUndefined()
  })

  test("footer: a plain button that opens the band with the state's actions; Check now asks", async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ ...STARTED, surface: 'desktop' })
    world.messages = [{ role: 'user', text: 'fix the crash in the parser', toolUses: [] }]
    for (const surface of ['terminal', 'desktop'] as const) {
      const footer = await $.ui.mount({ plugin: 'effort-router', surface, ...FOOTER } as never)
      const state = await footerOf(footer)
      expect(state.type).toBe('Button')
      expect(state.shown).toBe('undecided')
      expect(await footer.find({ type: 'Select' })).toBeUndefined()
      await footer.unmount()
    }
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...BAND } as never)
    expect((await bandOf(band)).headline).toBeUndefined()

    await footer.press({ key: 'route-state' })
    expect(await bandOf(band)).toMatchObject({ buttons: ['Assess now', 'Stop routing (back to medium)', 'Hide'] })
    expect((await bandOf(band)).headline).toBe('Effort router: undecided. Your effort setting applies until the task is clear.')
    await footer.press({ key: 'route-state' })
    expect((await bandOf(band)).headline).toBeUndefined()

    await footer.press({ key: 'route-state' })
    await band.press({ key: 'suggest' })
    await settle($)
    expect(world.asked).toHaveLength(1)
    // the band reopens with what the check found, and Close takes it away
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: Changed from medium to high for this session.', buttons: ['Hide'] })
    await band.press({ key: 'close' })
    expect((await bandOf(band)).headline).toBeUndefined()
    expect((await footerOf(footer)).shown).toBe('using high')
    await footer.press({ key: 'route-state' })
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: using high for this session (bug fix in existing code).', buttons: ['Reassess now', 'Reassess with my next prompt', 'Stop routing (back to medium)', 'Hide'] })

    await band.press({ key: 'off' })
    await step($, 0)
    expect(world.sent.at(-1)).toBe('medium')
    expect((await footerOf(footer)).shown).toBe('off')
    await footer.press({ key: 'route-state' })
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: off. Your effort setting applies.', buttons: ['Start routing', 'Hide'] })
    await band.press({ key: 'on' })
    expect((await footerOf(footer)).shown).toBe('undecided')
  })

  test('footerControl: label draws plain text', { options: { footerControl: 'label' } }, async ($, on) => {
    worldOf(on)
    await $.session.start({ ...STARTED, surface: 'desktop' })
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    expect(await footer.find({ type: 'Button' })).toBeUndefined()
    expect((await footer.find({ text: /undecided/ }))?.text).toBe('undecided')
  })

  // --- consent auto -----------------------------------------------------------------------

  test('auto: locked at once without a question; the band says what changed, with OK first and Stop routing', async ($, on) => {
    const world = worldOf(on, BUG_REPLY, {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    expect(world.asked).toEqual([])
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: changed from medium to high for this session (bug fix in existing code, 90% sure medium was too low).', buttons: ['OK', 'Stop routing (back to medium)'] })
    await band.press({ key: 'revert' })
    expect((await bandOf(band)).headline).toBeUndefined()
    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('off')
  })

  test("auto: the picker's level locks with no band; OK keeps the change", async ($, on) => {
    const world = worldOf(on, '{"decision":"lock","level":"medium","confidence":0.9,"reason":"regular feature work"}', {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'add a dark mode toggle')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect((await bandOf(band)).headline).toBeUndefined()

    world.reply = BUG_REPLY
    world.messages = [{ role: 'user', text: 'fix the crash in the parser', toolUses: [] }]
    await route($, 'on') // already on: no change
    expect(await route($)).toBe('Changed from medium to high for this session (bug fix in existing code).') // /route under auto: locked without a question
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: changed from medium to high for this session (bug fix in existing code, 90% sure medium was too low).', buttons: ['OK', 'Stop routing (back to medium)'] })
    await band.press({ key: 'ok' })
    expect((await bandOf(band)).headline).toBeUndefined()
    await step($, 0)
    expect(world.sent).toEqual(['high'])
  })

  test('Reassess with my next prompt: back to deciding at your setting, and the next prompt is checked before its turn', async ($, on) => {
    const world = worldOf(on, BUG_REPLY, {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0) // high
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    await band.press({ key: 'ok' })
    await footer.press({ key: 'route-state' })
    await band.press({ key: 'next' })
    await settle($)
    expect((await footerOf(footer)).shown).toBe('undecided')
    world.reply = '{"decision":"level","level":"low","confidence":0.9,"reason":"one-line patch"}'
    await submit($, 'actually just patch the null check, nothing else')
    await step($, 1)
    expect(world.sent.at(-1)).toBe('low')
    expect(await route($, 'next')).toBe('The router will reassess with your next prompt. Until then your effort setting (medium) applies.')
  })

  test('a check torn between high and xhigh still moves off medium, to high; showChecks prints what it said', { options: { showChecks: true } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"level","levels":{"low":0.02,"medium":0.08,"high":0.5,"xhigh":0.4},"reason":"race condition fix"}', {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'two workers race on the ledger write, find and fix it')
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    // No request yet, so the picker's level is unknown: the prompt doesn't state one, and the spread is judged at the first request.
    expect(world.prompts.at(-1)).not.toContain('The session is at')
    expect(world.lines).toContain('Effort router: check 1 of 6: low 2%, medium 8%, high 50%, xhigh 40%. 90% sure medium is too low, so moving to high.')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect((await bandOf(band)).headline).toBe('Effort router: changed from medium to high for this session (race condition fix, 90% sure medium was too low).')
    expect(await route($, 'status')).toContain('Spread: low 2%, medium 8%, high 50%, xhigh 40%')
  })

  test("the first check is judged against the picker's level as the first request shows it, not the settings file's effortLevel", { options: { showChecks: true } }, async ($, on) => {
    // The settings file says medium (as worldOf's settings.read does); Desktop's picker is on xhigh.
    const world = worldOf(on, '{"decision":"level","levels":{"low":0.02,"medium":0.08,"high":0.6,"xhigh":0.3},"reason":"research-heavy ideation"}', {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'help me ideate demos for X, research my sessions and the web')
    await step($, 0, undefined, 'xhigh')
    expect(world.sent).toEqual(['high'])
    expect(world.lines).toContain('Effort router: check 1 of 6: low 2%, medium 8%, high 60%, xhigh 30%. 70% sure xhigh is too high, so moving to high.')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    const shown = await bandOf(band)
    expect(shown.headline).toContain('changed from xhigh to high')
    expect(shown.headline).not.toContain('medium')
  })

  test('a first check below the bar against the picker as the first request shows it changes nothing', { options: { showChecks: true } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"level","levels":{"medium":0.2,"high":0.45,"xhigh":0.35},"reason":"ideation"}', {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'help me ideate demos for X')
    await step($, 0, undefined, 'xhigh')
    expect(world.sent).toEqual(['xhigh'])
    expect(world.lines).toContain('Effort router: check 1 of 6: medium 20%, high 45%, xhigh 35%. 65% sure xhigh is too high, below the 70% bar, so staying on xhigh.')
  })

  test('changing the effort yourself after the router locked a level stops routing, and your level is used', async ($, on) => {
    const world = worldOf(on, '{"decision":"level","levels":{"low":0.85,"medium":0.15},"reason":"coin a term"}', {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'help me coin a term')
    await step($, 0, undefined, 'xhigh')
    expect(world.sent).toEqual(['low'])
    await step($, 1, undefined, 'xhigh') // the picker still says xhigh: the lock holds
    expect(world.sent).toEqual(['low', 'low'])
    await submit($, 'think longer and harder about it')
    await step($, 0, undefined, 'high') // the user moved the picker to high
    expect(world.sent).toEqual(['low', 'low', 'high'])
    expect(world.lines).toContain('Effort router: you changed the effort to high, so routing stopped for this session.')
    expect(await route($, 'status')).toContain('off')
  })

  test('a spread split between staying and moving up is below the bar, and stays', { options: { showChecks: true } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"level","levels":{"medium":0.45,"high":0.4,"xhigh":0.15},"reason":"feature work"}', {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'add pagination to the invoices list')
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(world.lines).toContain('Effort router: check 1 of 6: medium 45%, high 40%, xhigh 15%. 55% sure medium is too low, below the 70% bar, so staying on medium.')
  })

  test('auto: Reassess from a kept level says what it changed from, and Go back to restores that level', async ($, on) => {
    const world = worldOf(on, BUG_REPLY, {}, AUTO)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0) // high, from medium
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await band.press({ key: 'ok' })
    world.messages = [{ role: 'user', text: 'it is a race between two workers', toolUses: [] }]
    world.reply = '{"decision":"level","level":"xhigh","confidence":0.9,"reason":"concurrency bug"}'
    expect(await route($)).toBe('Changed from high to xhigh for this session (concurrency bug).')
    expect(await bandOf(band)).toEqual({
      headline: 'Effort router: changed from high to xhigh for this session (concurrency bug, 90% sure high was too low).',
      buttons: ['OK', 'Go back to high', 'Stop routing (back to medium)'],
    })
    await band.press({ key: 'previous' })
    expect((await bandOf(band)).headline).toBeUndefined()
    await step($, 1)
    expect(world.sent.at(-1)).toBe('high')
    expect(await route($, 'status')).toStartWith('Using high for this session (your choice).')
  })

  test('consent defaults to auto: a sure level is used without a question, and the band offers to stop routing', async ($, on) => {
    const world = worldOf(on, BUG_REPLY, {}, DEFAULT_CONSENT)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.asked).toEqual([])
    expect(world.sent).toEqual(['high'])
    expect(await route($, 'status')).toContain('it switches without asking (consent: auto).')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect((await bandOf(band)).buttons).toEqual(['OK', 'Stop routing (back to medium)'])
  })

  test('out of prompts with checks below the bar: the reason names the last check, not "no clear task"', { options: { decideWithin: 1 } }, async ($, on) => {
    worldOf(on, '{"decision":"level","level":"high","confidence":0.6,"reason":"tax advice"}')
    await $.session.start(STARTED)
    await submit($, 'work out the CGT base cost for the cottage')
    await step($, 0)
    expect(await route($, 'status')).toStartWith('Off (not sure enough after 1 prompt, last check high at 60%)')
  })

  test('EFFORT_ROUTER_CONSENT: the old names map to ask and auto', async ($, on) => {
    const world = worldOf(on, BUG_REPLY, {}, { EFFORT_ROUTER_CONSENT: 'apply' })
    await $.session.start(STARTED)
    expect(await route($, 'status')).toContain('it switches without asking (consent: auto).')
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    expect(world.asked).toEqual([])
  })

  test('EFFORT_ROUTER_CONSENT=band (the 0.5 confirm) means ask', async ($, on) => {
    const world = worldOf(on, BUG_REPLY, {}, { EFFORT_ROUTER_CONSENT: 'band' })
    await $.session.start(STARTED)
    expect(await route($, 'status')).toContain('it asks you first (consent: ask).')
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.asked).toHaveLength(1)
  })

  // --- reads, budget, existing sessions ------------------------------------------------------

  test('a classifier that does not answer within classifyTimeoutMs fails open', async ($, on) => {
    const world = worldOf(on, 'HANG')
    await $.session.start(STARTED)
    const submitting = submit($, 'fix the crash in the parser')
    await world.clock.advance(15000)
    await submitting
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(await route($, 'status')).toContain('the check timed out after 15000 ms, so the prompt ran at your setting')
    await world.clock.advance(60_000) // the late answer is ignored
    await settle($)
    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium')
    expect(world.asked).toEqual([])
  })

  test('nothing suggested within the budget: no more Haiku calls, the router turns off', { options: { decideWithin: 3 } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    for (const text of ['hi', 'pull the latest', 'look around']) await submit($, text)
    expect(world.classifierCalls).toBe(3)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('no decision')
    expect(await route($, 'status')).toContain('Off (no clear task after 3 prompts)')
    for (const text of ['more', 'and more']) await submit($, text)
    expect(world.classifierCalls).toBe(3)
  })

  test('an existing session past the budget is left off: no band, no Haiku calls; /route still works', async ($, on) => {
    const world = worldOf(on)
    world.messages = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `earlier prompt ${i}`, toolUses: [] }))
    await $.session.start(STARTED)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect(await footerOf(footer)).toMatchObject({ shown: 'off' })
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.classifierCalls).toBe(0)
    expect(world.asked).toEqual([])
    expect((await bandOf(band)).headline).toBeUndefined()
    expect(world.toasts).toEqual([])
    expect(await route($, 'status')).toStartWith('Off (session started before the router)')
    expect(await route($)).toBe('Changed from medium to high for this session.')
    expect(world.classifierCalls).toBe(1)
  })

  test('an existing session under the budget: its earlier prompts count', { options: { decideWithin: 3 } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    world.messages = [
      { role: 'user', text: 'pull the latest code', toolUses: [] },
      { role: 'user', text: "what's in here?", toolUses: [] },
    ]
    await $.session.start(STARTED)
    await submit($, 'hello')
    expect(world.classifierCalls).toBe(1)
    await submit($, 'hello again')
    expect(world.classifierCalls).toBe(1)
  })

  test('the transcript sent is capped by classifierMaxChars; status says how much was sent', { options: { classifierMaxChars: 2000 } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    world.messages = [{ role: 'user', text: 'THE ORIGINAL TASK', toolUses: [] }]
    for (let i = 0; i < 40; i++) world.messages.push({ role: 'assistant', text: `reply ${i} ${'y'.repeat(250)}`, toolUses: [] })
    await submit($, 'LATEST')
    const sent = world.prompts.at(-1) ?? ''
    expect(sent).toContain('USER: THE ORIGINAL TASK')
    expect(sent).toContain('USER: LATEST')
    expect(sent.length).toBeLessThan(2400)
    expect(await route($, 'status')).toMatch(/It read \d+ of the conversation's \d+ characters \(limit 2000\)\./)
  })

  test('status reports the last error; a throwing classifier fails open', async ($, on) => {
    const world = worldOf(on, 'THROW')
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    expect(world.classifierCalls).toBe(1)
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(await route($, 'status')).toMatch(/Last error \(\d+s ago\): \S/)
  })

  test('/route commands: status, off, on, rules; decide is bare /route; no level-setting', async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    world.messages = [{ role: 'user', text: 'hi', toolUses: [] }]
    expect(await route($, 'status')).toContain('Deciding.')
    expect(await route($, 'off')).toContain('Routing stopped')
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(await route($, 'on')).toContain('Routing started.')
    expect(await route($, 'on')).toContain('Already routing')
    const calls = world.classifierCalls
    expect(await route($, 'decide')).toContain('No clear task yet.')
    expect(world.classifierCalls).toBe(calls + 1)
    expect(await route($, 'rules')).toContain('  built-in defaults')
  })

  test('org layer: enforce is final; allowOff false hides Turn off and Revert; a spent budget idles as deciding', { options: { decideWithin: 1 } }, async ($, on) => {
    const sources = {
      policy: { pluginConfigs: { 'effort-router@tommy-mods': { options: { rules: '$defaults\nORG: payments code, never below high', rulesMode: 'enforce', allowOff: false } } } },
      user: { pluginConfigs: { 'effort-router': { options: { rules: 'USER REPLACES EVERYTHING' } } } },
    }
    const world = worldOf(on, '{"decision":"undecided"}', sources)
    await $.session.start(STARTED)
    const rules = await route($, 'rules')
    expect(rules).toContain('  + policy settings (managed)')
    expect(rules).toContain('ORG: payments code, never below high')
    expect(rules).not.toContain('USER REPLACES')
    expect(rules).toContain("organisation's rules are final")
    expect(await route($, 'off')).toContain('Your organisation keeps the router on.')
    expect(await route($, 'rules init')).toContain("routing rules are final")
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await footer.press({ key: 'route-state' })
    expect((await bandOf(band)).buttons).toEqual(['Assess now', 'Hide'])
    await band.press({ key: 'close' })

    await submit($, 'hi')
    await submit($, 'hello?')
    expect(world.classifierCalls).toBe(1)
    expect((await footerOf(footer)).shown).toBe('no decision')
    expect(await route($, 'status')).toContain('Stopped checking')
  })

  test('org allowOff false under auto: the band that opens by itself has no Revert', async ($, on) => {
    const sources = { policy: { effortRouter: { allowOff: false } } }
    worldOf(on, BUG_REPLY, sources, AUTO)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: changed from medium to high for this session (bug fix in existing code, 90% sure medium was too low).', buttons: ['OK'] })
  })

  test('without enforce, a user settings option layers over the org', async ($, on) => {
    const sources = {
      policy: { effortRouter: { rules: '$defaults\nORG' } },
      user: { pluginConfigs: { 'effort-router': { options: { rules: '$defaults\nUSER' } } } },
    }
    worldOf(on, BUG_REPLY, sources)
    await $.session.start(STARTED)
    const rules = await route($, 'rules')
    expect(rules).toMatch(/ORG\nUSER$/)
    expect(rules).toContain('  + user settings (pluginConfigs option)')
  })

  // --- checks on the session's model, confidence, models, size (0.10) -----------------------

  describe("checks on the session's model", () => {
    const done = ($: Engine) => $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    const INSTRUCTIONS = 'Contents of /repo/CLAUDE.md: payments code, always run the ledger tests.'

    test('the first prompt is a separate call on the session model with its instructions; later prompts fork the conversation', async ($, on) => {
      const world = worldOf(on, '{"decision":"undecided"}')
      await $.session.start(STARTED)
      await $.prompt.context({ blocks: [{ name: 'claudeMd', text: INSTRUCTIONS }, { name: 'currentDate', text: 'Today' }] } as never)
      await submit($, 'hi')
      expect(world.forks).toEqual([])
      expect(world.completes).toHaveLength(1)
      expect(world.completes[0]?.model).toBe('claude-sonnet-5-5')
      expect(world.completes[0]?.effort).toBeUndefined() // the model's own default effort
      expect(world.completes[0]?.prompt).toContain(`<instructions>\n${INSTRUCTIONS}\n</instructions>`)
      await step($, 0)
      await done($)

      world.forkable = true
      world.messages = [
        { role: 'user', text: 'hi', toolUses: [] },
        { role: 'assistant', text: 'Hello! What are we working on?', toolUses: [] },
      ]
      world.reply = BUG_REPLY
      await submit($, 'the checkout total is wrong when a coupon expires, fix it')
      expect(world.completes).toHaveLength(1)
      expect(world.forks).toHaveLength(1)
      const fork = world.forks[0] ?? ''
      expect(fork).toStartWith('Pause the task for a moment.')
      expect(fork).toContain('<last_reply>\nHello! What are we working on?\n</last_reply>')
      expect(fork).toContain('<new_message>\nthe checkout total is wrong when a coupon expires, fix it\n</new_message>')
      await step($, 0)
      expect(world.asked).toHaveLength(1)
      expect(await route($, 'status')).toContain("Checks this session: 2, on your session's model (Sonnet 5.5).")
    })

    test('firstCheckInstructions false: the first check reads only the prompt', { options: { firstCheckInstructions: false } }, async ($, on) => {
      const world = worldOf(on, '{"decision":"undecided"}')
      await $.session.start(STARTED)
      await $.prompt.context({ blocks: [{ name: 'claudeMd', text: INSTRUCTIONS }] } as never)
      await submit($, 'hi')
      expect(world.completes[0]?.prompt).not.toContain('<instructions>')
    })

    test('below the confidence bar: nothing asked or locked, and the next prompt is checked again', async ($, on) => {
      const world = worldOf(on, '{"decision":"level","level":"high","confidence":0.6,"reason":"bug fix in existing code"}')
      await $.session.start(STARTED)
      await submit($, 'something is off in checkout')
      await step($, 0)
      expect(world.asked).toEqual([])
      expect(world.sent).toEqual(['medium'])
      expect(await route($, 'status')).toStartWith('Deciding. The last check leaned high but was only 60% sure, so it checks again after your next prompt.')
      await done($)
      world.forkable = true
      world.reply = BUG_REPLY
      await submit($, 'the total is wrong when a coupon expires mid-session')
      await step($, 0)
      expect(world.asked).toHaveLength(1)
    })

    test('a confidence bar of 0 acts on any level, even one with no confidence', { options: { confidence: 0 } }, async ($, on) => {
      const world = worldOf(on, '{"decision":"level","level":"high","reason":"bug fix in existing code"}')
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      await step($, 0)
      expect(world.asked).toHaveLength(1)
    })

    test('a prompt sent while a turn runs is not checked (not tested live yet)', async ($, on) => {
      const world = worldOf(on, '{"decision":"undecided"}')
      await $.session.start(STARTED)
      await submit($, 'hi')
      await step($, 0)
      world.forkable = true
      await submit($, 'also, fix the parser')
      expect(world.classifierCalls).toBe(1)
      await done($)
      await submit($, 'fix the parser')
      expect(world.classifierCalls).toBe(2)
    })

    test('answered questions mid-turn are checked by a fork that carries the answers', async ($, on) => {
      const world = worldOf(on, '{"decision":"undecided"}')
      await $.session.start(STARTED)
      await submit($, 'build an invoice sync')
      await step($, 0)
      world.forkable = true
      world.reply = '{"decision":"level","level":"high","confidence":0.85,"reason":"multi-platform invoice sync"}'
      await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', ...QUESTIONS } as never)
      expect(world.forks).toHaveLength(1)
      expect(world.forks[0]).toContain(`<answers>\n${ANSWERS}\n</answers>`)
      await step($, 1)
      expect(world.asked).toHaveLength(1)
    })

    test('each verdict is recorded with its kind, model, confidence and what came of it', async ($, on) => {
      const world = worldOf(on, '{"decision":"level","level":"high","confidence":0.6,"reason":"bug fix"}', {}, { ...ASK, HOME: '/home/t', USERPROFILE: '/home/t' })
      await $.session.start(STARTED)
      await $.prompt.context({ blocks: [{ name: 'claudeMd', text: INSTRUCTIONS }] } as never)
      await submit($, 'something is off in checkout')
      await step($, 0)
      await done($)
      world.forkable = true
      world.reply = BUG_REPLY
      world.answer = 'KEEP'
      await submit($, 'the total is wrong when a coupon expires')
      await step($, 0)
      await done($)
      await settle($)
      const saved = JSON.parse(world.files['/home/t/.claude/effort-router/spend/session-1.json'] ?? '{}')
      const rows = (saved.verdicts as Record<string, unknown>[]).map(({ at: _, ...row }) => row)
      expect(rows).toEqual([
        { kind: 'first', model: 'claude-sonnet-5-5', prompt: 1, level: 'high', confidence: 0.6, reason: 'bug fix', outcome: 'below the bar', withInstructions: true },
        { kind: 'fork', model: 'claude-sonnet-5-5', prompt: 2, level: 'high', confidence: 0.9, reason: 'bug fix in existing code', outcome: 'asked: keep' },
      ])
    })

    test('on a model the router does not support it stands aside: no checks, no level applied, and it says why', async ($, on) => {
      const world = worldOf(on)
      world.model = 'claude-haiku-4-5-20251001'
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      expect(world.classifierCalls).toBe(0)
      const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
      expect((await footerOf(footer)).shown).toBe('off')
      expect(await route($, 'status')).toStartWith('Off on Haiku 4.5, so your effort setting (medium) applies. The router works with Fable 5.1, Opus 5.5 and Sonnet 5.5.')
      expect(await route($, 'on')).toBe("The router doesn't support Haiku 4.5, so your effort setting applies. It works with Fable 5.1, Opus 5.5 and Sonnet 5.5.")
      expect(await route($)).toContain("The router doesn't support Haiku 4.5")
    })

    test('a level locked on a supported model is not applied after /model switches to another', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      await step($, 0)
      await step($, 1, undefined, 'medium', 'claude-opus-4-8')
      await step($, 2)
      expect(world.sent).toEqual(['high', 'medium', 'high'])
    })

    test('the model notes for the session model go into the check', async ($, on) => {
      const world = worldOf(on, '{"decision":"undecided"}')
      world.model = 'claude-opus-5-5'
      await $.session.start(STARTED)
      world.endingIn['/rules/models/opus-5-5.md'] = '<!-- source -->\n- The default level is medium.'
      await submit($, 'hi')
      expect(world.completes[0]?.model).toBe('claude-opus-5-5')
      expect(world.prompts).toHaveLength(1)
      expect(await route($, 'rules')).toContain('On Opus 5.5:\n- The default level is medium.')
      expect(await route($, 'rules')).toMatch(/\+ notes on Opus 5\.5 \(.*opus-5-5\.md\)/)
    })

    test('a session first seen with a long conversation is left alone', { options: { skipAboveTokens: 100 } }, async ($, on) => {
      const world = worldOf(on)
      world.messages = [{ role: 'user', text: 'x'.repeat(1000), toolUses: [] }]
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      expect(world.classifierCalls).toBe(0)
      expect(await route($, 'status')).toStartWith('Off (session started before the router)')
    })
  })

  describe('subagents', () => {
    test("a spawn waits for a read of its own brief; that agent's steps carry its level, others keep the main level", async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser') // main: high (provisional)

      const id = await spawn($, { subagentType: 'Explore', description: 'Find parser call sites', prompt: 'List every caller of parse() with file and line.' })
      expect(id).toBe('agent-1')
      expect(world.subagentReads).toHaveLength(1) // read before the agent started: a fork of the parent
      const read = world.subagentReads[0] ?? { system: '', prompt: '' }
      expect(read.prompt).toContain('You are about to start a Explore subagent on Sonnet 5.5 ("Find parser call sites") with the brief below.')
      expect(read.prompt).toContain('<brief>\nList every caller of parse() with file and line.\n</brief>')
      expect(read.prompt).toContain('one Claude Code subagent')
      expect(read.prompt).toContain('<rules>')
      expect(world.spawned[0]?.prompt).toBe('List every caller of parse() with file and line.') // the brief is passed on untouched

      await step($, 0, 'agent-1')
      await step($, 1, 'agent-1')
      await step($, 0)
      await step($, 0, 'agent-unknown')
      expect(world.sent).toEqual(['low', 'low', 'high', 'high'])
      expect(world.debug.some(line => /subagent agent-1 \(Explore: Find parser call sites\) -> low \(codebase search\) in \d+ ms/.test(line))).toBe(true)

      const status = await route($, 'status')
      expect(status).toContain('Subagents: each gets its own level from its task.')
      expect(status).toContain('Recent subagents (1):')
      expect(status).toContain('  low: Find parser call sites (codebase search)')
    })

    test('the brief is capped by classifierMaxChars', { options: { classifierMaxChars: 2000 } }, async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      await $.session.start(STARTED)
      await spawn($, { prompt: `HEAD ${'x'.repeat(10_000)} TAIL` })
      const prompt = world.subagentReads[0]?.prompt ?? ''
      const brief = prompt.slice(prompt.indexOf('<brief>'), prompt.indexOf('</brief>'))
      expect(brief.length).toBeLessThan(2100)
      expect(prompt).toContain('<brief>\nHEAD ')
      expect(prompt).toContain(' TAIL\n</brief>')
      expect(prompt).toContain('chars omitted …]')
    })

    test("a fork takes the parent's level without a read; a nested fork its parent subagent's", async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      await spawn($, { prompt: 'search for X' }) // agent-1: low
      const fork = await spawn($, { prompt: 'carry on with the second half', subagentType: 'fork', fork: true }) // agent-2
      const nested = await spawn($, { prompt: 'and the rest', subagentType: 'fork', fork: true, parentAgentId: 'agent-1' }) // agent-3
      expect(world.subagentReads).toHaveLength(1)
      await step($, 0, fork)
      await step($, 0, nested)
      expect(world.sent).toEqual(['high', 'low'])
      expect(await route($, 'status')).toContain("high: a task (same as its parent: it's a fork)")
    })

    test("a read that fails, hangs or answers nothing usable falls back to the parent's level", async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser') // main: high

      world.subagentReply = 'THROW'
      const failed = await spawn($, { prompt: 'review the diff' })
      world.subagentReply = '{"decision":"undecided"}'
      const unusable = await spawn($, { prompt: 'review the diff' })
      world.subagentReply = 'HANG'
      const spawning = spawn($, { prompt: 'review the diff' })
      await world.clock.advance(15000)
      const late = await spawning

      for (const id of [failed, unusable, late]) await step($, 0, id)
      expect(world.sent).toEqual(['high', 'high', 'high'])
      const status = await route($, 'status')
      expect(status).toContain('same as its parent: the check failed)')
      expect(status).toContain('same as its parent: the check gave no level)')
      expect(status).toContain('same as its parent: the check timed out)')
    })

    test("a nested spawn whose read fails takes its parent subagent's level (parentAgentId)", async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser') // main: high
      world.subagentReply = '{"decision":"lock","level":"xhigh","confidence":0.9,"reason":"security audit"}'
      await spawn($, { prompt: 'audit the upload handler' }) // agent-1: xhigh
      world.subagentReply = 'THROW'
      const nested = await spawn($, { prompt: 'check this one file', parentAgentId: 'agent-1' })
      const top = await spawn($, { prompt: 'check this one file' })
      await step($, 0, nested)
      await step($, 0, top)
      expect(world.sent).toEqual(['xhigh', 'high'])
    })

    test('with no level anywhere and a failed read, the subagent is left alone', async ($, on) => {
      const world = worldOf(on, '{"decision":"undecided"}', {}, AUTO)
      world.subagentReply = 'THROW'
      await $.session.start(STARTED)
      const id = await spawn($, { prompt: 'look into it' })
      await step($, 0, id)
      expect(world.sent).toEqual(['medium'])
      expect(await route($, 'status')).not.toContain('Recent subagents')
    })

    test('routeSubagents false: no read; subagents run at the main level as before', { options: { routeSubagents: false } }, async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      const id = await spawn($, { prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(0)
      await step($, 0, id)
      expect(world.sent).toEqual(['high'])
      expect(await route($, 'status')).toContain('Subagents: not routed (routeSubagents is off)')
    })

    test('off because it is an existing session: subagents are still routed; the main thread is left alone', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      world.messages = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `earlier prompt ${i}`, toolUses: [] }))
      await $.session.start(STARTED)
      const id = await spawn($, { prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(1)
      expect(world.classifierCalls).toBe(0)
      await step($, 0, id)
      await step($, 0)
      expect(world.sent).toEqual(['low', 'medium'])
    })

    test('off because the person turned it off: no reads, and routed subagents go back to the picker', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      await $.session.start(STARTED)
      const before = await spawn($, { prompt: 'search for X' })
      await step($, 0, before)
      expect(world.sent).toEqual(['low'])

      await route($, 'off')
      const after = await spawn($, { prompt: 'search for Y' })
      expect(world.subagentReads).toHaveLength(1)
      await step($, 1, before)
      await step($, 0, after)
      expect(world.sent.slice(1)).toEqual(['medium', 'medium'])
      expect(await route($, 'status')).toContain('Subagents: not routed while the router is off, so they use your effort setting.')

      await route($, 'on')
      await step($, 2, before)
      expect(world.sent.at(-1)).toBe('low')
    })

    test("the organisation's routeSubagents: false turns it off", async ($, on) => {
      const sources = { policy: { pluginConfigs: { 'effort-router@tommy-mods': { options: { routeSubagents: false } } } } }
      const world = worldOf(on, BUG_REPLY, sources, AUTO)
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      const id = await spawn($, { prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(0)
      await step($, 0, id)
      expect(world.sent).toEqual(['high'])
      expect(await route($, 'status')).toContain('not routed (turned off by your organisation)')
    })

    test('a subagent on Haiku (the call\'s model, or its definition\'s) is left alone: no read, its requests untouched', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      world.files['/repo/.claude/agents/scout.md'] = '---\nname: scout\nmodel: haiku\n---\nSearch things.'
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      const asked = await $.agent.spawn({ tool_use_id: 't', prompt: 'search', description: 'd', subagentType: 'Explore', model: 'haiku', parentModel: 'claude-sonnet-5-5', background: true, fork: false } as never)
      const defined = await spawn($, { prompt: 'search', subagentType: 'scout' })
      expect(world.subagentReads).toHaveLength(0)
      const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-4-5-20251001', messageCount: 3, agentId: asked.agentId } as never)
      for await (const _ of stream) {
        // drain
      }
      expect(world.sent).toEqual([undefined])
      expect(world.debug.some(line => /subagent \(Explore: d\) runs on Haiku 4\.5, left alone|runs on haiku, left alone/i.test(line))).toBe(true)
      expect(defined).toBeDefined()
    })

    test('a denied spawn is not kept', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, AUTO)
      world.denySpawn = 'no agents here'
      await $.session.start(STARTED)
      const result = await $.agent.spawn({ tool_use_id: 't', prompt: 'search', description: 'd', subagentType: 'Explore', parentModel: 'claude-sonnet-5-5', background: true, fork: false } as never)
      expect(result.deny).toBe('no agents here')
      expect(world.subagentReads).toHaveLength(1)
      expect(await route($, 'status')).not.toContain('Recent subagents')
    })
  })

  describe("subagents whose definition sets an effort", () => {
    const HOME = { ...ASK, HOME: '/home/t', USERPROFILE: '/home/t' }
    const def = (name: string, effort?: string) =>
      `---\nname: ${name}\ndescription: test agent\n${effort ? `effort: ${effort}\n` : ''}tools: Read, Grep\n---\n\nYou are a test agent.\n`

    test('a user definition with effort: no read, requests left to the engine, status says so', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, { ...HOME, ...AUTO })
      world.files['/home/t/.claude/agents/effort-probe-low.md'] = def('effort-probe-low', 'low')
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser') // main: high
      const id = await spawn($, { subagentType: 'effort-probe-low', description: 'Probe', prompt: 'implement the whole billing system' })
      expect(world.subagentReads).toHaveLength(0)
      await step($, 0, id)
      await step($, 0)
      expect(world.sent).toEqual(['medium', 'high']) // untouched (the engine applies low); the main thread keeps high
      const status = await route($, 'status')
      expect(status).toContain('  low: Probe (set by its agent definition)')
      expect(world.debug.some(line => /subagent agent-1 \(effort-probe-low: Probe\) -> low set by its definition, left alone/.test(line))).toBe(true)
    })

    test('a project definition wins over a user one, with or without an effort', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, { ...HOME, ...AUTO })
      world.files['/home/t/.claude/agents/reviewer.md'] = def('reviewer', 'low')
      world.files['/repo/.claude/agents/reviewer.md'] = def('reviewer', 'max')
      world.files['/home/t/.claude/agents/scout.md'] = def('scout', 'xhigh')
      world.files['/repo/.claude/agents/scout.md'] = def('scout')
      await $.session.start(STARTED)
      await spawn($, { subagentType: 'reviewer', description: 'Review', prompt: 'review it' })
      expect(world.subagentReads).toHaveLength(0)
      expect(await route($, 'status')).toContain('  max: Review (set by its agent definition)')
      const scout = await spawn($, { subagentType: 'scout', description: 'Scout', prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(1) // the project's scout sets no effort: routed
      await step($, 0, scout)
      expect(world.sent).toEqual(['low'])
    })

    test('a definition without an effort is routed as usual', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, { ...HOME, ...AUTO })
      world.files['/home/t/.claude/agents/searcher.md'] = def('searcher')
      await $.session.start(STARTED)
      const id = await spawn($, { subagentType: 'searcher', prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(1)
      await step($, 0, id)
      expect(world.sent).toEqual(['low'])
    })

    test("a file is matched by its frontmatter name, not its file name; definitions are scanned once", async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, { ...HOME, ...AUTO })
      world.files['/home/t/.claude/agents/probe.md'] = def('effort-probe-low', 'low')
      await $.session.start(STARTED)
      await spawn($, { subagentType: 'effort-probe-low', prompt: 'anything' })
      expect(world.subagentReads).toHaveLength(0)
      world.files['/home/t/.claude/agents/probe-two.md'] = def('probe', 'high') // after the scan: not seen this session
      await spawn($, { subagentType: 'probe', prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(1) // "probe" is only a file name: routed
    })

    test("an effort in a settings source's agents key is respected", async ($, on) => {
      const sources = { user: { agents: { auditor: { description: 'audits', prompt: 'audit', effort: 'xhigh' } } } }
      const world = worldOf(on, BUG_REPLY, sources, { ...HOME, ...AUTO })
      await $.session.start(STARTED)
      const id = await spawn($, { subagentType: 'auditor', description: 'Audit', prompt: 'audit it' })
      expect(world.subagentReads).toHaveLength(0)
      await step($, 0, id)
      expect(world.sent).toEqual(['medium'])
      expect(await route($, 'status')).toContain('  xhigh: Audit (set by its agent definition)')
    })

    test("a plugin's agent is not looked up: it is routed", async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, { ...HOME, ...AUTO })
      world.files['/home/t/.claude/agents/probe-low.md'] = def('probe-low', 'low')
      await $.session.start(STARTED)
      await spawn($, { subagentType: 'subagent-probe:probe-low', prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(1)
    })
  })

  // --- the spend report -----------------------------------------------------------------

  describe('the spend report', () => {
    const HOME = { ...ASK, HOME: '/home/t', USERPROFILE: '/home/t' }
    const LEDGER = '/home/t/.claude/effort-router/spend/session-1.json'
    const complete = ($: Engine) => $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)

    test('records each request with the level it arrived at and went out at, and the router reads; saved when a turn ends', async ($, on) => {
      const world = worldOf(on, BUG_REPLY, {}, { ...HOME, ...AUTO })
      world.usage = 1000
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser') // auto: high 🔒
      await step($, 0) // arrives medium (the picker), goes out high
      const id = await spawn($, { description: 'Find usages', prompt: 'find every caller of parseConfig' })
      await step($, 0, id) // arrives medium, the brief says low
      expect(world.sent).toEqual(['high', 'low'])
      const report = await route($, 'report session')
      expect(report).toContain('Effort for this session: 2 requests, 2.0k output tokens.')
      expect(report).toContain('  main conversation, medium → high: 1 request, 1.0k output tokens (avg 1.0k)')
      expect(report).toContain('  subagents, medium → low: 1 request, 1.0k output tokens (avg 1.0k)')
      expect(report).toContain("The router's own checks: 2 (1 of a first prompt, 1 for subagents),")
      expect(world.written).toEqual([])
      await complete($)
      expect(world.written).toEqual([LEDGER])
      const saved = JSON.parse(world.files[LEDGER] ?? '{}')
      expect(saved.rows.map((r: { caller: string; from: string; to: string; requests: number }) => `${r.caller} ${r.from}→${r.to} ×${r.requests}`)).toEqual(['main medium→high ×1', 'subagent medium→low ×1'])
      await complete($)
      expect(world.written).toHaveLength(1) // nothing new: not written again
    })

    test('a session carries on from its saved ledger; the week reads every saved session', async ($, on) => {
      const world = worldOf(on, '{"decision":"undecided"}', {}, HOME)
      world.usage = 100
      const today = new Date(world.clock.now()).toISOString().slice(0, 10)
      const row = (from: string, to: string, output: number) => ({ day: today, caller: 'main', from, to, requests: 1, output, input: 0 })
      world.files[LEDGER] = JSON.stringify({ version: 1, session: 'session-1', repo: 'mods', rows: [row('medium', 'medium', 500)], reads: [] })
      world.files['/home/t/.claude/effort-router/spend/session-2.json'] = JSON.stringify({ version: 1, session: 'session-2', repo: 'employment', rows: [row('high', 'high', 2000)], reads: [] })
      world.files['/home/t/.claude/effort-router/spend/notes.txt'] = 'not a ledger'
      await $.session.start(STARTED)
      await step($, 0)
      expect(world.sent).toEqual(['medium'])
      const week = await route($, 'report')
      expect(week).toContain('3 requests in 2 sessions, 2.6k output tokens.')
      expect(week).toContain('  medium: 2 requests, 600 output tokens (avg 300)')
      expect(week).toContain('By repo (output tokens): employment 2.0k, mods 600.')
      expect(await route($, 'report session')).toContain('Effort for this session: 2 requests, 600 output tokens.')
    })

    test('no home directory: still reported for the session, nothing written', async ($, on) => {
      const world = worldOf(on, '{"decision":"undecided"}')
      world.usage = 10
      await $.session.start(STARTED)
      await step($, 0)
      await complete($)
      expect(world.written).toEqual([])
      expect(await route($, 'report')).toContain('1 request in 1 session, 10 output tokens.')
    })
  })
})
