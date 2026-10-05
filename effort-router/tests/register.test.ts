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

/** Assessments as the classifier writes them: a spread over the levels. */
const HIGH = '{"decision":"level","levels":{"medium":0.1,"high":0.9},"reason":"bug fix in existing code"}'
const XHIGH = '{"decision":"level","levels":{"high":0.05,"xhigh":0.95},"reason":"security review"}'
/** Leans high but only 60% sure medium is too low: stays on medium. */
const LEANS = '{"decision":"level","levels":{"medium":0.4,"high":0.6},"reason":"small fix"}'
const UNCLEAR = '{"decision":"undecided"}'
const SEARCH_REPLY = '{"decision":"lock","level":"low","confidence":0.9,"reason":"codebase search"}'

type World = {
  sent: (string | number | undefined)[]
  lines: string[]
  debug: string[]
  classifierCalls: number
  reply: string
  messages: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[]
  prompts: string[]
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
  /** Set: every model request reports this many output tokens (otherwise no usage). */
  usage?: number
  /** Paths `$.fs.write` wrote, in order. */
  written: string[]
  /** The session's model, as `$.session.model()` answers. */
  model: string
  /** The session's id, as `$.session.id()` answers. */
  id: string
  /** Set: `$.model.fork` answers with `reply` (otherwise there is nothing to fork). */
  forkable: boolean
  /** Forks made: their prompts. */
  forks: string[]
  /** Separate assessments made: their model, whether they carried effort, their prompt. */
  completes: { model: string; effort?: string; prompt: string }[]
  /** Commands registered. */
  commands: string[]
}

/** `$.fs` paths with forward slashes and no drive (the kit resolves `/repo` to `D:\repo` on Windows). */
const slashed = (path: string): string => path.replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '/')

const HOME = { HOME: '/home/t', USERPROFILE: '/home/t' }
const LEDGER = '/home/t/.claude/effort-router/spend/session-1.json'

/** Answers every `$` call the mod makes, beneath it. */
function worldOf(on: On, reply = HIGH, sources: Record<string, unknown> = {}, env: Record<string, string> = {}): World {
  const clock = mock.clock(on)
  const world: World = {
    sent: [], lines: [], debug: [], classifierCalls: 0, reply, messages: [], prompts: [], clock, callsAtSubmit: [],
    subagentReply: SEARCH_REPLY, subagentReads: [], spawned: [], files: {}, endingIn: {}, written: [],
    model: 'claude-sonnet-5-5', id: 'session-1', forkable: false, forks: [], completes: [], commands: [],
  }
  mock.env(on, env)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: world.id }))
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
  on('command.register', ($, e) => {
    world.commands.push(e.name)
    return { value: { command: e.name } }
  })
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
      return { value: { isAnswered: true, text: HIGH, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
    }
    return { value: { isAnswered: true, text: reply, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  on('ui.log', ($, e) => {
    ;(e.to === 'debug' ? world.debug : world.lines).push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ children: [] }))
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
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { questions: QUESTIONS.questions, answers: {} }, text: ANSWERS }) as never)
  return world
}

type Found = { type: string; props: Record<string, unknown>; text: string }
type Mounted = {
  find: (q: Record<string, unknown>) => Promise<Found | undefined>
  findAll: (q: Record<string, unknown>) => Promise<Found[]>
  press: (q: { key: string }) => Promise<unknown>
}

/** The footer button: its label and whether it is dim. */
async function footerOf(footer: Mounted) {
  const found = await footer.find({ key: 'route-state' })
  return { type: found?.type, shown: found?.props.label as string | undefined, dim: found?.props.dimColor === true }
}

/** The router's band: its lines (none when not drawn) and its buttons, a greyed one in brackets. */
async function bandOf(band: Mounted) {
  const texts = (await band.findAll({ type: 'Text' })).map(t => t.text)
  const first = texts.findIndex(t => t.startsWith('Effort router: '))
  const lines = first < 0 ? [] : texts.slice(first)
  const buttons = (await band.findAll({ type: 'Button' })).map(b => (b.props.dimColor ? `(${String(b.props.label)})` : String(b.props.label)))
  return { headline: lines[0], lines, buttons }
}

/** One model request; `effort` is the engine's level for it (the picker's, on the main thread). */
async function step($: Engine, index: number, agentId?: string, effort: 'low' | 'medium' | 'high' | 'xhigh' = 'medium', model = 'claude-sonnet-5-5'): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index, model, effort, messageCount: 3, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // drain
  }
}

