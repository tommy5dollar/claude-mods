import { expect, test } from 'bun:test'
import { balanceOf, createPayout, payouts } from '../src/payouts'
import { handlePayoutEvent } from '../src/webhooks'

test('a settled payout debits the account', async () => {
  await createPayout({ id: 'po_1', accountId: 'acc_t1', amountMinor: 5000, currency: 'GBP' })
  await handlePayoutEvent({ eventId: 'evt_1', payoutId: 'po_1', status: 'settled', occurredAt: '2026-10-01T10:00:00Z' })
  expect(await balanceOf('acc_t1')).toBe(-5000)
  expect((await payouts.get('po_1'))?.status).toBe('settled')
})

test('a failed payout leaves the balance alone', async () => {
  await createPayout({ id: 'po_2', accountId: 'acc_t2', amountMinor: 5000, currency: 'GBP' })
  await handlePayoutEvent({ eventId: 'evt_2', payoutId: 'po_2', status: 'failed', occurredAt: '2026-10-01T10:00:00Z' })
  expect(await balanceOf('acc_t2')).toBe(0)
  expect((await payouts.get('po_2'))?.status).toBe('failed')
})
