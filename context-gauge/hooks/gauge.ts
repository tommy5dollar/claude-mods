/**
 * Pure logic for context-gauge: no `$`, no engine imports, so `bun test`
 * can exercise it directly.
 */

/** The three bands the gauge can show. */
export type Level = 'green' | 'yellow' | 'red'

/** What the gauge draws: its text and the colour to draw it in. */
export type Gauge = {
  /** Whole percent of the context window in use. */
  percent: number
  /** The label, e.g. `ctx 34%`. */
  text: string
  level: Level
  /** A Claude Code theme key, so it reads in light and dark themes. */
  color: string
}

/**
 * Where the colour changes. Green below `yellowAt`, yellow from `yellowAt`
 * up to and including `redAbove`, red above `redAbove`.
 */
export type Thresholds = {
  yellowAt: number
  redAbove: number
}

export const DEFAULT_THRESHOLDS: Thresholds = { yellowAt: 30, redAbove: 40 }

/**
 * Theme keys rather than raw colours: the terminal and Desktop map them to
 * the active theme, so yellow stays legible on a light background.
 */
export const COLORS: Readonly<Record<Level, string>> = {
  green: 'success',
  yellow: 'warning',
  red: 'error',
}

/** The subset of `SessionContextUsage` the gauge reads. */
export type ContextFigures = {
  tokens?: unknown
  window?: unknown
  percent?: unknown
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * The whole percent of the window in use, or undefined when the engine has
 * no reading yet (a fresh or just-compacted session) or the figures are
 * nonsense. Prefers the engine's own `percent`; falls back to tokens/window.
 */
export function percentOf(context: ContextFigures | undefined | null): number | undefined {
  if (!context || typeof context !== 'object') return undefined

  const { percent, tokens, window } = context

  if (isFiniteNumber(percent)) {
    return percent < 0 ? undefined : Math.round(percent)
  }

  if (isFiniteNumber(tokens) && isFiniteNumber(window) && window > 0 && tokens >= 0) {
    return Math.round((tokens / window) * 100)
  }

  return undefined
}

/**
 * Reads the thresholds from the plugin's options. Values may arrive as
 * numbers or as strings (typed into /config); anything unusable, or a pair
 * where yellow comes after red, falls back to the defaults.
 */
export function thresholdsOf(options: Readonly<Record<string, unknown>> | undefined): Thresholds {
  const read = (value: unknown, fallback: number): number => {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
    return isFiniteNumber(n) && n >= 0 && n <= 100 ? n : fallback
  }

  const yellowAt = read(options?.yellowAt, DEFAULT_THRESHOLDS.yellowAt)
  const redAbove = read(options?.redAbove, DEFAULT_THRESHOLDS.redAbove)

  return yellowAt <= redAbove ? { yellowAt, redAbove } : { ...DEFAULT_THRESHOLDS }
}

/** Which band a percent falls in. */
export function levelOf(percent: number, thresholds: Thresholds = DEFAULT_THRESHOLDS): Level {
  if (percent > thresholds.redAbove) return 'red'
  if (percent >= thresholds.yellowAt) return 'yellow'
  return 'green'
}

/**
 * The gauge for a context reading, or undefined to draw nothing. Showing
 * nothing beats showing a wrong number.
 */
export function gaugeOf(
  context: ContextFigures | undefined | null,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Gauge | undefined {
  const percent = percentOf(context)
  if (percent === undefined) return undefined

  const level = levelOf(percent, thresholds)

  return { percent, text: `ctx ${percent}%`, level, color: COLORS[level] }
}

/** Whether two gauges would draw the same thing. */
export const isSameGauge = (a: Gauge | undefined, b: Gauge | undefined): boolean =>
  a?.text === b?.text && a?.color === b?.color

/** The sites the gauge can draw in, by the `site` option's values. */
export type Site = 'footer' | 'hint' | 'band' | 'status'

export const SITES: readonly Site[] = ['footer', 'hint', 'band', 'status']

export function siteOf(value: unknown): Site {
  return SITES.find(site => site === value) ?? 'footer'
}

/** One row of the /context breakdown, as the gauge's command reads it. */
export type BreakdownRow = { name: string; tokens: number; kind: string }

const formatTokens = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(Math.round(n))

/**
 * The text the `/ctx` command prints: the headline figure, then the used
 * categories largest first. Free space, the compaction buffer and deferred
 * tool schemas are left out, as they do not fill the window.
 */
export function breakdownText(
  context: ContextFigures & { breakdown?: { categories?: readonly BreakdownRow[] } },
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): string {
  const gauge = gaugeOf(context, thresholds)

  if (!gauge) {
    return 'ctx: no reading yet (a fresh or just-compacted session has none until the next response).'
  }

  const head =
    isFiniteNumber(context.tokens) && isFiniteNumber(context.window)
      ? `${gauge.text} (${formatTokens(context.tokens)} of ${formatTokens(context.window)} tokens)`
      : gauge.text

  const rows = (context.breakdown?.categories ?? [])
    .filter(row => row.kind === 'used' && isFiniteNumber(row.tokens) && row.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)

  if (rows.length === 0) return head

  const width = Math.max(...rows.map(row => row.name.length))

  return [
    head,
    ...rows.map(row => `  ${row.name.padEnd(width)}  ${formatTokens(row.tokens)}`),
  ].join('\n')
}
