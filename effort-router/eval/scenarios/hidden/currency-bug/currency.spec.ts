// Hidden from the session. Copied into the repo after the run to grade it. The reported bug is one account (JPY),
// the cause is amounts divided by 100 whatever the currency, and the same mistake is in the JSON export.
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { exportJson } from '../src/exporters/json'
import { buildStatement } from '../src/statements'

const plain = (s: string) => s.replace(/,/g, '')

describe('statement', () => {
  test('JPY amounts and total (the reported bug)', () => {
    const s = buildStatement('acc_jp')
    expect(s.lines.map(l => l.amount)).toEqual([1840000, -500, 362500, 98000])
    expect(s.total).toBe(2300000)
    expect(plain(s.totalFormatted)).toBe('¥2300000')
  })

  test('BHD amounts and total (three decimal places)', () => {
    const s = buildStatement('acc_bh')
    const amounts = s.lines.map(l => l.amount)
    expect(amounts[0]).toBeCloseTo(2750.125, 6)
    expect(amounts[1]).toBeCloseTo(-1.5, 6)
    expect(amounts[2]).toBeCloseTo(-300.05, 6)
    expect(s.total).toBeCloseTo(2448.575, 6)
    expect(plain(s.totalFormatted)).toBe('BD 2448.575')
  })

  test('GBP still right', () => {
    const s = buildStatement('acc_gb')
    expect(s.total).toBeCloseTo(1617.49, 6)
    expect(plain(s.totalFormatted)).toBe('£1617.49')
  })
})

describe('JSON export (the same bug in a second place)', () => {
  test('JPY amounts', () => {
    const rows = JSON.parse(exportJson('acc_jp')).transactions
    expect(rows.map((r: { amount: number }) => r.amount)).toEqual([1840000, -500, 362500, 98000])
  })

  test('BHD amounts', () => {
    const rows = JSON.parse(exportJson('acc_bh')).transactions
    expect(rows[0].amount).toBeCloseTo(2750.125, 6)
    expect(rows[2].amount).toBeCloseTo(-300.05, 6)
  })

  test('GBP still right', () => {
    const rows = JSON.parse(exportJson('acc_gb')).transactions
    expect(rows[0].amount).toBe(1250)
  })
})

describe('CLI', () => {
  test('the JPY statement prints the right closing total', () => {
    const out = spawnSync('bun', ['src/cli.ts', 'statement', 'acc_jp'], { encoding: 'utf8' }).stdout
    expect(plain(out)).toContain('Closing total: ¥2300000')
  })
})
