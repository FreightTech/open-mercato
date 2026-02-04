'use client'

import * as React from 'react'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Loader2, X, AlertCircle } from 'lucide-react'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { cn } from '@open-mercato/shared/lib/utils'

interface PlaceSuggestion {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

interface PlaceDetails {
  placeId: string
  formattedAddress: string
  location: {
    lat: number
    lng: number
  }
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  countryCode?: string
}

interface GooglePlacesAutocompleteProps {
  value?: string
  onChange?: (value: string) => void
  onPlaceSelect?: (details: PlaceDetails) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Auto-focus when component mounts */
  autoFocus?: boolean
}

// Generate a simple session token for Google Places API billing optimization
function generateSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

export function GooglePlacesAutocomplete({
  value = '',
  onChange,
  onPlaceSelect,
  placeholder = 'Search for an address...',
  className,
  disabled = false,
  autoFocus = false,
}: GooglePlacesAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [sessionToken] = useState(() => generateSessionToken())
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounced search query
  const [debouncedInput, setDebouncedInput] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(inputValue)
    }, 300)
    return () => clearTimeout(timer)
  }, [inputValue])

  // Fetch suggestions from API
  const {
    data: suggestionsData,
    isLoading: isLoadingSuggestions,
    error: suggestionsError,
  } = useQuery({
    queryKey: ['places-autocomplete', debouncedInput, sessionToken],
    queryFn: async () => {
      if (debouncedInput.length < 3) return { suggestions: [], available: true }

      const params = new URLSearchParams({
        input: debouncedInput,
        sessionToken,
      })

      const response = await apiCall<{
        suggestions: PlaceSuggestion[]
        available: boolean
        error?: string
      }>(`/api/fms_locations/places/autocomplete?${params.toString()}`)

      if (!response.ok) {
        throw new Error(response.result?.error || 'Failed to fetch suggestions')
      }

      return response.result ?? { suggestions: [], available: false }
    },
    enabled: debouncedInput.length >= 3 && !disabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const suggestions = suggestionsData?.suggestions ?? []
  const isApiAvailable = suggestionsData?.available !== false

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setInputValue(newValue)
      onChange?.(newValue)
      setIsOpen(true)
      setHighlightedIndex(-1)
    },
    [onChange]
  )

  // Handle place selection
  const handlePlaceSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      setIsLoadingDetails(true)
      setIsOpen(false)

      try {
        const params = new URLSearchParams({
          placeId: suggestion.placeId,
          sessionToken,
        })

        const response = await apiCall<{
          details: PlaceDetails
          available: boolean
          error?: string
        }>(`/api/fms_locations/places/details?${params.toString()}`)

        if (response.ok && response.result?.details) {
          const details = response.result.details
          setInputValue(details.formattedAddress)
          onChange?.(details.formattedAddress)
          onPlaceSelect?.(details)
        }
      } catch (error) {
        console.error('Failed to fetch place details:', error)
      } finally {
        setIsLoadingDetails(false)
      }
    },
    [sessionToken, onChange, onPlaceSelect]
  )

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
          break
        case 'Enter':
          e.preventDefault()
          if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
            handlePlaceSelect(suggestions[highlightedIndex])
          }
          break
        case 'Escape':
          setIsOpen(false)
          setHighlightedIndex(-1)
          break
      }
    },
    [isOpen, suggestions, highlightedIndex, handlePlaceSelect]
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li')
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  // Sync external value changes
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value)
    }
  }, [value])

  // Clear input
  const handleClear = useCallback(() => {
    setInputValue('')
    onChange?.('')
    setIsOpen(false)
    inputRef.current?.focus()
  }, [onChange])

  const showDropdown =
    isOpen && (suggestions.length > 0 || isLoadingSuggestions || !isApiAvailable)

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => inputValue.length >= 3 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled || isLoadingDetails}
          autoFocus={autoFocus}
          className="pr-10"
        />
        {(isLoadingSuggestions || isLoadingDetails) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {inputValue && !isLoadingSuggestions && !isLoadingDetails && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {!isApiAvailable ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>Address autocomplete not available. Enter address manually.</span>
            </div>
          ) : isLoadingSuggestions ? (
            <div className="flex items-center justify-center p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No results found</div>
          ) : (
            <ul ref={listRef} className="max-h-60 overflow-auto py-1">
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.placeId}
                  onClick={() => handlePlaceSelect(suggestion)}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm',
                    index === highlightedIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{suggestion.mainText}</div>
                    {suggestion.secondaryText && (
                      <div className="text-xs text-muted-foreground truncate">
                        {suggestion.secondaryText}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export type { PlaceDetails, PlaceSuggestion }
