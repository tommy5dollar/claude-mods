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

const BUG_REPLY = '{"decision":"lock","level":"high","reason":"bug fix in existing code"}'

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
}

/** Answers every `$` call the mod makes, beneath it. */
function worldOf(on: On, reply = BUG_REPLY, sources: Record<string, unknown> = {}, env: Record<string, string> = {}): World {
  const clock = mock.clock(on)
  const world: World = { sent: [], efforts: [], lines: [], debug: [], classifierCalls: 0, reply, messages: [], prompts: [], toasts: [], clock, callsAtSubmit: [] }
  mock.store(on)
  mock.env(on, env)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.messages', () => ({ value: world.messages as never }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('model.complete', async ($, e) => {
    world.classifierCalls += 1
    world.prompts.push(e.prompt)
    if (world.reply === 'THROW') throw new Error('boom')
    if (world.reply === 'HANG') {
      await clock.sleep(60_000)
      return { value: { isAnswered: true, text: BUG_REPLY, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
    }
    return { value: { isAnswered: true, text: world.reply, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
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
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('settings.read', ($, e) => ({ value: (e.source ? sources[e.source] ?? {} : { effortLevel: 'medium' }) as never }))
  on('prompt.submit', ($, e) => {
    world.callsAtSubmit.push(world.classifierCalls)
    return { text: e.text }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { questions: QUESTIONS.questions, answers: {} }, text: ANSWERS }) as never)
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
  const headline = (await band.find({ type: 'Text', text: /^(Effort router: |Using )/ }))?.text
  const buttons = (await band.findAll({ type: 'Button' })).map(b => b.props.label as string)
  return { headline, buttons }
}

async function step($: Engine, index: number, agentId?: string): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index, model: 'claude-sonnet-5-5', effort: 'medium', messageCount: 3, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // drain
  }
}

async function submit($: Engine, text: string): Promise<void> {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
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
  test('apply (default): the read finishes before the turn, so its first request already carries the level', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)

    await step($, 0)
    expect(world.sent).toEqual(['medium']) // deciding: untouched

    await submit($, 'the checkout total is wrong when a coupon expires mid-session, fix it')
    expect(world.callsAtSubmit).toEqual([1]) // the classifier answered before prompt.submit went on
    await step($, 0)
    await step($, 0, 'agent-7')
    expect(world.sent.slice(-2)).toEqual(['high', 'high']) // index 0 of the triggering turn, and a subagent

    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('high?')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect(await bandOf(band)).toEqual({ headline: 'Using high — bug fix in existing code', buttons: ['Keep high', 'Revert to picker', 'Close'] })
    expect(world.debug.some(line => /read settled in \d+ ms \(after a prompt\): high/.test(line))).toBe(true)
  })

  test('apply: a re-read changes the provisional level at once and shows the band again; undecided keeps it', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'refactor the payment retry logic')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect((await bandOf(band)).headline).toBe('Using high — bug fix in existing code')
    await band.press({ key: 'close' })
    expect((await bandOf(band)).headline).toBeUndefined()

    world.messages = [
      { role: 'user', text: 'refactor the payment retry logic', toolUses: [] },
      { role: 'assistant', text: 'Two ways to do this: 1. a full rewrite with a state machine (complex) or 2. just extract the backoff constant (simple). Which?', toolUses: [] },
    ]
    world.reply = '{"decision":"lock","level":"low","reason":"small constant extraction"}'
    await submit($, '2')
    await step($, 0)
    expect(world.sent).toEqual(['low'])
    expect((await bandOf(band)).headline).toBe('Using low — small constant extraction') // shown again for the new level
    const prompt = world.prompts.at(-1) ?? ''
    expect(prompt).toContain('2. just extract the backoff constant (simple). Which?')
    expect(prompt).toContain('USER: 2')

    world.reply = '{"decision":"undecided"}'
    await submit($, 'thanks, go on')
    await step($, 1)
    expect(world.sent.at(-1)).toBe('low')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('low?')
  })

  test('apply: Keep locks, stops re-reading and syncs the picker at turn end', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await band.press({ key: 'lock' })
    expect((await bandOf(band)).headline).toBeUndefined()
    expect(world.lines).toContain('effort locked: high 🔒 (router: bug fix in existing code) · /route status')
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.efforts).toEqual(['high'])
    await submit($, 'now also add a test for it')
    expect(world.classifierCalls).toBe(1)
  })

  test('apply: Revert hands back to the picker level and turns the router off', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await band.press({ key: 'revert' })
    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('off')
    await submit($, 'and the lexer too')
    expect(world.classifierCalls).toBe(1)
  })

  test('apply: when the budget runs out while provisional, the level is locked with a log line', { options: { decideWithin: 2 } }, async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash')
    await submit($, 'it is in the parser')
    expect(world.classifierCalls).toBe(2)
    expect(world.lines).toContain('effort locked: high 🔒 (kept after 2 prompts; router: bug fix in existing code) · /route status')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('high 🔒')
    await submit($, 'any news?')
    expect(world.classifierCalls).toBe(2)
    await step($, 0)
    expect(world.sent).toEqual(['high'])
  })

  test('a classifier that does not answer within classifyTimeoutMs fails open', async ($, on) => {
    const world = worldOf(on, 'HANG')
    await $.session.start(STARTED)
    const submitting = submit($, 'fix the crash in the parser')
    await world.clock.advance(8000)
    await submitting
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(await route($, 'status')).toContain('classifier timed out after 8000 ms; the turn went ahead at the current level')
    await world.clock.advance(60_000) // the late answer is ignored
    await settle($)
    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium')
  })

  test('nothing suggested within the budget: no more Haiku calls, the router turns off', { options: { decideWithin: 3 } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    for (const text of ['hi', 'pull the latest', 'look around']) await submit($, text)
    expect(world.classifierCalls).toBe(3)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('off')
    expect(await route($, 'status')).toContain('no clear task after 3 prompts — /route to ask again')
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
    expect(world.classifierCalls).toBe(0)
    expect((await bandOf(band)).headline).toBeUndefined()
    expect(world.toasts).toEqual([])
    expect(await route($, 'status')).toStartWith('off (existing session — /route to ask)')
    expect(await route($)).toContain('using high now')
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
    expect(await route($, 'status')).toMatch(/Last read sent \d+ of \d+ transcript chars \(cap 2000; \d+ messages left out\)\./)
  })

  test('confirm: nothing is applied until Accept; a re-read can change or withdraw the suggestion', { options: { consent: 'confirm' } }, async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'the checkout total is wrong when a coupon expires mid-session, fix it')
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: high? — bug fix in existing code', buttons: ['Accept high', 'Turn off', 'Close'] })
    await step($, 0)
    expect(world.sent).toEqual(['medium'])

    world.reply = '{"decision":"lock","level":"low","reason":"small fix"}'
    await submit($, 'actually just the typo')
    expect((await bandOf(band)).headline).toBe('Effort router: low? — small fix')
    world.reply = '{"decision":"undecided"}'
    await submit($, 'hmm, let me think')
    expect((await bandOf(band)).headline).toBeUndefined()

    world.reply = BUG_REPLY
    await submit($, 'ok fix the coupon bug')
    await band.press({ key: 'accept' })
    await step($, 1)
    expect(world.sent.at(-1)).toBe('high')
    expect(await route($, 'status')).toContain('Consent: confirm.')
  })

  test('EFFORT_ROUTER_CONSENT overrides consent; the 0.5 name "band" means confirm', async ($, on) => {
    const world = worldOf(on, BUG_REPLY, {}, { EFFORT_ROUTER_CONSENT: 'band' })
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(await route($, 'status')).toContain('Consent: confirm.')
  })

  test('manual /route with a hint: reaches the classifier prompt, ignores the budget, works when off', { options: { decideWithin: 1 } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    await submit($, 'hi')
    expect(await route($, 'status')).toContain('off (no clear task after 1 prompts')

    expect(await route($, 'not sure yet')).toContain('no clear task yet, even with your hint')
    expect(world.toasts.at(-1)).toContain('no clear task yet')
    expect(await route($, 'status')).toStartWith('off')

    world.reply = '{"decision":"lock","level":"max","reason":"security review"}'
    expect(await route($, 'this is a security review')).toContain('using max now')
    expect(world.prompts.at(-1)).toContain('<user_hint>\nthis is a security review\n</user_hint>')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('max?')
    expect(await route($, 'status')).toContain('Hint: this is a security review')
  })

  test('manual /route while locked: a different level offers a switch; the same level confirms', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    world.messages = [{ role: 'user', text: 'fix the crash in the parser', toolUses: [] }]
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await band.press({ key: 'lock' })

    expect(await route($)).toContain('confirmed: high 🔒 still fits')

    world.reply = '{"decision":"lock","level":"low","reason":"quick follow-up"}'
    expect(await route($, 'keep it quick')).toContain('a switch to low is on offer')
    expect(await bandOf(band)).toEqual({
      headline: 'Effort router: high 🔒 → low? — switch to low: quick follow-up',
      buttons: ['Accept low', 'Keep high', 'Turn off', 'Close'],
    })
    await step($, 0)
    expect(world.sent.at(-1)).toBe('high')
    await band.press({ key: 'accept' })
    await step($, 1)
    expect(world.sent.at(-1)).toBe('low')
  })

  test('answers to AskUserQuestion: read before the tool result returns, counted, answers in the prompt', { options: { decideWithin: 3 } }, async ($, on) => {
    const world = worldOf(on, '```json\n{"decision":"undecided"}\n```')
    await $.session.start(STARTED)
    world.messages = [{ role: 'user', text: 'pull latest code', toolUses: [] }]
    await submit($, 'implement for me a new finance solution pulling from multiple accountancy platforms')
    expect(world.classifierCalls).toBe(1)

    world.messages = [
      { role: 'user', text: 'pull latest code', toolUses: [] },
      { role: 'user', text: 'implement for me a new finance solution pulling from multiple accountancy platforms', toolUses: [] },
      { role: 'assistant', text: 'A couple of questions first.', toolUses: [{ tool: 'AskUserQuestion', tool_use_id: 'q1', input: QUESTIONS } as never] },
    ]
    world.reply = '{"decision":"lock","level":"high","reason":"multi-platform finance integration"}'
    await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', ...QUESTIONS } as never)
    expect(world.classifierCalls).toBe(2) // awaited: done when the tool result came back
    const prompt = world.prompts.at(-1) ?? ''
    expect(prompt).toContain('ASSISTANT asked: Which platforms? [options: Xero | QuickBooks]')
    expect(prompt).toContain('USER answered: User has answered your questions: "Which platforms?"="Xero, QuickBooks"')
    await step($, 3)
    expect(world.sent).toEqual(['high'])

    await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q2', agentId: 'agent-1', ...QUESTIONS } as never)
    expect(world.classifierCalls).toBe(2) // a subagent's question is not the user's turn

    const status = await route($, 'status')
    expect(status).toContain('Automatic reads: 2 of 3 used.')
    expect(status).toContain('Consent: apply.')
    expect(status).toMatch(/Classifier calls this session: 2\. Last read took \d+ ms\./)
    expect(status).toMatch(/Last verdict \(after answered questions, \d+s ago\): high \(multi-platform finance integration\)\. Raw: \{"decision":"lock"/)
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

  test('consent none: locks at once and syncs the picker at turn end', { options: { consent: 'none' } }, async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.efforts).toEqual(['high'])
  })

  test('/route commands: status, off, on, rules; decide is bare /route; no level-setting', async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    world.messages = [{ role: 'user', text: 'hi', toolUses: [] }]
    expect(await route($, 'status')).toContain('deciding.')
    expect(await route($, 'off')).toContain('router off')
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(await route($, 'on')).toContain('router on: deciding')
    expect(await route($, 'on')).toContain('already on')
    const calls = world.classifierCalls
    expect(await route($, 'decide')).toContain('no clear task yet;')
    expect(world.classifierCalls).toBe(calls + 1)
    expect(await route($, 'rules')).toContain('base: shipped defaults')
  })

  test("footer: a plain button that opens the band with the state's actions", async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ ...STARTED, surface: 'desktop' })
    world.messages = [{ role: 'user', text: 'fix the crash in the parser', toolUses: [] }]
    for (const surface of ['terminal', 'desktop'] as const) {
      const footer = await $.ui.mount({ plugin: 'effort-router', surface, ...FOOTER } as never)
      const state = await footerOf(footer)
      expect(state.type).toBe('Button')
      expect(state.shown).toBe('deciding')
      expect(await footer.find({ type: 'Select' })).toBeUndefined()
      await footer.unmount()
    }
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...BAND } as never)
    expect((await bandOf(band)).headline).toBeUndefined()

    await footer.press({ key: 'route-state' })
    let shown = await bandOf(band)
    expect(shown.headline).toStartWith('Effort router: deciding — ')
    expect(shown.buttons).toEqual(['Suggest now', 'Turn off', 'Close'])
    await footer.press({ key: 'route-state' })
    expect((await bandOf(band)).headline).toBeUndefined()

    // Suggest now: the level is put in use and the band comes back with it
    await footer.press({ key: 'route-state' })
    await band.press({ key: 'suggest' })
    await settle($)
    expect(world.classifierCalls).toBe(1)
    expect((await footerOf(footer)).shown).toBe('high?')
    expect(await bandOf(band)).toEqual({ headline: 'Using high — bug fix in existing code', buttons: ['Keep high', 'Revert to picker', 'Close'] })

    // Close: stays provisional; the footer reopens it with Suggest now too
    await band.press({ key: 'close' })
    expect((await bandOf(band)).headline).toBeUndefined()
    expect((await footerOf(footer)).shown).toBe('high?')
    await footer.press({ key: 'route-state' })
    expect((await bandOf(band)).buttons).toEqual(['Keep high', 'Revert to picker', 'Suggest now', 'Close'])

    // Keep: locks and closes
    await band.press({ key: 'lock' })
    expect((await bandOf(band)).headline).toBeUndefined()
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    expect((await footerOf(footer)).shown).toBe('high 🔒')
    await footer.press({ key: 'route-state' })
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: high 🔒 — router: bug fix in existing code', buttons: ['Suggest now', 'Turn off', 'Close'] })

    await band.press({ key: 'off' })
    expect((await bandOf(band)).headline).toBeUndefined()
    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium')
    expect((await footerOf(footer)).shown).toBe('off')
    await footer.press({ key: 'route-state' })
    expect(await bandOf(band)).toEqual({ headline: 'Effort router: off — the effort picker decides', buttons: ['Turn on', 'Close'] })

    await band.press({ key: 'on' })
    expect((await bandOf(band)).headline).toBeUndefined()
    expect((await footerOf(footer)).shown).toBe('deciding')
  })

  test('footerControl: label draws plain text', { options: { footerControl: 'label' } }, async ($, on) => {
    worldOf(on)
    await $.session.start({ ...STARTED, surface: 'desktop' })
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    expect(await footer.find({ type: 'Button' })).toBeUndefined()
    expect((await footer.find({ text: /deciding/ }))?.text).toBe('deciding')
  })

  test('headless (-p): applies via turn.step but never runs /effort', async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await submit($, 'fix the crash in the parser')
    await step($, 0)
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.sent).toEqual(['high'])
    expect(world.efforts).toEqual([])
  })

  test('org layer: enforce is final; allowOff false hides Turn off and Revert; a spent budget idles as deciding', { options: { decideWithin: 1 } }, async ($, on) => {
    const sources = {
      policy: { pluginConfigs: { 'effort-router@tommy-mods': { options: { rules: '$defaults\nORG: payments code, never below high', rulesMode: 'enforce', allowOff: false } } } },
      user: { pluginConfigs: { 'effort-router': { options: { rules: 'USER REPLACES EVERYTHING' } } } },
    }
    const world = worldOf(on, '{"decision":"undecided"}', sources)
    await $.session.start(STARTED)
    const rules = await route($, 'rules')
    expect(rules).toContain('spliced: policy settings (managed)')
    expect(rules).toContain('ORG: payments code, never below high')
    expect(rules).not.toContain('USER REPLACES')
    expect(rules).toContain('organisation enforces')
    expect(await route($, 'off')).toContain('allowOff: false')
    expect(await route($, 'rules init')).toContain('enforces its routing rules')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await footer.press({ key: 'route-state' })
    expect((await bandOf(band)).buttons).toEqual(['Suggest now', 'Close'])
    await band.press({ key: 'close' })

    await submit($, 'hi')
    await submit($, 'hello?')
    expect(world.classifierCalls).toBe(1)
    expect((await footerOf(footer)).shown).toBe('deciding')
    expect(await route($, 'status')).toContain('Automatic reads stopped')

    world.reply = BUG_REPLY
    world.messages = [{ role: 'user', text: 'fix the crash in the parser', toolUses: [] }]
    await route($)
    expect((await bandOf(band)).buttons).toEqual(['Keep high', 'Close'])
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
    expect(rules).toContain('spliced: user settings (pluginConfigs option)')
  })
})
