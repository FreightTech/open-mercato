'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Label } from '@open-mercato/ui/primitives/label'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { QuoteLine } from './types/quote-wizard'

// Exchange rate data type
type ExchangeRateData = {
  id: string
  fromCurrencyCode: string
  toCurrencyCode: string
  rate: string
  date: string
  source: string
  isActive: boolean
}

// Exchange rate snapshot for saving with offer
type ExchangeRateSnapshot = {
  fromCurrencyCode: string
  toCurrencyCode: string
  rate: string
  date: string
  source: string
}

type Route = {
  key: string
  origin: string
  destination: string
  lineIds: string[]
}

type CreateOfferDrawerProps = {
  open: boolean
  onClose: () => void
  quoteId: string
  quoteNumber?: string | null
  lines: QuoteLine[]
  currency: string
  onSuccess?: () => void
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Check if a string is a valid UUID (not a temp ID)
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
  return uuidRegex.test(str)
}

const PAYMENT_TERMS_OPTIONS = [
  'Net 7 days',
  'Net 14 days',
  'Net 30 days',
  'Net 45 days',
  'Net 60 days',
  'Due on receipt',
  'Prepaid',
]

// Hook to fetch exchange rates for currency pairs
function useExchangeRates(baseCurrency: string, currencies: string[]) {
  const [rates, setRates] = useState<ExchangeRateData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get unique non-base currencies
  const uniqueCurrencies = useMemo(() => {
    const unique = [...new Set(currencies.filter(c => c && c !== baseCurrency))]
    return unique.sort()
  }, [currencies, baseCurrency])

  useEffect(() => {
    if (uniqueCurrencies.length === 0) {
      setRates([])
      return
    }

    const fetchRates = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const ratesData: ExchangeRateData[] = []

        // Fetch exchange rate for each currency pair
        for (const currency of uniqueCurrencies) {
          const response = await apiCall<{
            items: ExchangeRateData[]
            total: number
          }>(`/api/currencies/exchange-rates?fromCurrencyCode=${currency}&toCurrencyCode=${baseCurrency}&isActive=true&pageSize=1`)

          if (response.ok && response.result && response.result.items && response.result.items.length > 0) {
            ratesData.push(response.result.items[0])
          }
        }

        setRates(ratesData)
      } catch (err) {
        setError('Failed to fetch exchange rates')
        console.error('Error fetching exchange rates:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRates()
  }, [uniqueCurrencies, baseCurrency])

  return { rates, isLoading, error, hasDifferentCurrencies: uniqueCurrencies.length > 0 }
}

export function CreateOfferDrawer({
  open,
  onClose,
  quoteId,
  quoteNumber,
  lines,
  currency,
  onSuccess,
}: CreateOfferDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Only include lines with valid UUIDs (persisted lines, not temp IDs)
  const persistedLines = useMemo(() => lines.filter(l => isValidUUID(l.id)), [lines])
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set(persistedLines.map(l => l.id)))

  // Get currencies from selected lines
  const selectedLineCurrencies = useMemo(() => {
    return persistedLines
      .filter(l => selectedLineIds.has(l.id))
      .map(l => l.currencyCode)
      .filter(Boolean)
  }, [persistedLines, selectedLineIds])

  // Fetch exchange rates when lines have different currencies
  const { rates: exchangeRates, isLoading: isLoadingRates, error: ratesError, hasDifferentCurrencies } =
    useExchangeRates(currency, selectedLineCurrencies)
  const [validUntil, setValidUntil] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 14)
    return formatDate(date)
  })
  const [paymentTerms, setPaymentTerms] = useState('Net 30 days')
  const [specialTerms, setSpecialTerms] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  React.useEffect(() => {
    if (open) {
      setSelectedLineIds(new Set(persistedLines.map(l => l.id)))
      const date = new Date()
      date.setDate(date.getDate() + 14)
      setValidUntil(formatDate(date))
      setPaymentTerms('Net 30 days')
      setSpecialTerms('')
      setCustomerNotes('')
    }
  }, [open, persistedLines])

  const toggleLine = useCallback((lineId: string) => {
    setSelectedLineIds(prev => {
      const next = new Set(prev)
      if (next.has(lineId)) {
        next.delete(lineId)
      } else {
        next.add(lineId)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selectedLineIds.size === persistedLines.length) {
      setSelectedLineIds(new Set())
    } else {
      setSelectedLineIds(new Set(persistedLines.map(l => l.id)))
    }
  }, [selectedLineIds.size, persistedLines])

  // Extract unique routes from lines
  const routes = useMemo((): Route[] => {
    const routeMap = new Map<string, Route>()
    for (const line of persistedLines) {
      const origin = line.origin || '-'
      const destination = line.destination || '-'
      const key = `${origin}→${destination}`
      if (routeMap.has(key)) {
        routeMap.get(key)!.lineIds.push(line.id)
      } else {
        routeMap.set(key, { key, origin, destination, lineIds: [line.id] })
      }
    }
    return Array.from(routeMap.values())
  }, [persistedLines])

  // Check if a route is fully selected (all its lines are selected)
  const isRouteSelected = useCallback((route: Route): boolean => {
    return route.lineIds.every(id => selectedLineIds.has(id))
  }, [selectedLineIds])

  // Toggle all lines for a route
  const toggleRoute = useCallback((route: Route) => {
    setSelectedLineIds(prev => {
      const next = new Set(prev)
      const allSelected = route.lineIds.every(id => next.has(id))
      if (allSelected) {
        // Deselect all lines in this route
        route.lineIds.forEach(id => next.delete(id))
      } else {
        // Select all lines in this route
        route.lineIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (persistedLines.length === 0) {
      flash('No saved lines available. Please save the quote first.', 'error')
      return
    }

    if (selectedLineIds.size === 0) {
      flash('Please select at least one line', 'error')
      return
    }

    if (!validUntil) {
      flash('Valid until date is required', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      // Prepare exchange rate snapshots if we have different currencies
      const exchangeRateSnapshots: ExchangeRateSnapshot[] | null = hasDifferentCurrencies && exchangeRates.length > 0
        ? exchangeRates.map(rate => ({
            fromCurrencyCode: rate.fromCurrencyCode,
            toCurrencyCode: rate.toCurrencyCode,
            rate: rate.rate,
            date: rate.date,
            source: rate.source,
          }))
        : null

      const response = await apiCall<{ id: string; offerNumber: string }>('/api/fms_quotes/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          lineIds: Array.from(selectedLineIds),
          validUntil: new Date(validUntil).toISOString(),
          paymentTerms: paymentTerms || null,
          specialTerms: specialTerms.trim() || null,
          customerNotes: customerNotes.trim() || null,
          exchangeRates: exchangeRateSnapshots,
        }),
      })

      if (response.ok && response.result) {
        flash(`Offer ${response.result.offerNumber} created`, 'success')
        onClose()
        onSuccess?.()
      } else {
        flash('Failed to create offer', 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'An error occurred', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [quoteId, selectedLineIds, validUntil, paymentTerms, specialTerms, customerNotes, onClose, onSuccess, persistedLines, hasDifferentCurrencies, exchangeRates])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-y-0 right-0 bg-background border-l shadow-xl z-50 flex flex-col"
      style={{ width: '50vw' }}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-lg font-semibold">Create Offer</h2>
          {quoteNumber && (
            <p className="text-sm text-muted-foreground">From Quote: {quoteNumber}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Line selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Select Lines to Include</Label>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={toggleAll}
            >
              {selectedLineIds.size === persistedLines.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {/* Route filter pills */}
          {routes.length > 0 && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-1.5">
                {routes.map((route) => {
                  const selected = isRouteSelected(route)
                  return (
                    <Badge
                      key={route.key}
                      variant={selected ? 'default' : 'outline'}
                      className={`cursor-pointer transition-colors ${
                        selected
                          ? 'bg-primary hover:bg-primary/80'
                          : 'hover:bg-muted text-muted-foreground'
                      }`}
                      onClick={() => toggleRoute(route)}
                    >
                      {route.origin} → {route.destination}
                      <span className="ml-1 opacity-70">({route.lineIds.length})</span>
                    </Badge>
                  )
                })}
              </div>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Size</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Charge</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Origin</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Dest</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Sell</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Ccy</th>
                </tr>
              </thead>
              <tbody>
                {persistedLines.map((line) => {
                  const isSelected = selectedLineIds.has(line.id)
                  const sellPrice = parseFloat(line.unitSales) || 0
                  return (
                    <tr
                      key={line.id}
                      className={`border-t cursor-pointer hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}
                      onClick={() => toggleLine(line.id)}
                    >
                      <td className="px-2 py-2">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-input'}`}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </td>
                      <td className="px-2 py-2">{line.containerSize || '-'}</td>
                      <td className="px-2 py-2 font-mono text-xs">{line.chargeCode || '-'}</td>
                      <td className="px-2 py-2 max-w-[150px] truncate" title={line.productName}>
                        {line.productName}
                      </td>
                      <td className="px-2 py-2 max-w-[120px] truncate" title={line.origin || ''}>
                        {line.origin || '-'}
                      </td>
                      <td className="px-2 py-2 max-w-[120px] truncate" title={line.destination || ''}>
                        {line.destination || '-'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{sellPrice.toFixed(2)}</td>
                      <td className="px-2 py-2 text-xs">{line.currencyCode || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {(lines.length > persistedLines.length) && (
            <div className="mt-2 text-sm text-amber-600">
              {lines.length - persistedLines.length} unsaved line(s) not shown
            </div>
          )}
        </div>

        {/* Exchange rates section - only show when lines have different currencies */}
        {hasDifferentCurrencies && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <span>Exchange Rates ({currency})</span>
              {isLoadingRates && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>

            {ratesError && (
              <p className="text-xs text-amber-600">Unable to fetch exchange rates</p>
            )}

            {!isLoadingRates && !ratesError && exchangeRates.length > 0 && (
              <div className="space-y-1.5">
                {exchangeRates.map((rate) => {
                  const rateValue = parseFloat(rate.rate)
                  const inverseRate = rateValue > 0 ? (1 / rateValue).toFixed(4) : '0'
                  const dateStr = new Date(rate.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  return (
                    <div key={rate.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-mono">1 {rate.fromCurrencyCode} = {inverseRate} {rate.toCurrencyCode}</span>
                        <span className="text-xs text-muted-foreground ml-2">Source: {rate.source}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{dateStr}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {!isLoadingRates && !ratesError && exchangeRates.length === 0 && (
              <p className="text-xs text-amber-600">No exchange rates found</p>
            )}
          </div>
        )}

        {/* Offer details */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b pb-2">Offer Details</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="validUntil">Valid Until *</Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Default: 14 days from today</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <select
                id="paymentTerms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                {PAYMENT_TERMS_OPTIONS.map((term) => (
                  <option key={term} value={term}>{term}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="specialTerms">Special Terms</Label>
            <Input
              id="specialTerms"
              placeholder="e.g., FOB Shanghai, subject to space availability"
              value={specialTerms}
              onChange={(e) => setSpecialTerms(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customerNotes">Notes to Customer</Label>
            <textarea
              id="customerNotes"
              placeholder="Any additional notes for the customer..."
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              className="w-full h-24 px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/30">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || selectedLineIds.size === 0}>
          {isSubmitting ? 'Creating...' : 'Create Offer'}
        </Button>
      </div>
    </div>
  )
}
