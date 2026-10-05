// Hidden from the session. Copied into the repo after the run to grade it. Lenient: the command exists and runs, and
// the README mentions it.
import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

test('the CLI has a fees command that runs', () => {
  const run = spawnSync('bun', ['src/cli.ts', 'fees', '2026-09'], { encoding: 'utf8' })
  expect(run.status).toBe(0)
  expect(`${run.stdout}${run.stderr}`).not.toMatch(/usage:/i)
})

test('the README documents it', () => {
  expect(readFileSync('README.md', 'utf8')).toMatch(/\bfees\b/)
})
