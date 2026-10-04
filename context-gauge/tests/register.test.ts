import type { On, SessionContextUsage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

/** The footer site with no engine modes, and with one. */
const FOOTER = { plugin: 'context-gauge', component: 'SessionMode', props: { modes: [] } } as const
const FOOTER_WITH_MODE = { ...FOOTER, props: { modes: ['focus'] } } as const

/**
 * The world beneath the mod: a session that starts, a usage reading, a
 * command registry, measurements, and the engine's own footer drawing.
 */
function world(on: On, context: SessionContextUsage): void {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', ($, e) => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context:
        e.breakdown === undefined
          ? context
          : {
              ...context,
              breakdown: {
                categories: [
                  { name: 'Messages', tokens: 50_000, kind: 'used' },
                  { name: 'System prompt', tokens: 3_000, kind: 'used' },
                  { name: 'Free space', tokens: 120_000, kind: 'free' },
                ],
              } as unknown as SessionContextUsage['breakdown'],
            },
    },
  }))
  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const { Text } = await $.ui.resolve(e)
    return Text({ dimColor: true, children: [e.props.modes.join(' & ')] })
  })
}

describe('register', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: footer shows ctx % coloured by band after a measurement`, async ($, on) => {
      world(on, { window: 200_000 })
      await $.session.start({ surface, isInteractive: true, cwd: '/work' })

      await $.session.measure({
        context: { tokens: 68_000, window: 200_000, percent: 34 },
        rateLimits: [],
        changed: ['context'],
      })
      const ui = await $.ui.mount({ ...FOOTER, surface })
      const found = await ui.find({ type: 'Text', text: '34%' })
      expect(found?.props.color).toBe('warning')
      await ui.unmount()
    })
  }

  test('no reading draws only the engine footer', async ($, on) => {
    world(on, { window: 200_000 })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    const ui = await $.ui.mount({ ...FOOTER_WITH_MODE, surface: 'terminal' })
    expect(await ui.find({ text: /ctx/ })).toBeUndefined()
    expect(await ui.find({ text: 'focus' })).toBeDefined()
    await ui.unmount()
  })

  test('session start reads the live usage; engine modes stay beside the gauge', async ($, on) => {
    world(on, { tokens: 20_000, window: 200_000, percent: 10 })
    const clock = mock.clock(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.settle() // let the start's background usage read land

    const ui = await $.ui.mount({ ...FOOTER_WITH_MODE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: '10%' }))?.props.color).toBe('success')
    expect(await ui.find({ text: 'focus' })).toBeDefined()
    await ui.unmount()
  })

  test('red above 40, percent computed when the engine gives none', async ($, on) => {
    world(on, { window: 200_000 })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    await $.session.measure({
      context: { tokens: 90_000, window: 200_000 },
      rateLimits: [],
      changed: ['context'],
    })
    const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: '45%' }))?.props.color).toBe('error')
    await ui.unmount()
  })

  test('/ctx prints the used categories', async ($, on) => {
    world(on, { tokens: 53_000, window: 200_000, percent: 27 })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    const { text } = await $.command.run({ command: 'ctx', args: '', origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })
    expect(text).toContain('Session context: 53k / 200k (27%)')
    expect(text).toContain('Messages')
    expect(text).not.toContain('Free space')
  })

  test('keeps other mods footer drawing when the engine has no modes', async ($, on) => {
    // another mod (effort-router) drawing beneath this one in the same footer
    on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
      const { Box, Text } = await $.ui.resolve(e)
      return Box({ children: [await next(e), Text({ children: ['auto · medium'] })] })
    })
    world(on, { tokens: 68_000, window: 200_000, percent: 34 })
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
    await $.session.measure({
      context: { tokens: 68_000, window: 200_000, percent: 34 },
      rateLimits: [],
      changed: ['context'],
    })
    const ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: '34%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'auto · medium' })).toBeDefined()
    await ui.unmount()
  })
})

