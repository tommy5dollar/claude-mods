// Hidden from the session. Copied into the repo after the run to grade it.
import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

const run = (...args: string[]) => spawnSync('bun', ['src/cli.ts', ...args], { encoding: 'utf8' })

test('balance prints the closing balance', () => {
  const out = run('balance', 'acc_gb').stdout.replace(/,/g, '')
  expect(out).toContain('1617.49')
})

test('the other commands still work', () => {
  expect(run('statement', 'acc_gb').stdout).toContain('Closing total')
  expect(JSON.parse(run('export', 'acc_gb').stdout).transactions).toHaveLength(4)
})
