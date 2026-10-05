import type { Currency } from './currencies'
import { Table } from './db'

/** Money we send out of a customer's account to their supplier, through the bank. */
export type Payout = {
  id: string
  accountId: string
  amountMinor: number
  currency: Currency
  status: 'pending' | 'settled' | 'failed'
  createdAt: string
  /** When the bank told us it settled (UTC ISO). */
  settledAt?: string
}

/** One movement on a customer's balance. A settled payout debits it once. */
export type LedgerEntry = {
  id: string
  accountId: string
  payoutId: string
  amountMinor: number
  currency: Currency
  createdAt: string
}

export const payouts = new Table<Payout>()
export const ledger = new Table<LedgerEntry>()

export async function createPayout(payout: Omit<Payout, 'status' | 'createdAt'>): Promise<Payout> {
  const row: Payout = { ...payout, status: 'pending', createdAt: new Date().toISOString() }
  await payouts.insert(row)
  return row
}

export async function balanceOf(accountId: string): Promise<number> {
  const entries = await ledger.list(e => e.accountId === accountId)
  return entries.reduce((sum, e) => sum + e.amountMinor, 0)
}
