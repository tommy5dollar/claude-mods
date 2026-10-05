import { type Currency, currencies, minorUnits } from './currencies'

/** An integer amount in the currency's minor unit, as a number in major units (1234 GBP pence -> 12.34). */
export function toMajor(amountMinor: number, currency: Currency): number {
  return amountMinor / 10 ** minorUnits(currency)
}

/** An integer amount in the currency's minor unit, formatted for people: formatMoney(-1234, 'GBP') -> "-£12.34". */
export function formatMoney(amountMinor: number, currency: Currency): string {
  const digits = minorUnits(currency)
  const sign = amountMinor < 0 ? '-' : ''
  const major = (Math.abs(amountMinor) / 10 ** digits).toFixed(digits)
  const [whole, fraction] = major.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${currencies[currency].symbol}${fraction ? `${grouped}.${fraction}` : grouped}`
}
