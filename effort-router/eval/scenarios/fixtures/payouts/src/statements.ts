import { currencies } from './currencies'
import type { TransactionType } from './store'
import { getAccount, getTxns } from './transactions'

const OUTGOING: TransactionType[] = ['refund', 'fee']

export type StatementLine = { date: string; reference: string; type: TransactionType; amount: number }

export type Statement = {
  accountId: string
  accountName: string
  currency: string
  lines: StatementLine[]
  total: number
  totalFormatted: string
}

/** A customer statement: each movement signed (money in positive), in major units, with the closing total. */
export function buildStatement(accountId: string, from?: string, to?: string): Statement {
  const account = getAccount(accountId)
  const lines = getTxns(accountId, from, to).map(t => ({
    date: t.createdAt.slice(0, 10),
    reference: t.reference,
    type: t.type,
    amount: (OUTGOING.includes(t.type) ? -t.amountMinor : t.amountMinor) / 100,
  }))
  const total = lines.reduce((sum, line) => sum + line.amount, 0)
  return {
    accountId: account.id,
    accountName: account.name,
    currency: account.currency,
    lines,
    total,
    totalFormatted: `${currencies[account.currency].symbol}${total.toFixed(2)}`,
  }
}
