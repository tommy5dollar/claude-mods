// ISO 4217 currencies we hold accounts in. `minorUnits` is the number of decimal places: amounts are stored as
// integers in the minor unit (pence, cents, yen, fils).
export const currencies = {
  GBP: { minorUnits: 2, symbol: '£' },
  EUR: { minorUnits: 2, symbol: '€' },
  USD: { minorUnits: 2, symbol: '$' },
  JPY: { minorUnits: 0, symbol: '¥' },
  BHD: { minorUnits: 3, symbol: 'BD ' },
  KWD: { minorUnits: 3, symbol: 'KD ' },
} as const

export type Currency = keyof typeof currencies

export function minorUnits(currency: Currency): number {
  return currencies[currency].minorUnits
}
