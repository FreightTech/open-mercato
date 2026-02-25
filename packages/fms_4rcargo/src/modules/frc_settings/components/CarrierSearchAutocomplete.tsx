"use client"

import * as React from 'react'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'

type CarrierOption = {
  id: string
  name: string
}

type CarrierSearchResult = {
  items: Array<{
    id: string
    name: string
    shortName?: string | null
  }>
  total: number
}

interface CarrierSearchAutocompleteProps {
  value: CarrierOption | null
  onChange: (value: CarrierOption | null) => void
  disabled?: boolean
  placeholder?: string
}

export function CarrierSearchAutocomplete({
  value,
  onChange,
  disabled = false,
  placeholder,
}: CarrierSearchAutocompleteProps) {
  const t = useT()
  const containerRef = React.useRef<HTMLDivElement>(null)

  const [query, setQuery] = React.useState('')
  const [suggestions, setSuggestions] = React.useState<CarrierOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [showSuggestions, setShowSuggestions] = React.useState(false)
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)

  // Sync input with selected value
  React.useEffect(() => {
    if (value) {
      setQuery(value.name)
    } else {
      setQuery('')
    }
  }, [value])

  // Debounced search
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const searchCarriers = React.useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const call = await apiCall<CarrierSearchResult>(
        `/api/frc_contractors/contractors?q=${encodeURIComponent(searchQuery)}&limit=10&isActive=true`
      )

      if (call.ok && call.result) {
        setSuggestions(
          call.result.items.map((item) => ({
            id: item.id,
            name: item.shortName || item.name,
          }))
        )
      } else {
        setSuggestions([])
      }
    } catch (err) {
      console.error('Carrier search failed', err)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value
    setQuery(newQuery)
    setShowSuggestions(true)
    setHighlightedIndex(-1)

    // Clear selection if user is typing something different
    if (value && newQuery !== value.name) {
      onChange(null)
    }

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      void searchCarriers(newQuery)
    }, 300)
  }

  const handleSelectCarrier = (carrier: CarrierOption) => {
    onChange(carrier)
    setQuery(carrier.name)
    setShowSuggestions(false)
    setSuggestions([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectCarrier(suggestions[highlightedIndex])
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        break
    }
  }

  // Close suggestions when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true)
            }
          }}
          placeholder={placeholder ?? t('frc_settings.pricing.carriers.search_placeholder', 'Search carriers...')}
          disabled={disabled}
          className={cn(value && 'border-green-500')}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <ul className="max-h-60 overflow-auto py-1">
            {suggestions.map((carrier, index) => (
              <li
                key={carrier.id}
                onClick={() => handleSelectCarrier(carrier)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm',
                  highlightedIndex === index && 'bg-accent',
                  value?.id === carrier.id && 'bg-accent/50 font-medium'
                )}
              >
                {carrier.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No results message */}
      {showSuggestions && !loading && query.length >= 2 && suggestions.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-lg">
          {t('frc_settings.pricing.carriers.no_results', 'No carriers found')}
        </div>
      )}
    </div>
  )
}
