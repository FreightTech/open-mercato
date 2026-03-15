import type { ExchangeRateSnapshot } from '../../fms_offers/data/types'

export interface ProjectLineForFinancials {
  id: string
  soldAmount: string
  actualCost?: string | null
  estimatedCost?: string | null
  actualSellAmount?: string | null
  currencyCode?: string | null
}

export interface FinancialSummary {
  estCost: number
  actualCost: number
  estSell: number
  actualSell: number
  margin: number
  marginPercent: number
}

export function formatCurrency(value: number, currencyCode: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: ExchangeRateSnapshot[] | null | undefined
): number {
  if (fromCurrency === toCurrency) return amount
  if (!exchangeRates || exchangeRates.length === 0) return amount

  const directRate = exchangeRates.find(
    (r) => r.fromCurrencyCode === fromCurrency && r.toCurrencyCode === toCurrency
  )
  if (directRate) return amount * parseFloat(directRate.rate)

  const reverseRate = exchangeRates.find(
    (r) => r.fromCurrencyCode === toCurrency && r.toCurrencyCode === fromCurrency
  )
  if (reverseRate) return amount / parseFloat(reverseRate.rate)

  return amount
}

export function calculateFinancialsInCurrency(
  projectLines: ProjectLineForFinancials[],
  displayCurrency: string,
  exchangeRates: ExchangeRateSnapshot[] | null | undefined
): FinancialSummary {
  if (!projectLines || projectLines.length === 0) {
    return { estCost: 0, actualCost: 0, estSell: 0, actualSell: 0, margin: 0, marginPercent: 0 }
  }

  let estCost = 0
  let actualCost = 0
  let estSell = 0
  let actualSell = 0

  for (const line of projectLines) {
    const lineCurrency = line.currencyCode || 'USD'
    estCost += convertCurrency(parseFloat(line.estimatedCost || '0'), lineCurrency, displayCurrency, exchangeRates)
    actualCost += convertCurrency(parseFloat(line.actualCost || '0'), lineCurrency, displayCurrency, exchangeRates)
    estSell += convertCurrency(parseFloat(line.soldAmount || '0'), lineCurrency, displayCurrency, exchangeRates)
    actualSell += convertCurrency(parseFloat(line.actualSellAmount || '0'), lineCurrency, displayCurrency, exchangeRates)
  }

  const margin = estSell - estCost
  const marginPercent = estSell > 0 ? (margin / estSell) * 100 : 0

  return { estCost, actualCost, estSell, actualSell, margin, marginPercent }
}

export function getAvailableCurrencies(
  projectLines: ProjectLineForFinancials[],
  defaultCurrency: string,
  baseCurrency: string | null | undefined,
  exchangeRates: ExchangeRateSnapshot[] | null | undefined
): string[] {
  const currencies = new Set<string>([defaultCurrency])

  if (baseCurrency) currencies.add(baseCurrency)

  for (const line of projectLines) {
    if (line.currencyCode) currencies.add(line.currencyCode)
  }

  if (exchangeRates) {
    for (const rate of exchangeRates) {
      currencies.add(rate.fromCurrencyCode)
      currencies.add(rate.toCurrencyCode)
    }
  }

  return Array.from(currencies).sort()
}

export function aggregateContainerSummary(
  seaContainers: Array<{ containerType?: string | null }>
): string {
  if (!seaContainers || seaContainers.length === 0) return '-'

  const counts: Record<string, number> = {}
  seaContainers.forEach((c) => {
    const type = c.containerType || '40HC'
    counts[type] = (counts[type] || 0) + 1
  })

  return Object.entries(counts)
    .map(([type, count]) => `${count}x ${type}`)
    .join(', ')
}
