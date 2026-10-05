// Hidden from the session. Copied into the repo after the run to grade it. The report is one Tokyo customer, but
// "the customer's own calendar days" covers every account: London has summer time (BST, UTC+1, until 25 October
// 2026), Bahrain is UTC+3 all year, and each line's date should be the local one too.
import { describe, expect, test } from 'bun:test'
import { buildStatement } from '../src/statements'
import { type Transaction, transactions } from '../src/store'

function add(id: string, accountId: string, createdAt: string, currency: Transaction['currency']) {
  transactions.push({ id, accountId, type: 'payment', amountMinor: 1000, currency, createdAt, reference: id })
}

add('h_gb_sep_start', 'acc_gb', '2026-08-31T23:30:00Z', 'GBP') // 00:30 on 1 Sep in London (BST)
add('h_gb_sep_end', 'acc_gb', '2026-09-30T23:30:00Z', 'GBP') // 00:30 on 1 Oct in London (BST)
add('h_gb_dst_a', 'acc_gb', '2026-10-24T22:30:00Z', 'GBP') // 23:30 on 24 Oct (BST)
add('h_gb_dst_b', 'acc_gb', '2026-10-24T23:30:00Z', 'GBP') // 00:30 on 25 Oct (BST, the night the clocks go back)
add('h_gb_dst_c', 'acc_gb', '2026-10-25T23:30:00Z', 'GBP') // 23:30 on 25 Oct (GMT)
add('h_gb_winter', 'acc_gb', '2026-12-31T23:30:00Z', 'GBP') // 23:30 on 31 Dec (GMT)
add('h_bh_late', 'acc_bh', '2026-09-30T21:30:00Z', 'BHD') // 00:30 on 1 Oct in Bahrain

const refs = (accountId: string, from: string, to: string) => buildStatement(accountId, from, to).lines.map(l => l.reference)

describe('Tokyo (the report)', () => {
  test('a payment early on 1 October local time is on the October statement, not September', () => {
    expect(refs('acc_jp', '2026-09-01', '2026-09-30')).not.toContain('PO 7802')
    expect(refs('acc_jp', '2026-10-01', '2026-10-31')).toContain('PO 7802')
  })

  test('its line shows the local date', () => {
    const line = buildStatement('acc_jp', '2026-10-01', '2026-10-31').lines.find(l => l.reference === 'PO 7802')
    expect(line?.date).toBe('2026-10-01')
  })
})

describe('London, with summer time', () => {
  test('September runs from midnight BST to midnight BST', () => {
    const september = refs('acc_gb', '2026-09-01', '2026-09-30')
    expect(september).toContain('h_gb_sep_start')
    expect(september).not.toContain('h_gb_sep_end')
  })

  test('the day the clocks go back is 25 hours long', () => {
    const day = refs('acc_gb', '2026-10-25', '2026-10-25')
    expect(day).not.toContain('h_gb_dst_a')
    expect(day).toContain('h_gb_dst_b')
    expect(day).toContain('h_gb_dst_c')
  })

  test('in winter London is on UTC', () => {
    expect(refs('acc_gb', '2026-12-31', '2026-12-31')).toContain('h_gb_winter')
  })
})

describe('Bahrain', () => {
  test('a payment after local midnight is on the next month', () => {
    expect(refs('acc_bh', '2026-09-01', '2026-09-30')).not.toContain('h_bh_late')
    expect(refs('acc_bh', '2026-10-01', '2026-10-31')).toContain('h_bh_late')
  })
})

describe('still works', () => {
  test('the September statements keep their ordinary transactions', () => {
    expect(refs('acc_gb', '2026-09-01', '2026-09-30')).toEqual(expect.arrayContaining(['INV-2041', 'Transfer fee', 'INV-2057', 'Refund INV-2041 partial']))
    expect(refs('acc_jp', '2026-09-01', '2026-09-30')).toEqual(['PO 7731', 'Transfer fee', 'PO 7790'])
  })

  test('no dates means everything', () => {
    expect(refs('acc_jp', undefined as unknown as string, undefined as unknown as string)).toHaveLength(4)
  })
})
