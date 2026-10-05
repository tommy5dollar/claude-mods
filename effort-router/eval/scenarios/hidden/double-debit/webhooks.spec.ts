// Hidden from the session. Copied into the repo after the run to grade it. The report is a customer debited twice
// when the bank sent the settled notification twice. The bank's two notifications can arrive at the same moment, and a
// retry can repeat the same eventId, so the fix has to hold under concurrency and must not error on a redelivery.
import { describe, expect, test } from 'bun:test'
import { balanceOf, createPayout, payouts } from '../src/payouts'
import { handlePayoutEvent } from '../src/webhooks'

let n = 0
async function payout() {
  n++
  const p = { id: `po_h${n}`, accountId: `acc_h${n}`, amountMinor: 12500, currency: 'GBP' as const }
  await createPayout(p)
  return p
}
const settled = (payoutId: string, eventId: string) => ({ eventId, payoutId, status: 'settled' as const, occurredAt: '2026-10-01T10:00:00Z' })

describe('a payout is debited once', () => {
  test('two settled notifications, one after the other', async () => {
    const p = await payout()
    await handlePayoutEvent(settled(p.id, `${p.id}_a`))
    await handlePayoutEvent(settled(p.id, `${p.id}_b`))
    expect(await balanceOf(p.accountId)).toBe(-12500)
  })

  test('two settled notifications at the same moment', async () => {
    const p = await payout()
    await Promise.allSettled([handlePayoutEvent(settled(p.id, `${p.id}_a`)), handlePayoutEvent(settled(p.id, `${p.id}_b`))])
    expect(await balanceOf(p.accountId)).toBe(-12500)
  })

  test('five at the same moment', async () => {
    const p = await payout()
    await Promise.allSettled([1, 2, 3, 4, 5].map(i => handlePayoutEvent(settled(p.id, `${p.id}_${i}`))))
    expect(await balanceOf(p.accountId)).toBe(-12500)
  })

  test('a redelivery of the same notification succeeds without debiting again', async () => {
    const p = await payout()
    await handlePayoutEvent(settled(p.id, `${p.id}_a`))
    await handlePayoutEvent(settled(p.id, `${p.id}_a`))
    expect(await balanceOf(p.accountId)).toBe(-12500)
  })

  test('a redelivery at the same moment succeeds without debiting again', async () => {
    const p = await payout()
    const results = await Promise.allSettled([handlePayoutEvent(settled(p.id, `${p.id}_a`)), handlePayoutEvent(settled(p.id, `${p.id}_a`))])
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(await balanceOf(p.accountId)).toBe(-12500)
  })
})

describe('still works', () => {
  test('a single settled notification debits and settles', async () => {
    const p = await payout()
    await handlePayoutEvent(settled(p.id, `${p.id}_a`))
    expect(await balanceOf(p.accountId)).toBe(-12500)
    expect((await payouts.get(p.id))?.status).toBe('settled')
  })

  test('a failed payout is not debited', async () => {
    const p = await payout()
    await handlePayoutEvent({ eventId: `${p.id}_f`, payoutId: p.id, status: 'failed', occurredAt: '2026-10-01T10:00:00Z' })
    expect(await balanceOf(p.accountId)).toBe(0)
    expect((await payouts.get(p.id))?.status).toBe('failed')
  })
})
