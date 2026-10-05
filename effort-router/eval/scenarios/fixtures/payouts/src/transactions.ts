import { type Account, accounts, type Transaction, transactions } from './store'

export function getAccount(accountId: string): Account {
  const account = accounts.find(a => a.id === accountId)
  if (!account) throw new Error(`No account ${accountId}`)
  return account
}

/** An account's transactions, oldest first, optionally between two ISO dates (inclusive). */
export function getTxns(accountId: string, from?: string, to?: string): Transaction[] {
  return transactions
    .filter(t => t.accountId === accountId)
    .filter(t => (!from || t.createdAt >= from) && (!to || t.createdAt <= `${to}T23:59:59Z`))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
