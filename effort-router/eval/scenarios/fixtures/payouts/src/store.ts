import type { Currency } from './currencies'

export type Account = { id: string; name: string; currency: Currency }

export type TransactionType = 'payment' | 'refund' | 'fee'

/** `amountMinor` is always positive. `type` says which way the money moved: payments in, refunds and fees out. */
export type Transaction = {
  id: string
  accountId: string
  type: TransactionType
  amountMinor: number
  currency: Currency
  createdAt: string
  reference: string
}

export const accounts: Account[] = [
  { id: 'acc_gb', name: 'Hollis & Reed Ltd', currency: 'GBP' },
  { id: 'acc_jp', name: 'Kaito Trading KK', currency: 'JPY' },
  { id: 'acc_bh', name: 'Gulf Marine WLL', currency: 'BHD' },
]

export const transactions: Transaction[] = [
  { id: 'tx_001', accountId: 'acc_gb', type: 'payment', amountMinor: 125000, currency: 'GBP', createdAt: '2026-09-02T09:14:00Z', reference: 'INV-2041' },
  { id: 'tx_002', accountId: 'acc_gb', type: 'fee', amountMinor: 250, currency: 'GBP', createdAt: '2026-09-02T09:14:00Z', reference: 'Transfer fee' },
  { id: 'tx_003', accountId: 'acc_gb', type: 'payment', amountMinor: 48999, currency: 'GBP', createdAt: '2026-09-11T16:40:00Z', reference: 'INV-2057' },
  { id: 'tx_004', accountId: 'acc_gb', type: 'refund', amountMinor: 12000, currency: 'GBP', createdAt: '2026-09-19T11:02:00Z', reference: 'Refund INV-2041 partial' },
  { id: 'tx_005', accountId: 'acc_jp', type: 'payment', amountMinor: 1840000, currency: 'JPY', createdAt: '2026-09-03T02:30:00Z', reference: 'PO 7731' },
  { id: 'tx_006', accountId: 'acc_jp', type: 'fee', amountMinor: 500, currency: 'JPY', createdAt: '2026-09-03T02:30:00Z', reference: 'Transfer fee' },
  { id: 'tx_007', accountId: 'acc_jp', type: 'payment', amountMinor: 362500, currency: 'JPY', createdAt: '2026-09-24T05:12:00Z', reference: 'PO 7790' },
  { id: 'tx_008', accountId: 'acc_bh', type: 'payment', amountMinor: 2750125, currency: 'BHD', createdAt: '2026-09-08T07:45:00Z', reference: 'Charter 118' },
  { id: 'tx_009', accountId: 'acc_bh', type: 'fee', amountMinor: 1500, currency: 'BHD', createdAt: '2026-09-08T07:45:00Z', reference: 'Transfer fee' },
  { id: 'tx_010', accountId: 'acc_bh', type: 'refund', amountMinor: 300050, currency: 'BHD', createdAt: '2026-09-21T13:20:00Z', reference: 'Refund Charter 118 fuel' },
  { id: 'tx_011', accountId: 'acc_jp', type: 'payment', amountMinor: 98000, currency: 'JPY', createdAt: '2026-09-30T22:15:00Z', reference: 'PO 7802' },
]