/** The main loop's turn ends. */
const done = ($: Engine) => $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)

async function submit($: Engine, text: string): Promise<void> {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
}

/** One whole human turn: the prompt, one request at the picker's level, the turn's end. */
async function turn($: Engine, text: string, effort: 'low' | 'medium' | 'high' | 'xhigh' = 'medium'): Promise<void> {
  await submit($, text)
  await step($, 0, undefined, effort)
  await done($)
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

/** `/er <args>`: what it printed (undefined when it printed nothing). */
async function er($: Engine, args = '', command = 'er'): Promise<string | undefined> {
  return (await $.command.run({ command, args } as never)).text
}

/** `/er <args>` as text. */
async function route($: Engine, args = ''): Promise<string> {
  return (await er($, args)) ?? ''
}

/** A first turn that moves the main thread to high; the requests record starts after it. */
async function atHigh($: Engine, world: World): Promise<void> {
  await turn($, 'fix the crash in the parser')
  world.sent.length = 0
  world.lines.length = 0
}

const STARTED = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

/** Lets anything left running settle. */
async function settle(_: Engine): Promise<void> {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

const mountFooter = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => $.ui.mount({ plugin: 'effort-router', surface, ...FOOTER } as never) as Promise<Mounted & { unmount: () => Promise<void> }>
const mountBand = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => $.ui.mount({ plugin: 'effort-router', surface, ...BAND } as never) as Promise<Mounted>

describe('effort-router', () => {
  // --- the rule on the main thread --------------------------------------------------------

  describe('assess the first prompts, move when sure, then lock', () => {
    const INSTRUCTIONS = 'Contents of /repo/CLAUDE.md: payments code, always run the ledger tests.'

    test('the first prompt: a separate call with the instructions, before the turn, judged against the first request', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await $.prompt.context({ blocks: [{ name: 'claudeMd', text: INSTRUCTIONS }, { name: 'currentDate', text: 'Today' }] } as never)
      await submit($, 'the checkout total is wrong when a coupon expires, fix it')
      expect(world.callsAtSubmit).toEqual([1]) // assessed before prompt.submit went on
      expect(world.forks).toEqual([])
      expect(world.completes).toHaveLength(1)
      expect(world.completes[0]?.model).toBe('claude-sonnet-5-5')
      expect(world.completes[0]?.effort).toBeUndefined() // the model's own default effort
      expect(world.completes[0]?.prompt).toContain(`<instructions>\n${INSTRUCTIONS}\n</instructions>`)
      expect(world.lines).toEqual([]) // nothing to judge against until a request shows your setting
      await step($, 0)
      expect(world.sent).toEqual(['high'])
      expect(world.lines).toEqual(['Assessed, medium to high (bug fix in existing code).'])
      const footer = await mountFooter($)
      expect(await footerOf(footer)).toMatchObject({ type: 'Button', shown: '🔓 high ◔', dim: false })
    })

    test('later prompts fork the conversation and are judged against the level running', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      world.forkable = true
      world.messages = [
        { role: 'user', text: 'fix the crash in the parser', toolUses: [] },
        { role: 'assistant', text: 'Fixed: a null check in parse().', toolUses: [] },
      ]
      world.reply = LEANS // 40% below high, 0% above: stays at high
      await submit($, 'now add a test for it')
      expect(world.completes).toHaveLength(1)
      expect(world.forks).toHaveLength(1)
      const fork = world.forks[0] ?? ''
      expect(fork).toStartWith('Pause the task for a moment.')
      expect(fork).toContain('<last_reply>\nFixed: a null check in parse().\n</last_reply>')
      expect(fork).toContain('<new_message>\nnow add a test for it\n</new_message>')
      await step($, 0)
      expect(world.sent).toEqual(['high', 'high'])
      expect(world.lines).toHaveLength(1) // stayed: nothing said
      expect(await route($, 'status')).toContain('Assessments this session: 2.')
    })

    test('an unsure assessment stays, and your setting runs untouched', async ($, on) => {
      const world = worldOf(on, LEANS)
      await $.session.start(STARTED)
      await turn($, 'something is off in checkout')
      expect(world.sent).toEqual(['medium'])
      expect(world.lines).toEqual([])
      const band = await mountBand($)
      await $.command.run({ command: 'er', args: '' } as never)
      expect((await bandOf(band)).lines).toEqual([
        'Effort router: unlocked. Medium (your effort setting), 40% confidence. Locks after 4 more prompts.', // 40% sure medium is right
        'Last assessment: medium 40%, high 60% (small fix). 60% sure medium is too low, so it stayed. It moves at 70%.',
      ])
    })

    test('nothing to assess yet (no clear task) stays, and still counts toward the window', async ($, on) => {
      const world = worldOf(on, UNCLEAR)
      await $.session.start(STARTED)
      await turn($, 'hi')
      expect(world.sent).toEqual(['medium'])
      expect(await route($, 'status')).toContain('Assessed 1 of 5 prompts.')
    })

    test('after the last prompt of the window it locks whatever runs; no more assessments', { options: { promptsToAssess: 2 } }, async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser') // moves to high
      world.forkable = true
      world.reply = LEANS
      await turn($, 'and the one in the lexer') // stays, then locks at high
      expect(world.lines).toEqual(['Assessed, medium to high (bug fix in existing code).', 'Locked at high.'])
      await turn($, 'now refactor the whole module')
      expect(world.classifierCalls).toBe(2)
      expect(world.sent).toEqual(['high', 'high', 'high'])
      expect((await footerOf(await mountFooter($))).shown).toBe('🔒 high')
    })

    test('a move on the last prompt moves, then locks', { options: { promptsToAssess: 1 } }, async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      expect(world.lines).toEqual(['Assessed, medium to high (bug fix in existing code).', 'Locked at high.'])
      expect(world.sent).toEqual(['high'])
    })

    test('a confidence of 0.95 needs more: a 90% sure assessment stays', { options: { confidence: 0.95 } }, async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      expect(world.sent).toEqual(['medium'])
    })

    test('changing the effort picker turns routing off and your level is used; it is not assessed again', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser') // high
      world.forkable = true
      await submit($, 'now look at the lexer')
      await step($, 0, undefined, 'xhigh') // you changed the picker to xhigh
      await done($)
      expect(world.sent).toEqual(['high', 'xhigh'])
      expect(world.lines.at(-1)).toBe('You changed the effort to xhigh, so routing is off.')
      await turn($, 'and the tokenizer', 'xhigh')
      expect(world.classifierCalls).toBe(2)
      expect(world.sent.at(-1)).toBe('xhigh')
      expect(await footerOf(await mountFooter($))).toMatchObject({ shown: '⏸️ xhigh', dim: true })
    })

    test('the picker change turns it off while locked too', { options: { promptsToAssess: 1 } }, async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser') // high, locked
      await turn($, 'smaller thing', 'low')
      expect(world.sent).toEqual(['high', 'low'])
      expect(world.lines.at(-1)).toBe('You changed the effort to low, so routing is off.')
    })

    test('a prompt sent while a turn runs is not assessed', async ($, on) => {
      const world = worldOf(on, UNCLEAR)
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

    test('a slash command is not assessed', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await submit($, '/er status')
      expect(world.classifierCalls).toBe(0)
    })

    test('answered questions mid-turn are assessed by a fork that carries the answers', async ($, on) => {
      const world = worldOf(on, UNCLEAR)
      await $.session.start(STARTED)
      await submit($, 'build an invoice sync')
      await step($, 0)
      world.forkable = true
      world.reply = HIGH
      await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', ...QUESTIONS } as never)
      expect(world.forks).toHaveLength(1)
      expect(world.forks[0]).toContain(`<answers>\n${ANSWERS}\n</answers>`)
      await step($, 1)
      expect(world.sent).toEqual(['medium', 'high'])
      expect(await route($, 'status')).toContain('Assessed 2 of 5 prompts.')
    })

    test('an assessment that does not answer within 30 s fails open; status says why', async ($, on) => {
      const world = worldOf(on, 'HANG')
      await $.session.start(STARTED)
      const submitting = submit($, 'fix the crash in the parser')
      await world.clock.advance(30_000)
      await submitting
      await step($, 0)
      expect(world.sent).toEqual(['medium'])
      expect(await route($, 'status')).toContain('the assessment timed out after 30 s')
    })

    test('a throwing assessment fails open, still counts, and status reports the error', async ($, on) => {
      const world = worldOf(on, 'THROW')
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      expect(world.sent).toEqual(['medium'])
      const status = await route($, 'status')
      expect(status).toContain('Last error (0s ago): ')
      expect(status).toContain('Assessed 1 of 5 prompts.') // a failure still uses up its prompt
    })

    test('each assessment is recorded with its kind, spread and what came of it', async ($, on) => {
      const world = worldOf(on, HIGH, {}, HOME)
      await $.session.start(STARTED)
      await $.prompt.context({ blocks: [{ name: 'claudeMd', text: INSTRUCTIONS }] } as never)
      await turn($, 'fix the crash in the parser')
      world.forkable = true
      world.reply = LEANS
      await turn($, 'and the lexer')
      await route($, 'lock')
      world.messages = [{ role: 'user', text: 'and the lexer', toolUses: [] }]
      world.reply = XHIGH
      expect(await route($, 'assess')).toBe('Assessed, high to xhigh (security review).')
      await settle($)
      const saved = JSON.parse(world.files[LEDGER] ?? '{}')
      const rows = (saved.verdicts as Record<string, unknown>[]).map(({ at: _, ...row }) => row)
      expect(rows).toEqual([
        { kind: 'first', model: 'claude-sonnet-5-5', prompt: 1, level: 'high', confidence: 0.9, reason: 'bug fix in existing code', spread: { medium: 0.1, high: 0.9 }, against: 'medium', outcome: 'moved to high', withInstructions: true },
        { kind: 'fork', model: 'claude-sonnet-5-5', prompt: 2, level: 'high', confidence: 0.6, reason: 'small fix', spread: { medium: 0.4, high: 0.6 }, against: 'high', outcome: 'stayed' },
        { kind: 'fork', model: 'claude-sonnet-5-5', prompt: 2, level: 'xhigh', confidence: 0.95, reason: 'security review', spread: { high: 0.05, xhigh: 0.95 }, against: 'high', outcome: 'moved to xhigh', manual: true },
      ])
    })
  })

  // --- the footer and the band -------------------------------------------------------------

  describe('the footer and the band', () => {
    test('the footer is a plain button on both surfaces; the band opens only from it or /er', async ($, on) => {
      worldOf(on)
      await $.session.start({ ...STARTED, surface: 'desktop' })
      for (const surface of ['terminal', 'desktop'] as const) {
        const footer = await mountFooter($, surface)
        expect(await footerOf(footer)).toMatchObject({ type: 'Button', shown: '🔓 medium ○' })
        expect(await footer.find({ type: 'Select' })).toBeUndefined()
        await footer.unmount()
      }
      const footer = await mountFooter($, 'desktop')
      const band = await mountBand($, 'desktop')
      expect((await bandOf(band)).headline).toBeUndefined()
      await footer.press({ key: 'route-state' })
      expect(await bandOf(band)).toEqual({
        headline: 'Effort router: unlocked. Medium (your effort setting). Locks after 5 more prompts.',
        lines: ['Effort router: unlocked. Medium (your effort setting). Locks after 5 more prompts.'],
        buttons: ['Hide', 'Lock at medium', 'Turn off', '(Assess)'],
      })
      await footer.press({ key: 'route-state' }) // the footer closes it again
      expect((await bandOf(band)).headline).toBeUndefined()
    })

    test('a greyed slot stays in place and says why; Hide closes the band', async ($, on) => {
      worldOf(on)
      await $.session.start(STARTED)
      const band = await mountBand($)
      expect(await er($)).toBeUndefined() // the band opens and nothing is printed
      await band.press({ key: 'assess' })
      expect((await bandOf(band)).lines.at(-1)).toBe('It assesses before your next prompt anyway.')
      await band.press({ key: 'hide' })
      expect((await bandOf(band)).headline).toBeUndefined()
    })

    test('the band says what the last assessment did, and the hotkeys are 1 to 4', async ($, on) => {
      worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      const band = await mountBand($)
      await er($, '', 'effort-router')
      expect((await bandOf(band)).lines).toEqual([
        'Effort router: unlocked. High (chosen by the router), 90% confidence. Locks after 4 more prompts.',
        'Last assessment: medium 10%, high 90% (bug fix in existing code). 90% sure medium was too low, so it moved to high.',
      ])
      const hotkeys = (await band.findAll({ type: 'Button' })).map(b => b.props.hotkey)
      expect(hotkeys).toEqual(['1', '2', '3', '4'])
    })

    test('Lock, then Unlock: the level is kept and a fresh window starts', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      const band = await mountBand($)
      await er($)
      await band.press({ key: 'lock' })
      expect(world.lines.at(-1)).toBe('You locked it at high.')
      expect(await bandOf(band)).toMatchObject({
        headline: 'Effort router: locked. High (locked by you after 1 prompt), 90% confidence.',
        buttons: ['Hide', 'Unlock', 'Turn off', 'Assess'],
      })
      world.forkable = true
      await turn($, 'and the lexer')
      expect(world.classifierCalls).toBe(1) // locked: not assessed
      await band.press({ key: 'unlock' })
      expect(world.lines.at(-1)).toBe('Unlocked. Assessing again from your next prompt.')
      expect((await bandOf(band)).headline).toStartWith('Effort router: unlocked. High (chosen by the router)')
      expect((await bandOf(band)).headline).toEndWith('Locks after 5 more prompts.')
      await step($, 0)
      expect(world.sent.at(-1)).toBe('high')
      await done($)
      world.reply = LEANS
      await turn($, 'the tokenizer too')
      expect(world.classifierCalls).toBe(2)
    })

    test('Lock before the first request locks at the level its label names', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      const band = await mountBand($)
      await er($)
      await band.press({ key: 'lock' })
      expect(world.lines).toEqual(['You locked it at medium.'])
      await turn($, 'fix the crash in the parser')
      expect(world.classifierCalls).toBe(0)
      expect(world.sent).toEqual(['medium'])
    })

    test('Turn off, then the two ways back on', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser') // high
      const band = await mountBand($)
      const footer = await mountFooter($)
      await er($)
      await band.press({ key: 'off' })
      expect(world.lines.at(-1)).toBe('Off. Your effort (medium) applies.')
      expect(await bandOf(band)).toMatchObject({
        headline: 'Effort router: off. Medium (your effort setting).',
        buttons: ['Hide', 'Turn on, locked at high', 'Turn on, unlocked', 'Turn on and assess'],
      })
      expect(await footerOf(footer)).toMatchObject({ shown: '⏸️ medium', dim: true })
      await step($, 0)
      expect(world.sent.at(-1)).toBe('medium')
      await done($)

      await band.press({ key: 'on-locked' })
      expect(world.lines.at(-1)).toBe('On, locked at high.')
      expect((await footerOf(footer)).shown).toBe('🔒 high')
      await step($, 0)
      expect(world.sent.at(-1)).toBe('high')
      await done($)

      await band.press({ key: 'off' })
      await band.press({ key: 'on-unlocked' })
      expect(world.lines.at(-1)).toBe('On, unlocked.')
      expect((await footerOf(footer)).shown).toBe('🔓 medium ○') // a fresh window from your setting
      await step($, 0)
      expect(world.sent.at(-1)).toBe('medium')
    })

    test('Turn on and assess: on, unlocked, and assessed now (counted)', async ($, on) => {
      const world = worldOf(on, UNCLEAR)
      await $.session.start(STARTED)
      await turn($, 'hi')
      await route($, 'off')
      world.forkable = true
      world.reply = HIGH
      world.messages = [{ role: 'user', text: 'fix the crash in the parser', toolUses: [] }]
      const band = await mountBand($)
      await er($)
      await band.press({ key: 'on-assess' })
      await settle($)
      expect(world.lines.slice(-2)).toEqual(['On, unlocked.', 'Assessed, medium to high (bug fix in existing code).'])
      expect((await bandOf(band)).headline).toEndWith('Locks after 4 more prompts.')
    })

    test('Assess while locked: a manual assessment moves the locked level, stays locked, and does not count', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser') // high
      await route($, 'lock')
      world.forkable = true
      world.reply = XHIGH
      expect(await route($, 'assess this is a security review now')).toBe('Assessed, high to xhigh (security review).')
      expect(world.forks[0]).toContain('this is a security review now')
      expect((await footerOf(await mountFooter($))).shown).toBe('🔒 xhigh')
      await step($, 0)
      expect(world.sent.at(-1)).toBe('xhigh')
    })

    test('the band counts routed subagents', async ($, on) => {
      worldOf(on)
      await $.session.start(STARTED)
      await spawn($, { prompt: 'search for X' })
      const band = await mountBand($)
      await er($)
      expect((await bandOf(band)).lines).toContain('Subagents get their own level: 1 routed this session.')
    })

    test('no band while the engine shows a survey', async ($, on) => {
      worldOf(on)
      await $.session.start(STARTED)
      await er($)
      const band = (await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND, props: { ...BAND.props, hasSurvey: true } } as never)) as Mounted
      expect((await bandOf(band)).headline).toBeUndefined()
    })
  })

  // --- /er -----------------------------------------------------------------------------------

  describe('/effort-router and /er', () => {
    test('both names are registered', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      expect(world.commands).toEqual(['effort-router', 'er'])
    })

    test('-p: bare /er prints the band and the usage instead', async ($, on) => {
      worldOf(on)
      await $.session.start({ ...STARTED, isInteractive: false })
      const text = await route($)
      expect(text).toStartWith('Effort router: unlocked. Medium (your effort setting). Locks after 5 more prompts.\n')
      expect(text).toContain('/er is short for /effort-router')
    })

    test('explicit verbs: each says what changed, or that nothing did', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      expect(await route($, 'on')).toBe('Already on, unlocked.')
      expect(await route($, 'unlock')).toBe('Already unlocked. Assessed 0 of 5 prompts.')
      expect(await route($, 'assess')).toBe('It assesses before your next prompt anyway.')
      expect(await route($, 'assess this is a migration')).toBe('Your hint is used when your next prompt is assessed.')
      await submit($, 'go')
      expect(world.completes[0]?.prompt).toContain('this is a migration')
      await step($, 0)
      await done($)
      expect(await route($, 'lock')).toBe('You locked it at high.')
      expect(await route($, 'lock')).toBe('Already locked at high.')
      expect(await route($, 'off')).toBe('Off. Your effort (medium) applies.')
      expect(await route($, 'off')).toBe('Already off.')
      expect(await route($, 'on')).toBe('On, unlocked.')
      expect(world.lines).toEqual(['Assessed, medium to high (bug fix in existing code).']) // command replies print once, as the reply
    })

    test('lock while off turns on locked at the last level; unlock while off turns on unlocked', async ($, on) => {
      worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      await route($, 'off')
      expect(await route($, 'lock')).toBe('On, locked at high.')
      await route($, 'off')
      expect(await route($, 'unlock')).toBe('On, unlocked.')
    })

    test('anything else is refused with the usage, never run as a hint', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      const text = await route($, 'stauts')
      expect(text).toStartWith('Unknown: stauts. ')
      expect(world.classifierCalls).toBe(0)
    })

    test('status: the band lines, then the details', async ($, on) => {
      worldOf(on)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      const status = await route($, 'status')
      expect(status).toStartWith('Effort router: unlocked. High (chosen by the router), 90% confidence. Locks after 4 more prompts.\nLast assessment: medium 10%, high 90%')
      expect(status).toContain('Assessed 1 of 5 prompts.')
      expect(status).toContain('Subagents: each gets its own level from its task.')
    })
  })

  // --- models, first sightings, saved state ---------------------------------------------------

  describe('models, first sightings and saved state', () => {
    test('on a model the router does not support it stands aside: no assessments, no level applied, and it says why', async ($, on) => {
      const world = worldOf(on)
      world.model = 'claude-haiku-4-5-20251001'
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      expect(world.classifierCalls).toBe(0)
      expect((await footerOf(await mountFooter($))).shown).toBe('⏸️ medium')
      expect(await route($, 'status')).toStartWith('Effort router: off on Haiku 4.5. It works with Fable 5.1, Opus 5.5 and Sonnet 5.5.')
      expect(await route($, 'on')).toBe("The router doesn't support Haiku 4.5, so your effort setting applies. It works with Fable 5.1, Opus 5.5 and Sonnet 5.5.")
    })

    test('a level set on a supported model is not applied after /model switches to another', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      await step($, 0)
      await step($, 1, undefined, 'medium', 'claude-opus-4-8')
      await step($, 2)
      expect(world.sent).toEqual(['high', 'medium', 'high'])
    })

    test('the model notes for the session model go into the assessment', async ($, on) => {
      const world = worldOf(on, UNCLEAR)
      world.model = 'claude-opus-5-5'
      await $.session.start(STARTED)
      world.endingIn['/rules/models/opus-5-5.md'] = '<!-- source -->\n- The default level is medium.'
      await submit($, 'hi')
      expect(world.completes[0]?.model).toBe('claude-opus-5-5')
      expect(await route($, 'rules')).toContain('On Opus 5.5:\n- The default level is medium.')
      expect(await route($, 'rules')).toMatch(/\+ notes on Opus 5\.5 \(.*opus-5-5\.md\)/)
    })

    test('a session first seen with the window used up is left off; it says why', async ($, on) => {
      const world = worldOf(on)
      world.messages = Array.from({ length: 5 }, (_, i) => ({ role: 'user' as const, text: `earlier prompt ${i}`, toolUses: [] }))
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      expect(world.classifierCalls).toBe(0)
      expect(world.sent).toEqual(['medium'])
      expect(await route($, 'status')).toStartWith('Effort router: off. Medium (your effort setting). This session started before the router.')
    })

    test('a session first seen part way through the window counts its earlier prompts', async ($, on) => {
      const world = worldOf(on)
      world.messages = Array.from({ length: 3 }, (_, i) => ({ role: 'user' as const, text: `earlier prompt ${i}`, toolUses: [] }))
      await $.session.start(STARTED)
      expect((await footerOf(await mountFooter($))).shown).toBe('🔓 medium ◑')
      await turn($, 'fix the crash in the parser')
      expect(world.classifierCalls).toBe(1)
      expect(await route($, 'status')).toContain('Assessed 4 of 5 prompts.')
    })

    test('the state is saved in the ledger at once, and a session carries on from it', async ($, on) => {
      const world = worldOf(on, HIGH, {}, HOME)
      await $.session.start(STARTED)
      await turn($, 'fix the crash in the parser')
      await route($, 'lock')
      const saved = JSON.parse(world.files[LEDGER] ?? '{}')
      expect(saved.state).toEqual({ status: 'locked', level: 'high', assessed: 1, lockedBy: 'you', lockedAfter: 1, lastLevel: 'high' })

      // The same state, read back by a session that has not been seen in this process (a resume, a reload).
      world.id = 'session-2'
      world.files['/home/t/.claude/effort-router/spend/session-2.json'] = JSON.stringify({ ...saved, session: 'session-2' })
      world.forkable = true
      await turn($, 'and the lexer')
      expect(world.classifierCalls).toBe(1)
      expect(world.sent.at(-1)).toBe('high')
      expect((await footerOf(await mountFooter($))).shown).toBe('🔒 high')
    })
  })

  describe('subagents', () => {
    test("a spawn waits for a read of its own brief; that agent's steps carry its level, others keep the main level", async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await atHigh($, world)

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

    test('the brief is capped at 24k characters', async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await spawn($, { prompt: `HEAD ${'x'.repeat(60_000)} TAIL` })
      const prompt = world.subagentReads[0]?.prompt ?? ''
      const brief = prompt.slice(prompt.indexOf('<brief>'), prompt.indexOf('</brief>'))
      expect(brief.length).toBeLessThan(24_100)
      expect(prompt).toContain('<brief>\nHEAD ')
      expect(prompt).toContain(' TAIL\n</brief>')
      expect(prompt).toContain('chars omitted …]')
    })

    test("a fork takes the parent's level without a read; a nested fork its parent subagent's", async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await atHigh($, world)
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
      const world = worldOf(on)
      await $.session.start(STARTED)
      await atHigh($, world)

      world.subagentReply = 'THROW'
      const failed = await spawn($, { prompt: 'review the diff' })
      world.subagentReply = '{"decision":"undecided"}'
      const unusable = await spawn($, { prompt: 'review the diff' })
      world.subagentReply = 'HANG'
      const spawning = spawn($, { prompt: 'review the diff' })
      await world.clock.advance(30_000)
      const late = await spawning

      for (const id of [failed, unusable, late]) await step($, 0, id)
      expect(world.sent).toEqual(['high', 'high', 'high'])
      const status = await route($, 'status')
      expect(status).toContain('same as its parent: the assessment failed)')
      expect(status).toContain('same as its parent: the assessment gave no level)')
      expect(status).toContain('same as its parent: the assessment timed out)')
    })

    test("a nested spawn whose read fails takes its parent subagent's level (parentAgentId)", async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await atHigh($, world)
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
      const world = worldOf(on, UNCLEAR)
      world.subagentReply = 'THROW'
      await $.session.start(STARTED)
      const id = await spawn($, { prompt: 'look into it' })
      await step($, 0, id)
      expect(world.sent).toEqual(['medium'])
      expect(await route($, 'status')).not.toContain('Recent subagents')
    })

    test('routeSubagents false: no read; subagents run at the main level as before', { options: { routeSubagents: false } }, async ($, on) => {
      const world = worldOf(on)
      await $.session.start(STARTED)
      await atHigh($, world)
      const id = await spawn($, { prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(0)
      await step($, 0, id)
      expect(world.sent).toEqual(['high'])
      expect(await route($, 'status')).toContain('Subagents: not routed (routeSubagents is off)')
    })

    test('off because it is an existing session: subagents are still routed; the main thread is left alone', async ($, on) => {
      const world = worldOf(on)
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
      const world = worldOf(on)
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

    test('a subagent on Haiku (the call\'s model, or its definition\'s) is left alone: no read, its requests untouched', async ($, on) => {
      const world = worldOf(on)
      world.files['/repo/.claude/agents/scout.md'] = '---\nname: scout\nmodel: haiku\n---\nSearch things.'
      await $.session.start(STARTED)
      await atHigh($, world)
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
      const world = worldOf(on)
      world.denySpawn = 'no agents here'
      await $.session.start(STARTED)
      const result = await $.agent.spawn({ tool_use_id: 't', prompt: 'search', description: 'd', subagentType: 'Explore', parentModel: 'claude-sonnet-5-5', background: true, fork: false } as never)
      expect(result.deny).toBe('no agents here')
      expect(world.subagentReads).toHaveLength(1)
      expect(await route($, 'status')).not.toContain('Recent subagents')
    })
  })

  describe("subagents whose definition sets an effort", () => {
    const def = (name: string, effort?: string) =>
      `---\nname: ${name}\ndescription: test agent\n${effort ? `effort: ${effort}\n` : ''}tools: Read, Grep\n---\n\nYou are a test agent.\n`

    test('a user definition with effort: no read, requests left to the engine, status says so', async ($, on) => {
      const world = worldOf(on, HIGH, {}, HOME)
      world.files['/home/t/.claude/agents/effort-probe-low.md'] = def('effort-probe-low', 'low')
      await $.session.start(STARTED)
      await atHigh($, world)
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
      const world = worldOf(on, HIGH, {}, HOME)
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
      const world = worldOf(on, HIGH, {}, HOME)
      world.files['/home/t/.claude/agents/searcher.md'] = def('searcher')
      await $.session.start(STARTED)
      const id = await spawn($, { subagentType: 'searcher', prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(1)
      await step($, 0, id)
      expect(world.sent).toEqual(['low'])
    })

    test("a file is matched by its frontmatter name, not its file name; definitions are scanned once", async ($, on) => {
      const world = worldOf(on, HIGH, {}, HOME)
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
      const world = worldOf(on, HIGH, sources, HOME)
      await $.session.start(STARTED)
      const id = await spawn($, { subagentType: 'auditor', description: 'Audit', prompt: 'audit it' })
      expect(world.subagentReads).toHaveLength(0)
      await step($, 0, id)
      expect(world.sent).toEqual(['medium'])
      expect(await route($, 'status')).toContain('  xhigh: Audit (set by its agent definition)')
    })

    test("a plugin's agent is not looked up: it is routed", async ($, on) => {
      const world = worldOf(on, HIGH, {}, HOME)
      world.files['/home/t/.claude/agents/probe-low.md'] = def('probe-low', 'low')
      await $.session.start(STARTED)
      await spawn($, { subagentType: 'subagent-probe:probe-low', prompt: 'search for X' })
      expect(world.subagentReads).toHaveLength(1)
    })
  })

  // --- the spend report -----------------------------------------------------------------

  describe('the spend report', () => {

    test('records each request with the level it arrived at and went out at, and the router reads; saved when a turn ends', async ($, on) => {
      const world = worldOf(on, HIGH, {}, HOME)
      world.usage = 1000
      await $.session.start(STARTED)
      await submit($, 'fix the crash in the parser')
      await step($, 0) // arrives medium (the picker), goes out high
      const id = await spawn($, { description: 'Find usages', prompt: 'find every caller of parseConfig' })
      await step($, 0, id) // arrives medium, the brief says low
      expect(world.sent).toEqual(['high', 'low'])
      const report = await route($, 'report session')
      expect(report).toContain('Effort for this session: 2 requests, 2.0k output tokens.')
      expect(report).toContain('  main conversation, medium → high: 1 request, 1.0k output tokens (avg 1.0k)')
      expect(report).toContain('  subagents, medium → low: 1 request, 1.0k output tokens (avg 1.0k)')
      expect(report).toContain("The router's own assessments: 2 (1 of a first prompt, 1 for subagents),")
      const before = world.written.length // the state, written as it changed
      await done($)
      expect(world.written).toHaveLength(before + 1)
      const saved = JSON.parse(world.files[LEDGER] ?? '{}')
      expect(saved.rows.map((r: { caller: string; from: string; to: string; requests: number }) => `${r.caller} ${r.from}→${r.to} ×${r.requests}`)).toEqual(['main medium→high ×1', 'subagent medium→low ×1'])
      await done($)
      expect(world.written).toHaveLength(before + 1) // nothing new: not written again
    })

    test('a session carries on from its saved ledger; the week reads every saved session', async ($, on) => {
      const world = worldOf(on, UNCLEAR, {}, HOME)
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
      const world = worldOf(on, UNCLEAR)
      world.usage = 10
      await $.session.start(STARTED)
      await step($, 0)
      await done($)
      expect(world.written).toEqual([])
      expect(await route($, 'report')).toContain('1 request in 1 session, 10 output tokens.')
    })
  })
})
