# payouts

Customer statements and transaction exports for business accounts.

- `bun src/cli.ts statement <accountId>` prints a statement.
- `bun src/cli.ts export <accountId>` prints the account's transactions as JSON for the accounting integrations.
- `bun test tests` runs the tests.

Transactions are read with `getTxns(accountId, from, to)` in `src/transactions.ts`. Amounts are stored as integers in
the currency's minor unit.
