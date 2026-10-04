import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  breakdownText,
  estimatedGaugeOf,
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
 * Counts readings so a slow, older one (an estimate) never overwrites a newer
 * one (a measurement that landed meanwhile).
 */
let readings = 0

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
  const ticket = ++readings
  let next: Gauge | undefined
  try {
    const usage = await $.session.usage()
    next = gaugeOf(usage?.context, thresholds) ?? (await estimate($, thresholds))
  } catch {
    next = undefined
  }
  // A newer reading (a measurement) landed while this one was in flight.
  if (ticket === readings) show($, next, site)
}

/**
 * An estimate from a `summary` breakdown (local counts, no API call), for when
 * there is no live reading or the live one is stale (just after compaction).
 *
 * @param $ the engine
 * @param thresholds where the colour changes
 */
async function estimate($: EngineInterface, thresholds: Thresholds): Promise<Gauge | undefined> {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    return estimatedGaugeOf(usage?.context, thresholds)
  } catch {
    return undefined
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
      readings++
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

  // Compaction leaves the live reading stale or empty until the next response,
  // so the gauge would sit on the old figure. Estimate from the new transcript
  // as soon as compaction finishes.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const ticket = ++readings
      void estimate($, thresholds).then(estimated => {
        if (ticket === readings) show($, estimated, site)
      })
    }

    return result
  })

  // session.measure only fires when a whole turn ends. Re-read after each main
  // thread model request too, so the gauge moves during long tool loops.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined) void refresh($, thresholds, site)

    return result
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

      // Always run the rest of the chain: other mods (effort-router) draw in
      // this same footer, and returning early here would erase them.
      const theirs = await next(e)

      return Box({ flexDirection: 'row', columnGap: 1, children: theirs ? [theirs, mine] : [mine] })
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
