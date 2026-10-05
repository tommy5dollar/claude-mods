// Hidden from the session. Copied into the repo after the run to grade it.
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

const run = (...args: string[]) => spawnSync('bun', ['src/cli.ts', ...args], { encoding: 'utf8' }).stdout.trim()

describe('export --pretty', () => {
  test('indents the JSON', () => {
    const out = run('export', 'acc_gb', '--pretty')
    expect(out.split('\n').length).toBeGreaterThan(5)
    expect(JSON.parse(out).transactions).toHaveLength(4)
  })

  test('works after the dates too', () => {
    const out = run('export', 'acc_gb', '2026-09-10', '2026-09-30', '--pretty')
    expect(out.split('\n').length).toBeGreaterThan(5)
    expect(JSON.parse(out).transactions).toHaveLength(2)
  })

  test('without it the export is unchanged: one line', () => {
    const out = run('export', 'acc_gb')
    expect(out.split('\n')).toHaveLength(1)
    expect(JSON.parse(out).transactions).toHaveLength(4)
  })
})
