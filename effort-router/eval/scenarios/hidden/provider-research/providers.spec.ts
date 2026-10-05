// Hidden from the session. Copied into the repo after the run to grade it. Structural only: every provider is in the
// write-up with links to its own pages. Accuracy is compared across arms by reading the write-ups.
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

export const PROVIDERS = ['Wise', 'Airwallex', 'Stripe', 'Adyen', 'Currencycloud', 'Modulr', 'Banking Circle', 'Thunes', 'Nium', 'Rapyd', 'dLocal', 'Payoneer']

const doc = () => readFileSync('docs/providers.md', 'utf8')

test('every provider is covered', () => {
  const text = doc().toLowerCase()
  expect(PROVIDERS.filter(p => !text.includes(p.toLowerCase()))).toEqual([])
})

test('the findings link to their sources', () => {
  expect((doc().match(/https?:\/\/[^\s)>\]]+/g) ?? []).length).toBeGreaterThanOrEqual(12)
})

test('it ends with a recommendation', () => {
  expect(doc()).toMatch(/recommend/i)
})
