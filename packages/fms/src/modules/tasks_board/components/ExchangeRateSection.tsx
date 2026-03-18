import React, { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { RefreshCw, Loader2, ChevronDown } from 'lucide-react'

export type ExchangeRateRow = {
  fromCurrencyCode: string
  toCurrencyCode: string
  rate: string
  date: string
  source: string
}

type CurrencyOption = { value: string; label: string }

type ExchangeRateSectionProps = {
  usedCurrencies: string[]
  baseCurrency: string
  onBaseCurrencyChange: (code: string) => void
  onRatesLoaded?: (rates: ExchangeRateRow[]) => void
}

export function ExchangeRateSection({ usedCurrencies, baseCurrency, onBaseCurrencyChange, onRatesLoaded }: ExchangeRateSectionProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (btnRef.current) {
      const dialog = btnRef.current.closest('[role="dialog"]') as HTMLElement | null
      setPortalContainer(dialog)
    }
  }, [])

  useEffect(() => {
    if (currencyDropdownOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [currencyDropdownOpen])

  // Currencies that need rates (exclude base)
  const foreignCurrencies = usedCurrencies.filter((c) => c !== baseCurrency)

  // Fetch available currencies for base selector
  const { data: currencyOptions } = useQuery({
    queryKey: ['currency-options'],
    queryFn: async () => {
      const res = await apiCall<{ items?: CurrencyOption[] }>('/api/currencies/currencies/options?limit=100')
      return res.result?.items || []
    },
    staleTime: 10 * 60_000,
  })

  // Fetch exchange rates for foreign currencies against base
  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ['rfq-exchange-rates', baseCurrency, foreignCurrencies.sort().join(',')],
    queryFn: async () => {
      if (foreignCurrencies.length === 0) return []
      const results: ExchangeRateRow[] = []
      for (const currency of foreignCurrencies) {
        const params = new URLSearchParams({
          fromCurrencyCode: currency,
          toCurrencyCode: baseCurrency,
          pageSize: '1',
          sortField: 'date',
          sortDir: 'desc',
        })
        const res = await apiCall<{ items?: ExchangeRateRow[] }>(`/api/currencies/exchange-rates?${params}`)
        const items = res.result?.items || []
        if (items.length > 0) results.push(items[0])
      }
      return results
    },
    enabled: foreignCurrencies.length > 0,
    staleTime: 60_000,
  })

  // Notify parent when rates are loaded
  useEffect(() => {
    if (rates && rates.length > 0 && onRatesLoaded) {
      onRatesLoaded(rates)
    }
  }, [rates, onRatesLoaded])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await apiCall('/api/currencies/fetch-rates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      queryClient.invalidateQueries({ queryKey: ['rfq-exchange-rates'] })
    } finally {
      setRefreshing(false)
    }
  }, [queryClient])

  const rateMap = new Map<string, ExchangeRateRow>()
  for (const rate of (rates || [])) {
    rateMap.set(rate.fromCurrencyCode, rate)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          {t('tasks_board.context.exchangeRates', 'Exchange Rates')}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          title={t('tasks_board.context.refreshRates', 'Refresh rates')}
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Base currency selector */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-muted-foreground shrink-0">
          {t('tasks_board.context.baseCurrency', 'Base')}:
        </span>
        <div>
          <button
            ref={btnRef}
            type="button"
            onClick={() => setCurrencyDropdownOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold rounded border bg-background hover:bg-muted/50 transition-colors"
          >
            {baseCurrency}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
          {currencyDropdownOpen && dropdownPos && portalContainer && createPortal(
            <>
              <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setCurrencyDropdownOpen(false)} />
              <div
                className="fixed bg-popover border rounded-lg shadow-lg overflow-hidden min-w-[120px]"
                style={{ zIndex: 9999, top: dropdownPos.top, left: dropdownPos.left, pointerEvents: 'auto' }}
              >
                <div className="max-h-[200px] overflow-y-auto">
                  {(currencyOptions || []).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onBaseCurrencyChange(opt.value)
                        setCurrencyDropdownOpen(false)
                      }}
                      className={`
                        w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent transition-colors
                        ${opt.value === baseCurrency ? 'font-semibold text-foreground bg-accent/50' : 'text-foreground'}
                      `}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>
              </div>
            </>,
            portalContainer
          )}
        </div>
      </div>

      {/* Rate rows */}
      {ratesLoading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      ) : foreignCurrencies.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          {usedCurrencies.length === 0
            ? t('tasks_board.context.addLinesToSeeRates', 'Add charge lines to see exchange rates')
            : t('tasks_board.context.singleCurrency', 'All lines use the same currency')}
        </div>
      ) : (
        <div className="space-y-1">
          {foreignCurrencies.map((currency) => {
            const rate = rateMap.get(currency)
            return (
              <div key={currency} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-[12px]">
                <span className="font-medium text-foreground">
                  1 {currency}
                </span>
                <span className="text-foreground/80">
                  {rate ? (
                    <>
                      <span className="font-semibold">{parseFloat(rate.rate).toFixed(4)}</span>
                      <span className="text-muted-foreground ml-1">{baseCurrency}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">
                      {t('tasks_board.context.noRate', 'No rate')}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
          {rates && rates.length > 0 && rates[0].date && (
            <div className="text-[10px] text-muted-foreground text-right mt-1">
              {rates[0].source} · {new Date(rates[0].date).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
