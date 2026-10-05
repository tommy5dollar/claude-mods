# Monthly account fees

We charge each business account once a month for the payouts it sent. `chargeMonthlyFees(month)` in `src/fees.ts`
runs the charge for every account. Finance runs it on the 1st for the month before.

## Rules

- **The month.** `chargeMonthlyFees('2026-09')` charges every account for September 2026. The month is the account's
  own calendar month in its time zone (`Account.timezone`), not UTC.
- **Which payouts.** A payout counts in the month it settled (`settledAt`, read in the account's time zone). Pending and
  failed payouts are never charged. A payout created in September that settles in October is charged in October.
- **Free allowance.** Each account's first 3 settled payouts of the month are free, in order of `settledAt`.
- **Fee per payout.** 0.4% of the payout's amount, rounded to the currency's minor unit with banker's rounding (round
  half to even), then held between the currency's minimum and maximum below.
- **Scale plan.** Accounts on the `scale` plan get 25% off their month's total. Take 25% off the sum of the per-payout
  fees and round the result to the minor unit, half to even.
- **Charging.** The month's total is debited as one ledger entry with id `fee_<accountId>_<month>` (for example
  `fee_acc_gb_2026-09`), a negative `amountMinor`, an empty `payoutId` and `createdAt` set to the time of the charge. A
  month with nothing to charge creates no entry.
- **Running it again.** Finance re-runs the job after a failure, and sometimes by mistake, including while a run is
  still going. An account must never be charged twice for the same month.
- **Result.** It returns the charges this call made.

## Minimum and maximum fee per payout

| Currency | Minimum | Maximum |
| --- | --- | --- |
| GBP | 0.50 | 20.00 |
| EUR | 0.60 | 25.00 |
| USD | 0.60 | 25.00 |
| JPY | 80 | 3,000 |
| BHD | 0.200 | 8.000 |
| KWD | 0.150 | 6.000 |
