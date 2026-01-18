'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, TrendingUp, Package, ArrowRightLeft, Loader2, RefreshCw } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import type { PortRef } from './hooks/useQuoteWizard'

type ExchangeRateData = {
  id: string
  fromCurrencyCode: string
  toCurrencyCode: string
  rate: string
  date: string
  source: string
  isActive: boolean
}

type QuoteWizardContextPanelProps = {
  clientName?: string | null
  originPorts?: PortRef[]
  destinationPorts?: PortRef[]
  quoteCurrency: string
  lineCurrencies: string[]
}

function useExchangeRates(baseCurrency: string, currencies: string[]) {
  // Get unique currencies that are different from base currency
  const uniqueCurrencies = [...new Set(currencies)].filter(c => c !== baseCurrency)

  return useQuery({
    queryKey: ['exchange-rates', baseCurrency, uniqueCurrencies.sort().join(',')],
    queryFn: async () => {
      if (uniqueCurrencies.length === 0) return []

      // Fetch all active exchange rates
      const response = await apiCall<{
        items: ExchangeRateData[]
        total: number
      }>('/api/currencies/exchange-rates?isActive=true&pageSize=100')

      if (!response.ok || !response.result?.items) {
        return []
      }

      // Filter for relevant currency pairs
      const relevantRates = response.result.items.filter(rate => {
        // Match pairs where one side is the base currency and other is in our line currencies
        const isFromBase = rate.fromCurrencyCode === baseCurrency && uniqueCurrencies.includes(rate.toCurrencyCode)
        const isToBase = rate.toCurrencyCode === baseCurrency && uniqueCurrencies.includes(rate.fromCurrencyCode)
        return isFromBase || isToBase
      })

      // Group by currency pair and get the most recent rate for each
      const rateMap = new Map<string, ExchangeRateData>()
      for (const rate of relevantRates) {
        // Normalize key so USD->EUR and EUR->USD are treated as same pair
        const currencies = [rate.fromCurrencyCode, rate.toCurrencyCode].sort()
        const key = currencies.join('-')
        const existing = rateMap.get(key)
        if (!existing || new Date(rate.date) > new Date(existing.date)) {
          rateMap.set(key, rate)
        }
      }

      return Array.from(rateMap.values())
    },
    enabled: uniqueCurrencies.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

function formatRate(rate: string): string {
  const num = parseFloat(rate)
  if (isNaN(num)) return rate
  return num.toFixed(4)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function QuoteWizardContextPanel({
  clientName,
  originPorts,
  destinationPorts,
  quoteCurrency,
  lineCurrencies,
}: QuoteWizardContextPanelProps) {
  const queryClient = useQueryClient()
  const [isFetching, setIsFetching] = React.useState(false)
  const [fetchError, setFetchError] = React.useState<string | null>(null)

  const hasRoute = originPorts && originPorts.length > 0 && destinationPorts && destinationPorts.length > 0
  const originDisplay = originPorts?.map(p => p.locode || p.name).join(', ') || ''
  const destinationDisplay = destinationPorts?.map(p => p.locode || p.name).join(', ') || ''

  const { data: exchangeRates, isLoading: isLoadingRates } = useExchangeRates(quoteCurrency, lineCurrencies)

  // Check if there are currencies different from quote currency
  const hasMultipleCurrencies = lineCurrencies.some(c => c !== quoteCurrency)

  // Get the missing currencies for display
  const missingCurrencies = lineCurrencies.filter(c => c !== quoteCurrency)
  const missingCurrenciesDisplay = [...new Set(missingCurrencies)].join(', ')

  // Check if quote currency is PLN-based (providers only support PLN pairs)
  const isPLNBased = quoteCurrency === 'PLN' || missingCurrencies.includes('PLN')

  const handleFetchRates = async () => {
    setIsFetching(true)
    setFetchError(null)
    try {
      const response = await apiCall<{
        totalFetched: number
        byProvider: Record<string, { count: number; errors?: string[] }>
        errors: string[]
      }>('/api/currencies/fetch-rates', {
        method: 'POST',
        body: JSON.stringify({ date: new Date().toISOString() }),
      })
      if (response.ok) {
        // Invalidate query to refresh rates
        await queryClient.invalidateQueries({ queryKey: ['exchange-rates'] })
        // If no rates were fetched and we're not PLN-based, show provider limitation
        if (response.result?.totalFetched === 0 && !isPLNBased) {
          setFetchError('Providers only support PLN-based rates')
        }
      } else {
        setFetchError('Failed to fetch rates')
      }
    } catch (error) {
      setFetchError('Failed to fetch rates')
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <div className="w-80 border-l bg-muted/20 flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-sm font-medium">Context</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Exchange Rates Section */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-medium uppercase text-muted-foreground">
              Exchange Rates ({quoteCurrency})
            </h3>
          </div>
          {isLoadingRates ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading rates...</span>
            </div>
          ) : !hasMultipleCurrencies ? (
            <div className="text-sm text-muted-foreground italic">
              All products in {quoteCurrency}
            </div>
          ) : exchangeRates && exchangeRates.length > 0 ? (
            <div className="space-y-2">
              {exchangeRates.map((rate) => {
                const isFromBase = rate.fromCurrencyCode === quoteCurrency
                const otherCurrency = isFromBase ? rate.toCurrencyCode : rate.fromCurrencyCode
                const displayRate = isFromBase
                  ? `1 ${quoteCurrency} = ${formatRate(rate.rate)} ${otherCurrency}`
                  : `1 ${otherCurrency} = ${formatRate(rate.rate)} ${quoteCurrency}`

                return (
                  <div
                    key={rate.id}
                    className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1.5"
                  >
                    <span className="font-mono">{displayRate}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(rate.date)}
                    </span>
                  </div>
                )
              })}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleFetchRates}
                disabled={isFetching}
                className="h-7 text-xs"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh Rates
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground italic">
                No rates found for {missingCurrenciesDisplay}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleFetchRates}
                disabled={isFetching}
                className="h-7 text-xs"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Fetch Latest Rates
                  </>
                )}
              </Button>
              {fetchError && (
                <div className="text-xs text-red-500">{fetchError}</div>
              )}
            </div>
          )}
        </section>

        {/* Recent Client Quotes */}
        {clientName && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-medium uppercase text-muted-foreground">
                Recent Quotes for {clientName}
              </h3>
            </div>
            <div className="text-sm text-muted-foreground italic">
              No recent quotes found
            </div>
          </section>
        )}

        {/* Route Pricing Insights */}
        {hasRoute && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-medium uppercase text-muted-foreground">
                Route: {originDisplay} → {destinationDisplay}
              </h3>
            </div>
            <div className="text-sm text-muted-foreground italic">
              No pricing data available
            </div>
          </section>
        )}

        {/* Typical Products */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-medium uppercase text-muted-foreground">
              Typical Products
            </h3>
          </div>
          <div className="text-sm text-muted-foreground">
            <ul className="space-y-1">
              <li>Ocean Freight (GFRT)</li>
              <li>Terminal Handling (GTHC)</li>
              <li>Bunker Adjustment (GBAF)</li>
              <li>Bill of Lading (GBOL)</li>
              <li>Customs Clearance (GCUS)</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
