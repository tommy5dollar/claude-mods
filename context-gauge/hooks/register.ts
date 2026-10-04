import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  breakdownText,
  type Gauge,
  gaugeOf,
  isSameGauge,
  type Site,
  siteOf,
  type Thresholds,
  thresholdsOf,
} from './gauge'

/** The slash command that prints the token breakdown. */
const COMMAND = 'ctx'

/**
 * What the gauge draws now; undefined draws nothing. Module state: it lasts
 * until the module reloads, and the next measurement or refresh refills it.
 */
let gauge: Gauge | undefined

/**
 * Takes a new reading and redraws only when the drawing changes.
 *
 * @param $ the engine
 * @param next the new gauge, or undefined to draw nothing
 * @param site where the gauge draws
 */
function show($: EngineInterface, next: Gauge | undefined, site: Site): void {
  if (isSameGauge(gauge, next)) return
  gauge = next

  if (site === 'status') {
    $.ui.status(gauge?.text)
  } else {
    void $.ui.invalidate('ui.render')
  }
}

/**
 * Reads the live figures from the engine and shows them; on failure shows
 * nothing.
 *
 * @param $ the engine
 * @param thresholds where the colour changes
 * @param site where the gauge draws
 */
async function refresh($: EngineInterface, thresholds: Thresholds, site: Site): Promise<void> {
  try {
    const usage = await $.session.usage()
    show($, gaugeOf(usage?.context, thresholds), site)
  } catch {
    show($, undefined, site)
  }
}

/**
 * Registers context-gauge: a coloured `ctx NN%` in the prompt footer, kept
 * current from `session.measure`, plus `/ctx` for the breakdown.
 *
 * Every hook fails open: on any error it passes the event on untouched and
 * the gauge shows nothing rather than a wrong number.
 *
 * @param on the engine's registrar
 * @param options `yellowAt`, `redAbove` (percent) and `site`
 */
export function register(on: On, options: PluginOptions): void {
  const thresholds = thresholdsOf(options)
  const site = siteOf(options.site)

  on('session.start', async ($, e, next) => {
    void refresh($, thresholds, site)
    void $.command
      .register({
        name: COMMAND,
        description: 'Context window usage, by category',
        immediate: true,
      })
      .catch(() => undefined)

    return next(e)
  })

  // Pushed after each main-thread turn; `changed` says whether the fill moved.
  on('session.measure', ($, e, next) => {
    if (e.changed.includes('context')) {
      show($, gaugeOf(e.context, thresholds), site)
    }

    return next(e)
  })

  // Fires at startup, after /clear, /resume, /branch and after compaction:
  // the window's reading is reset or gone, so read it again (usually nothing
  // until the next response, which session.measure then reports).
  on('classic.SessionStart', ($, e, next) => {
    void refresh($, thresholds, site)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    try {
      const usage = await $.session.usage({ breakdown: 'summary' })

      return { text: breakdownText(usage.context, thresholds) }
    } catch {
      return { text: 'ctx: usage is not available here.' }
    }
  })

  if (site === 'status') return

  if (site === 'footer') {
    // The dim mode labels at the right of the prompt footer. Raised on the
    // terminal and Desktop surfaces in both the 2.1.277 types and the docs.
    on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
      if (!gauge) return next(e)

      const { Box, Text } = await $.ui.resolve(e)
      const mine = Text({ color: gauge.color, children: [gauge.text] })

      if (e.props.modes.length === 0) return mine

      return Box({ flexDirection: 'row', columnGap: 1, children: [await next(e), mine] })
    })
  }

  if (site === 'hint') {
    on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
      if (!gauge) return next(e)

      const { Box, Text } = await $.ui.resolve(e)

      return Box({
        flexDirection: 'row',
        columnGap: 2,
        children: [await next(e), Text({ color: gauge.color, children: [gauge.text] })],
      })
    })
  }

  if (site === 'band') {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      if (!gauge || e.props.hasSurvey) return next(e)

      const { Box, Text } = await $.ui.resolve(e)

      return Box({
        flexDirection: 'column',
        children: [Text({ color: gauge.color, children: [gauge.text] }), await next(e)],
      })
    })
  }
}
