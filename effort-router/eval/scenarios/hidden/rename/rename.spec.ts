// Hidden from the session. Copied into the repo after the run to grade it.
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as transactions from '../src/transactions'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

describe('rename getTxns to listTransactions', () => {
  test('listTransactions is exported and works', () => {
    const list = (transactions as Record<string, unknown>).listTransactions as (id: string) => { id: string }[]
    expect(typeof list).toBe('function')
    expect(list('acc_gb').map(t => t.id)).toEqual(['tx_001', 'tx_002', 'tx_003', 'tx_004'])
  })

  test('no getTxns left in src, tests or the README', () => {
    const left = [...files('src'), ...files('tests'), 'README.md'].filter(f => readFileSync(f, 'utf8').includes('getTxns'))
    expect(left).toEqual([])
  })
})
