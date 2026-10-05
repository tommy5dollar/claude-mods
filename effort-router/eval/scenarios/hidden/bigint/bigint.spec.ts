// Hidden from the session. Copied into the repo after the run to grade it. "Change every amount to a bigint without
// changing any output, so we can hold amounts above 2^53": every CLI output byte for byte as before (snapshots of the
// untouched repo, bugs and all), amounts stored as bigints, and an amount above 2^53 carried exactly.
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import snapshots from './snapshots.json'
import { exportJson } from '../src/exporters/json'
import { formatMoney } from '../src/money'
import { buildStatement } from '../src/statements'
import { transactions } from '../src/store'

describe('no output changes', () => {
  for (const [args, expected] of Object.entries(snapshots as Record<string, string>))
    test(args, () => {
      expect(spawnSync('bun', ['src/cli.ts', ...args.split(' ')], { encoding: 'utf8' }).stdout).toBe(expected)
    })
})

describe('amounts are bigints', () => {
  test('every stored amount', () => {
    expect(transactions.every(t => typeof t.amountMinor === 'bigint')).toBe(true)
  })
})

describe('above 2^53', () => {
  const huge = 9007199254740993n // 2^53 + 1 pence

  test('formatMoney is exact', () => {
    expect((formatMoney as (a: bigint, c: string) => string)(huge, 'GBP')).toBe('£90,071,992,547,409.93')
  })

  test('a statement total is exact', () => {
    transactions.push({ id: 'tx_huge', accountId: 'acc_gb', type: 'payment', amountMinor: huge, currency: 'GBP', createdAt: '2026-09-25T10:00:00Z', reference: 'HUGE' } as never)
    expect(buildStatement('acc_gb').totalFormatted.replace(/,/g, '')).toBe('£90071992549027.42')
    expect(exportJson('acc_gb')).toContain('90071992547409.93')
    transactions.pop()
  })
})
