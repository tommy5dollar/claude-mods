// Integration tests under the engine's own kit: `claude plugin test .`
import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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
}

/** Answers every `$` call the mod makes, beneath it. */
function worldOf(on: On, reply = BUG_REPLY, sources: Record<string, unknown> = {}): World {
  const world: World = { sent: [], efforts: [], lines: [], debug: [], classifierCalls: 0, reply, messages: [{ role: 'user', text: 'pull the latest code', toolUses: [] }], prompts: [], toasts: [] }
  mock.store(on)
  mock.clock(on)
  mock.env(on, {})
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.messages', () => ({ value: world.messages as never }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('model.complete', ($, e) => {
    world.classifierCalls += 1
    world.prompts.push(e.prompt)
    if (world.reply === 'THROW') throw new Error('boom')
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
  on('prompt.submit', ($, e) => ({ text: e.text }))
  return world
}

/** The footer's closed dropdown: the selected option's label, and every label. */
async function footerOf(footer: { find: (q: { key: string }) => Promise<{ type: string; props: Record<string, unknown>; text: string } | undefined> }) {
  const found = await footer.find({ key: 'route-state' })
  const options = (found?.props.options ?? []) as { value: string; label?: string }[]
  const selected = options.find(o => o.value === found?.props.value)
  return { type: found?.type, shown: selected?.label, labels: options.map(o => o.label), text: found?.text }
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

/** Lets the detached classification settle. */
async function settle(_: Engine): Promise<void> {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

describe('effort-router', () => {
  test('consent band: suggests, Accept locks, every later request and subagent runs at the lock', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)

    await step($, 0)
    expect(world.sent).toEqual(['medium']) // deciding: untouched

    await submit($, 'the checkout total is wrong when a coupon expires mid-session, fix it')
    await settle($)
    expect(world.classifierCalls).toBe(1)

    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect((await band.find({ text: /Route this session at/ }))?.text).toContain('HIGH')
    expect((await band.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['Accept high', 'Turn off'])

    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium') // pending, not yet locked

    await band.press({ key: 'accept' })
    expect(await band.find({ text: /Route this session at/ })).toBeUndefined()

    await step($, 2)
    await step($, 0, 'agent-7')
    expect(world.sent.slice(-2)).toEqual(['high', 'high'])
    expect(world.lines).toContain('effort locked: high 🔒 (router: bug fix in existing code) · /route status')

    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('high 🔒')

    await submit($, 'now also add a test for it')
    await settle($)
    expect(world.classifierCalls).toBe(1) // locked: no more automatic reads
  })

  test('a pending suggestion is re-read after each prompt: "do X" → high?, then "2" (simple) → low?', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    world.messages = []
    await submit($, 'refactor the payment retry logic')
    await settle($)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('high?')

    world.messages = [
      { role: 'user', text: 'refactor the payment retry logic', toolUses: [] },
      { role: 'assistant', text: 'Two ways to do this: 1. a full rewrite with a state machine (complex) or 2. just extract the backoff constant (simple). Which?', toolUses: [] },
    ]
    world.reply = '{"decision":"lock","level":"low","reason":"small constant extraction"}'
    await submit($, '2')
    await settle($)
    expect((await footerOf(footer)).shown).toBe('low?')
    const prompt = world.prompts.at(-1) ?? ''
    expect(prompt).toContain('2. just extract the backoff constant (simple). Which?') // the question is there to read "2" against
    expect(prompt).toContain('USER: 2')

    // and a re-read that finds nothing clear withdraws the suggestion
    world.reply = '{"decision":"undecided"}'
    await submit($, 'hmm, wait, let me think about what I actually want')
    await settle($)
    expect((await footerOf(footer)).shown).toBe('deciding')
  })

  test('the decision budget: no Haiku calls after decideWithin prompts; nothing suggested → off', { options: { decideWithin: 3 } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    for (const text of ['hi', 'pull the latest', 'look around']) {
      await submit($, text)
      await settle($)
    }
    expect(world.classifierCalls).toBe(3)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('off')
    expect(await route($, 'status')).toContain('no clear task after 3 prompts — /route to ask again')
    for (const text of ['more', 'and more']) {
      await submit($, text)
      await settle($)
    }
    expect(world.classifierCalls).toBe(3)
  })

  test('the budget with a suggestion pending: it stays pending and reads stop', { options: { decideWithin: 2 } }, async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash')
    await settle($)
    await submit($, 'it is in the parser')
    await settle($)
    await submit($, 'any news?')
    await settle($)
    expect(world.classifierCalls).toBe(2)
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('high?')
  })

  test('manual /route with a hint: reaches the classifier prompt, ignores the budget, works when gave up / off', { options: { decideWithin: 1 } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
    await submit($, 'hi')
    await settle($)
    expect(await route($, 'status')).toContain('off (no clear task after 1 prompts')

    // undecided even with a hint: says so, stays as is
    expect(await route($, 'not sure yet')).toContain('no clear task yet, even with your hint')
    expect(world.toasts.at(-1)).toContain('no clear task yet')
    expect(await route($, 'status')).toStartWith('off')

    world.reply = '{"decision":"lock","level":"max","reason":"security review"}'
    expect(await route($, 'this is a security review')).toContain('suggesting max')
    expect(world.prompts.at(-1)).toContain('<user_hint>\nthis is a security review\n</user_hint>')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('max?')
    expect(await route($, 'status')).toContain('Hint: this is a security review')
  })

  test('manual /route while locked: a different level offers a switch; the same level confirms', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await settle($)
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await band.press({ key: 'accept' })

    expect(await route($)).toContain('confirmed: high 🔒 still fits')

    world.reply = '{"decision":"lock","level":"low","reason":"quick follow-up"}'
    expect(await route($, 'keep it quick')).toContain('a switch to low is on offer')
    expect((await band.find({ text: /Switch from HIGH to/ }))?.text).toContain('LOW')
    await step($, 0)
    expect(world.sent.at(-1)).toBe('high') // still locked until accepted
    await band.press({ key: 'accept' })
    await step($, 1)
    expect(world.sent.at(-1)).toBe('low')
  })

  test('consent none: locks at once and syncs the picker at turn end', { options: { consent: 'none' } }, async ($, on) => {
    const world = worldOf(on)
    await $.session.start(STARTED)
    await submit($, 'fix the crash in the parser')
    await settle($)
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.efforts).toEqual(['high'])
  })

  test('/route commands: status, off, on, rules; decide is bare /route; no level-setting', async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start(STARTED)
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

  test('footer: a dropdown on terminal and desktop; Accept, Suggest now, Turn off, Turn on', async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ ...STARTED, surface: 'desktop' })
    for (const surface of ['terminal', 'desktop'] as const) {
      const footer = await $.ui.mount({ plugin: 'effort-router', surface, ...FOOTER } as never)
      const state = await footerOf(footer)
      expect(state.type).toBe('Select')
      expect(state.labels).toEqual(['deciding', 'Suggest now', 'Turn off'])
      await footer.unmount()
    }
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)

    await (footer as any).select({ key: 'route-state', value: 'suggest' })
    expect(world.classifierCalls).toBe(1)
    let shown = await footerOf(footer)
    expect(shown.shown).toBe('high?')
    expect(shown.labels).toEqual(['high?', 'Accept high', 'Suggest now', 'Turn off'])

    await (footer as any).select({ key: 'route-state', value: 'accept' })
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    expect((await footerOf(footer)).labels).toEqual(['high 🔒', 'Suggest now', 'Turn off'])

    await (footer as any).select({ key: 'route-state', value: 'off' })
    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium')
    shown = await footerOf(footer)
    expect(shown.shown).toBe('off')
    expect(shown.labels).toEqual(['off', 'Suggest now', 'Turn on'])

    await (footer as any).select({ key: 'route-state', value: 'on' })
    expect((await footerOf(footer)).shown).toBe('deciding')
  })

  test('footerControl: label draws plain text', { options: { footerControl: 'label' } }, async ($, on) => {
    worldOf(on)
    await $.session.start({ ...STARTED, surface: 'desktop' })
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    expect(await footer.find({ type: 'Select' })).toBeUndefined()
    expect((await footer.find({ text: /deciding/ }))?.text).toBe('deciding')
  })

  test('headless (-p): locks via turn.step but never runs /effort', { options: { consent: 'none' } }, async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await submit($, 'fix the crash in the parser')
    await settle($)
    await step($, 0)
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.sent).toEqual(['high'])
    expect(world.efforts).toEqual([])
  })

  test('org layer: enforce is final; allowOff false hides Turn off and a spent budget idles as deciding', { options: { decideWithin: 1 } }, async ($, on) => {
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
    expect((await footerOf(footer)).labels).toEqual(['deciding', 'Suggest now'])

    await submit($, 'hi')
    await settle($)
    await submit($, 'hello?')
    await settle($)
    expect(world.classifierCalls).toBe(1)
    expect((await footerOf(footer)).shown).toBe('deciding')
    expect(await route($, 'status')).toContain('Automatic reads stopped')
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

  test('a classifier that throws fails open', { options: { consent: 'none' } }, async ($, on) => {
    const world = worldOf(on, 'THROW')
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await submit($, 'fix the crash in the parser')
    await settle($)
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
  })
})
