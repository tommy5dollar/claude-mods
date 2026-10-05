// Hidden from the session. Copied into the repo after the run to grade it, one test per rule in
// docs/monthly-fees.md. Each test has its own account, so the job charging every account doesn't cross tests.
import { describe, expect, test } from 'bun:test'
import type { Currency } from '../src/currencies'
import { chargeMonthlyFees } from '../src/fees'
import { ledger, payouts } from '../src/payouts'
import { type Account, accounts } from '../src/store'

let n = 0
function account(currency: Currency = 'GBP', timezone = 'Europe/London', plan: Account['plan'] = 'standard') {
  n++
  const a: Account = { id: `acc_fee${n}`, name: `Fee test ${n}`, currency, timezone, plan }
  accounts.push(a)
  return a
}

let p = 0
async function payout(a: Account, amountMinor: number, settledAt: string | undefined, status: 'settled' | 'pending' | 'failed' = 'settled') {
  p++
  await payouts.insert({ id: `po_fee${p}`, accountId: a.id, amountMinor, currency: a.currency, status, createdAt: '2026-08-15T10:00:00Z', settledAt })
}

/** Three cheap payouts early in the month, to use up the free allowance. */
async function allowance(a: Account, month = '2026-09') {
  for (const day of ['02', '03', '04']) await payout(a, 1000, `${month}-${day}T10:00:00Z`)
}

async function charged(a: Account, month = '2026-09') {
  const all = await ledger.list(e => e.accountId === a.id && e.id.startsWith('fee_'))
  const entries = all.filter(e => e.id === `fee_${a.id}_${month}`)
  return { all, entries, total: entries.reduce((s, e) => s + e.amountMinor, 0) }
}

describe('allowance and minimum', () => {
  test('three payouts are free: no charge and no entry', async () => {
    const a = account()
    await allowance(a)
    const result = await chargeMonthlyFees('2026-09')
    expect(result.filter(c => c.accountId === a.id)).toEqual([])
    expect((await charged(a)).entries).toEqual([])
  })

  test('after the allowance each payout pays at least the minimum', async () => {
    const a = account()
    await allowance(a)
    await payout(a, 10000, '2026-09-10T10:00:00Z') // 0.4% of £100 = 40p, minimum 50p
    await payout(a, 10000, '2026-09-11T10:00:00Z')
    await chargeMonthlyFees('2026-09')
    const { all, total } = await charged(a)
    expect(all.map(e => e.id)).toEqual([`fee_${a.id}_2026-09`])
    expect(total).toBe(-100)
  })

  test('the allowance goes by settledAt, not by when the payout was made', async () => {
    const a = account()
    await payout(a, 500000, '2026-09-20T10:00:00Z') // big, but settled last: it's charged
    await allowance(a)
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).total).toBe(-2000)
  })
})

describe('rounding and limits', () => {
  test('banker\'s rounding: 62.5 rounds to 62 and 63.5 to 64', async () => {
    const a = account()
    await allowance(a)
    await payout(a, 15625, '2026-09-10T10:00:00Z') // 62.5
    await payout(a, 15875, '2026-09-11T10:00:00Z') // 63.5
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).total).toBe(-126)
  })

  test('the maximum per payout', async () => {
    const a = account()
    await allowance(a)
    await payout(a, 1000000, '2026-09-10T10:00:00Z') // 0.4% of £10,000 = £40, maximum £20
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).total).toBe(-2000)
  })

  test('JPY has no decimals and its own minimum', async () => {
    const a = account('JPY', 'Asia/Tokyo')
    await allowance(a)
    await payout(a, 100000, '2026-09-10T03:00:00Z') // ¥400
    await payout(a, 1000, '2026-09-11T03:00:00Z') // ¥4, minimum ¥80
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).total).toBe(-480)
  })

  test('BHD has three decimals and its own limits', async () => {
    const a = account('BHD', 'Asia/Bahrain')
    await allowance(a)
    await payout(a, 100000, '2026-09-10T08:00:00Z') // BD 0.400
    await payout(a, 10000, '2026-09-11T08:00:00Z') // BD 0.040, minimum BD 0.200
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).total).toBe(-600)
  })
})

describe('the month is local', () => {
  test('London in summer: 00:30 BST on 1 September counts, 00:30 BST on 1 October does not', async () => {
    const a = account()
    await payout(a, 50000, '2026-08-31T23:30:00Z') // 1 Sep local
    await allowance(a)
    await payout(a, 50000, '2026-09-30T23:30:00Z') // 1 Oct local
    await chargeMonthlyFees('2026-09')
    // In September: the 31 Aug 23:30Z payout (first by settledAt, so free) and the three allowance payouts
    // (the last of which is charged, at the 50p minimum).
    expect((await charged(a)).total).toBe(-50)
    // (October isn't charged here: it may not be over when the tests run, and refusing an unfinished month is fine.)
  })

  test('Tokyo: 01:00 on 1 October local is October', async () => {
    const a = account('JPY', 'Asia/Tokyo')
    await allowance(a)
    await payout(a, 100000, '2026-09-30T16:00:00Z') // 1 Oct 01:00 JST
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).entries).toEqual([])
  })
})

describe('which payouts', () => {
  test('pending and failed payouts are never charged', async () => {
    const a = account()
    await allowance(a)
    await payout(a, 50000, undefined, 'pending')
    await payout(a, 50000, undefined, 'failed')
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).entries).toEqual([])
  })

  test('last month\'s payouts don\'t use up this month\'s allowance', async () => {
    const a = account()
    await allowance(a, '2026-08')
    await payout(a, 50000, '2026-09-10T10:00:00Z')
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).entries).toEqual([])
  })
})

describe('scale plan', () => {
  test('25% off the month\'s total, rounded half to even', async () => {
    const a = account('GBP', 'Europe/London', 'scale')
    await allowance(a)
    for (const day of ['10', '11', '12']) await payout(a, 20000, `2026-09-${day}T10:00:00Z`) // 80p each
    await payout(a, 22500, '2026-09-13T10:00:00Z') // 90p. Total 330p, 75% is 247.5p, half to even 248p
    await chargeMonthlyFees('2026-09')
    expect((await charged(a)).total).toBe(-248)
  })
})

describe('running it again', () => {
  test('a second run for the same month charges nothing more', async () => {
    const a = account()
    await allowance(a)
    await payout(a, 50000, '2026-09-10T10:00:00Z')
    await chargeMonthlyFees('2026-09')
    const second = await chargeMonthlyFees('2026-09')
    expect(second.filter(c => c.accountId === a.id)).toEqual([])
    expect((await charged(a)).all).toHaveLength(1)
  })

  test('two runs at the same moment charge once', async () => {
    const a = account()
    await allowance(a)
    await payout(a, 50000, '2026-09-10T10:00:00Z')
    await Promise.allSettled([chargeMonthlyFees('2026-09'), chargeMonthlyFees('2026-09')])
    const { all, total } = await charged(a)
    expect(all).toHaveLength(1)
    expect(total).toBe(-200)
  })
})
