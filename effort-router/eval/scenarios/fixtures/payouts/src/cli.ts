import { exportJson } from './exporters/json'
import { buildStatement } from './statements'

const usage = `Usage:
  bun src/cli.ts statement <accountId> [from] [to]   Print a statement
  bun src/cli.ts export <accountId> [from] [to]      Export transactions as JSON`

const [command, accountId, from, to] = process.argv.slice(2)

if (command === 'statement' && accountId) {
  const statement = buildStatement(accountId, from, to)
  console.log(`${statement.accountName} (${statement.currency})`)
  for (const line of statement.lines) console.log(`${line.date}  ${line.reference.padEnd(28)} ${line.amount}`)
  console.log(`Closing total: ${statement.totalFormatted}`)
} else if (command === 'export' && accountId) {
  console.log(exportJson(accountId, from, to))
} else {
  console.log(usage)
  process.exit(command ? 1 : 0)
}
