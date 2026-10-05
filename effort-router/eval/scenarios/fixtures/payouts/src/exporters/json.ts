import { getAccount, getTxns } from '../transactions'

/** Transactions as JSON for the accounting integrations. Amounts are signed, in major units. */
export function exportJson(accountId: string, from?: string, to?: string): string {
  const account = getAccount(accountId)
  const rows = getTxns(accountId, from, to).map(t => ({
    id: t.id,
    date: t.createdAt,
    type: t.type,
    reference: t.reference,
    amount: ((t.type === 'payment' ? 1 : -1) * t.amountMinor) / 100,
    currency: t.currency,
  }))
  return JSON.stringify({ account: account.id, currency: account.currency, transactions: rows })
}
