import { ledger, payouts } from './payouts'

/** What the bank POSTs to /webhooks/payouts when a payout we sent settles or fails. */
export type PayoutEvent = {
  /** The bank's id for this notification. */
  eventId: string
  payoutId: string
  status: 'settled' | 'failed'
  occurredAt: string
}

export async function handlePayoutEvent(event: PayoutEvent): Promise<void> {
  const payout = await payouts.get(event.payoutId)
  if (!payout) throw new Error(`Unknown payout ${event.payoutId}`)

  if (event.status === 'settled') {
    await ledger.insert({
      id: `le_${event.eventId}`,
      accountId: payout.accountId,
      payoutId: payout.id,
      amountMinor: -payout.amountMinor,
      currency: payout.currency,
      createdAt: event.occurredAt,
    })
    await payouts.update(payout.id, { status: 'settled' })
  } else {
    await payouts.update(payout.id, { status: 'failed' })
  }
}
