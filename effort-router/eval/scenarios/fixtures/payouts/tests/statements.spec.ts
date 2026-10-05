import { describe, expect, test } from 'bun:test'
import { exportJson } from '../src/exporters/json'
import { formatMoney } from '../src/money'
import { buildStatement } from '../src/statements'
import { getTxns } from '../src/transactions'

describe('statements', () => {
  test('a GBP statement signs each movement and totals it', () => {
    const statement = buildStatement('acc_gb')
    expect(statement.lines.map(l => l.amount)).toEqual([1250, -2.5, 489.99, -120])
    expect(statement.totalFormatted).toBe('£1617.49')
  })

  test('filters by date', () => {
    expect(buildStatement('acc_gb', '2026-09-10', '2026-09-30').lines).toHaveLength(2)
  })
})

describe('transactions', () => {
  test('oldest first', () => {
    const ids = getTxns('acc_gb').map(t => t.id)
    expect(ids).toEqual(['tx_001', 'tx_002', 'tx_003', 'tx_004'])
  })
})

describe('export', () => {
  test('exports GBP amounts in pounds', () => {
    const parsed = JSON.parse(exportJson('acc_gb'))
    expect(parsed.transactions[0].amount).toBe(1250)
    expect(parsed.transactions[3].amount).toBe(-120)
  })
})

describe('formatMoney', () => {
  test('formats each currency with its own decimals', () => {
    expect(formatMoney(123456, 'GBP')).toBe('£1,234.56')
    expect(formatMoney(-500, 'JPY')).toBe('-¥500')
    expect(formatMoney(1500, 'BHD')).toBe('BD 1.500')
  })
})
