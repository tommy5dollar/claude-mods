import type { Currency } from './currencies'
import { ledger, payouts } from './payouts'
import { accounts } from './store'

export type FeeCharge = { accountId: string; month: string; amountMinor: number; currency: Currency; payoutIds: string[] }

const FREE_PAYOUTS = 3
const RATE = 0.004
const SCALE_DISCOUNT = 0.25

/** Minimum and maximum fee per payout, in minor units. */
const limits: Record<Currency, [number, number]> = {
  GBP: [50, 2000],
  EUR: [60, 2500],
  USD: [60, 2500],
  JPY: [80, 3000],
  BHD: [20, 800],
  KWD: [150, 6000],
}

function payoutFee(amountMinor: number, currency: Currency): number {
  const [min, max] = limits[currency]
  return Math.min(max, Math.max(min, Math.round(amountMinor * RATE)))
}

/** Charges every account's fee for `month` ('YYYY-MM'), as docs/monthly-fees.md says. Returns the charges this call made. */
export async function chargeMonthlyFees(month: string): Promise<FeeCharge[]> {
  const charges: FeeCharge[] = []
  for (const account of accounts) {
    const id = `fee_${account.id}_${month}`
    if (await ledger.get(id)) continue

    const inMonth = await payouts.list(p => p.accountId === account.id && p.status !== 'pending' && p.settledAt?.slice(0, 7) === month)
    const charged = inMonth.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(FREE_PAYOUTS)
    if (charged.length === 0) continue

    let total = charged.reduce((sum, p) => sum + payoutFee(p.amountMinor, account.currency), 0)
    if (account.plan === 'scale') total = Math.floor(total * (1 - SCALE_DISCOUNT))

    await ledger.insert({ id, accountId: account.id, payoutId: '', amountMinor: -total, currency: account.currency, createdAt: new Date().toISOString() })
    charges.push({ accountId: account.id, month, amountMinor: total, currency: account.currency, payoutIds: charged.map(p => p.id) })
  }
  return charges
}
