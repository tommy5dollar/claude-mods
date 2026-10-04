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
}

/** Answers every `$` call the mod makes, beneath it. */
function worldOf(on: On, reply = BUG_REPLY, sources: Record<string, unknown> = {}): World {
  const world: World = { sent: [], efforts: [], lines: [], debug: [], classifierCalls: 0, reply }
  mock.store(on)
  mock.clock(on)
  mock.env(on, {})
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'pull the latest code', toolUses: [] }] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('model.complete', () => {
    world.classifierCalls += 1
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

/** Lets the detached classification settle. */
async function settle(_: Engine): Promise<void> {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

describe('effort-router', () => {
  test('consent band: proposes, a click locks, every later request and subagent runs at the lock', async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    await step($, 0)
    expect(world.sent).toEqual(['medium']) // undecided: untouched

    await submit($, 'the checkout total is wrong when a coupon expires mid-session, fix it')
    await settle($)
    expect(world.classifierCalls).toBe(1)

    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    expect((await band.find({ text: /Route this session at/ }))?.text).toContain('HIGH')
    expect(await band.findAll({ type: 'Button' })).toHaveLength(5)

    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium') // proposed, not yet locked

    await band.press({ key: 'lock-high' })
    expect(await band.find({ text: /Route this session at/ })).toBeUndefined() // band gone

    await step($, 2)
    await step($, 0, 'agent-7')
    expect(world.sent.slice(-2)).toEqual(['high', 'high'])
    expect(world.lines).toContain('effort fixed: high 🔒 (router: bug fix in existing code) · /route to change')

    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    expect((await footerOf(footer)).shown).toBe('high 🔒')

    // locked: no more classifier calls
    await submit($, 'now also add a test for it')
    await settle($)
    expect(world.classifierCalls).toBe(1)
  })

  test('band "Not now" snoozes and leaves effort alone', { options: { snoozePrompts: 2 } }, async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await submit($, 'fix the crash in the parser')
    await settle($)
    const band = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...BAND } as never)
    await band.press({ key: 'not-now' })
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    await submit($, 'still on it')
    await settle($)
    expect(world.classifierCalls).toBe(1) // snoozed
    await submit($, 'and again')
    await settle($)
    expect(world.classifierCalls).toBe(2) // snooze over
  })

  test('consent none: locks at once and syncs the picker at turn end', { options: { consent: 'none' } }, async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await submit($, 'fix the crash in the parser')
    await settle($)
    await step($, 0)
    expect(world.sent).toEqual(['high'])
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await settle($)
    expect(world.efforts).toEqual(['high'])
  })

  test('undecided reply keeps reading; filler never locks', { options: { consent: 'none' } }, async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await submit($, 'pull the latest code')
    await settle($)
    await step($, 0)
    expect(world.sent).toEqual(['medium'])
    expect(world.classifierCalls).toBe(1)
  })

  test('/route commands: show, fix, off, decide, old aliases, rules', async ($, on) => {
    const world = worldOf(on, '{"decision":"undecided"}')
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    expect((await $.command.run({ command: 'route' } as never)).text).toContain('medium · deciding.')
    expect((await $.command.run({ command: 'route', args: 'fix max' } as never)).text).toContain('max 🔒')
    await step($, 0)
    expect(world.sent).toEqual(['max'])
    expect((await $.command.run({ command: 'route' } as never)).text).toContain('max 🔒 (you chose max)')

    expect((await $.command.run({ command: 'route', args: 'off' } as never)).text).toContain('router off')
    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium')

    expect((await $.command.run({ command: 'route', args: 'decide' } as never)).text).toContain('deciding')
    expect((await $.command.run({ command: 'route', args: 'pin low' } as never)).text).toContain('low 🔒') // 0.1 alias
    expect((await $.command.run({ command: 'route', args: 'pin picker' } as never)).text).toContain('router off') // 0.1 alias
    expect((await $.command.run({ command: 'route', args: 'fix ultra' } as never)).text).toContain('usage: /route')
    expect((await $.command.run({ command: 'route', args: 'rules' } as never)).text).toContain('base: shipped defaults')
  })

  test('footer: the label is a dropdown on terminal and desktop; picking options changes state and label', async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
    for (const surface of ['terminal', 'desktop'] as const) {
      const footer = await $.ui.mount({ plugin: 'effort-router', surface, ...FOOTER } as never)
      const state = await footerOf(footer)
      expect(state.type).toBe('Select')
      expect(state.shown).toBe('medium · deciding')
      expect(state.labels).toEqual(['Low 🔒', 'Medium 🔒', 'High 🔒', 'XHigh 🔒', 'Max 🔒', 'medium · deciding', 'Router off'])
      await footer.unmount()
    }
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)

    // fix a level from the footer
    await (footer as any).select({ key: 'route-state', value: 'fix max' })
    await step($, 0)
    expect(world.sent).toEqual(['max'])
    expect((await footerOf(footer)).shown).toBe('max 🔒')
    expect((await footerOf(footer)).labels).toContain('Decide again')

    // router off
    await (footer as any).select({ key: 'route-state', value: 'off' })
    await step($, 1)
    expect(world.sent.at(-1)).toBe('medium')
    expect((await footerOf(footer)).shown).toBe('router off')
    expect((await footerOf(footer)).labels).toContain('Let the router decide')

    // back to deciding: the router reads at once and offers high; the footer offers Accept first
    await (footer as any).select({ key: 'route-state', value: 'decide' })
    await settle($)
    const offered = await footerOf(footer)
    expect(offered.shown).toBe('medium → high?')
    expect(offered.labels[0]).toBe('Accept high')
    await (footer as any).select({ key: 'route-state', value: 'accept' })
    await step($, 2)
    expect(world.sent.at(-1)).toBe('high')
    expect((await footerOf(footer)).shown).toBe('high 🔒')
    expect((await $.command.run({ command: 'route' } as never)).text).toContain('router: bug fix in existing code')
  })

  test('footerControl: label draws plain text', { options: { footerControl: 'label' } }, async ($, on) => {
    worldOf(on)
    await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'desktop', ...FOOTER } as never)
    expect(await footer.find({ type: 'Select' })).toBeUndefined()
    expect((await footer.find({ text: /deciding/ }))?.text).toBe('medium · deciding')
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

  test('org layer from policy settings: enforce is final, allowPin false stops fixing', async ($, on) => {
    const sources = {
      policy: { pluginConfigs: { 'effort-router@tommy-mods': { options: { rules: '$defaults\nORG: payments code, never below high', rulesMode: 'enforce', allowPin: false } } } },
      user: { pluginConfigs: { 'effort-router': { options: { rules: 'USER REPLACES EVERYTHING' } } } },
    }
    worldOf(on, BUG_REPLY, sources)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const rules = (await $.command.run({ command: 'route', args: 'rules' } as never)).text ?? ''
    expect(rules).toContain('spliced: policy settings (managed)')
    expect(rules).toContain('ORG: payments code, never below high')
    expect(rules).not.toContain('USER REPLACES')
    expect(rules).toContain('organisation enforces')
    expect((await $.command.run({ command: 'route', args: 'fix low' } as never)).text).toContain('allowPin: false')
    expect((await $.command.run({ command: 'route', args: 'rules init' } as never)).text).toContain('enforces its routing rules')
    const footer = await $.ui.mount({ plugin: 'effort-router', surface: 'terminal', ...FOOTER } as never)
    expect((await footerOf(footer)).labels).toEqual(['medium · deciding', 'Router off'])
  })

  test('without enforce, a user settings option layers over the org', async ($, on) => {
    const sources = {
      policy: { effortRouter: { rules: '$defaults\nORG' } },
      user: { pluginConfigs: { 'effort-router': { options: { rules: '$defaults\nUSER' } } } },
    }
    worldOf(on, BUG_REPLY, sources)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const rules = (await $.command.run({ command: 'route', args: 'rules' } as never)).text ?? ''
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
