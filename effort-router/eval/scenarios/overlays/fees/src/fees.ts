import type { Currency } from './currencies'

export type FeeCharge = { accountId: string; month: string; amountMinor: number; currency: Currency; payoutIds: string[] }

/** Charges every account's fee for `month` ('YYYY-MM'), as docs/monthly-fees.md says. Returns the charges this call made. */
export async function chargeMonthlyFees(month: string): Promise<FeeCharge[]> {
  throw new Error(`Not implemented (${month})`)
}
