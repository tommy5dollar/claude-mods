import { describe, expect, test } from 'bun:test'

import {
  breakdownText,
  DEFAULT_THRESHOLDS,
  gaugeOf,
  isSameGauge,
  levelOf,
  percentOf,
  siteOf,
  thresholdsOf,
} from '../hooks/gauge'

describe('percentOf', () => {
  test('uses the engine percent, rounded', () => {
    expect(percentOf({ percent: 34, tokens: 1, window: 200_000 })).toBe(34)
    expect(percentOf({ percent: 33.6, window: 200_000 })).toBe(34)
  })

  test('falls back to tokens over window', () => {
    expect(percentOf({ tokens: 68_000, window: 200_000 })).toBe(34)
    expect(percentOf({ tokens: 0, window: 200_000 })).toBe(0)
  })

  test('unknown or nonsense figures give undefined', () => {
    expect(percentOf(undefined)).toBeUndefined()
    expect(percentOf(null)).toBeUndefined()
    expect(percentOf({ window: 200_000 })).toBeUndefined()
    expect(percentOf({ tokens: 5, window: 0 })).toBeUndefined()
    expect(percentOf({ tokens: Number.NaN, window: 200_000 })).toBeUndefined()
    expect(percentOf({ percent: -1 })).toBeUndefined()
    expect(percentOf({ percent: '34' })).toBeUndefined()
  })
})

describe('levelOf with the defaults (30, 40)', () => {
  test.each([
    [0, 'green'],
    [29, 'green'],
    [30, 'yellow'],
    [35, 'yellow'],
    [40, 'yellow'],
    [41, 'red'],
    [100, 'red'],
    [130, 'red'],
  ] as const)('%d%% is %s', (percent, level) => {
    expect(levelOf(percent)).toBe(level)
  })
})

describe('gaugeOf', () => {
  test('text and theme colour', () => {
    expect(gaugeOf({ percent: 12 })).toEqual({ percent: 12, text: 'ctx 12%', level: 'green', color: 'success' })
    expect(gaugeOf({ percent: 34 })).toEqual({ percent: 34, text: 'ctx 34%', level: 'yellow', color: 'warning' })
    expect(gaugeOf({ percent: 47 })).toEqual({ percent: 47, text: 'ctx 47%', level: 'red', color: 'error' })
  })

  test('nothing to show when there is no reading', () => {
    expect(gaugeOf({ window: 200_000 })).toBeUndefined()
  })

  test('custom thresholds', () => {
    expect(gaugeOf({ percent: 55 }, { yellowAt: 50, redAbove: 70 })?.level).toBe('yellow')
  })

  test('isSameGauge', () => {
    expect(isSameGauge(gaugeOf({ percent: 34 }), gaugeOf({ tokens: 68_000, window: 200_000 }))).toBe(true)
    expect(isSameGauge(gaugeOf({ percent: 34 }), gaugeOf({ percent: 35 }))).toBe(false)
    expect(isSameGauge(undefined, undefined)).toBe(true)
    expect(isSameGauge(undefined, gaugeOf({ percent: 1 }))).toBe(false)
  })
})

describe('thresholdsOf', () => {
  test('defaults when unset', () => {
    expect(thresholdsOf(undefined)).toEqual(DEFAULT_THRESHOLDS)
    expect(thresholdsOf({})).toEqual(DEFAULT_THRESHOLDS)
  })

  test('numbers and numeric strings', () => {
    expect(thresholdsOf({ yellowAt: 50, redAbove: '70' })).toEqual({ yellowAt: 50, redAbove: 70 })
  })

  test('bad values fall back per field; inverted pair falls back whole', () => {
    expect(thresholdsOf({ yellowAt: 'x', redAbove: 45 })).toEqual({ yellowAt: 30, redAbove: 45 })
    expect(thresholdsOf({ yellowAt: 150 })).toEqual(DEFAULT_THRESHOLDS)
    expect(thresholdsOf({ yellowAt: 60, redAbove: 40 })).toEqual(DEFAULT_THRESHOLDS)
  })
})

describe('siteOf', () => {
  test('known sites pass, anything else is footer', () => {
    expect(siteOf('band')).toBe('band')
    expect(siteOf('status')).toBe('status')
    expect(siteOf('nope')).toBe('footer')
    expect(siteOf(undefined)).toBe('footer')
  })
})

describe('breakdownText', () => {
  test('headline and used categories, largest first', () => {
    const text = breakdownText({
      tokens: 68_000,
      window: 200_000,
      percent: 34,
      breakdown: {
        categories: [
          { name: 'System prompt', tokens: 3_100, kind: 'used' },
          { name: 'Messages', tokens: 60_000, kind: 'used' },
          { name: 'Free space', tokens: 100_000, kind: 'free' },
          { name: 'Autocompact buffer', tokens: 30_000, kind: 'buffer' },
        ],
      },
    })
    expect(text).toBe(['ctx 34% (68k of 200k tokens)', '  Messages       60k', '  System prompt  3.1k'].join('\n'))
  })

  test('no reading', () => {
    expect(breakdownText({ window: 200_000 })).toContain('no reading yet')
  })
})
