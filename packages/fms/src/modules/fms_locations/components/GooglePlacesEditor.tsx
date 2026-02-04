'use client'

import * as React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Loader2 } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

// Dynamically load editor styles
if (typeof window !== 'undefined') {
  import('@open-mercato/ui/backend/dynamic-table/styles/DynamicTable.css')
}

const POPUP_MAX_HEIGHT = 200

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

export interface GooglePlacesEditorConfig {
  placeholder?: string
  minQueryLength?: number
  debounceMs?: number
  noResultsText?: string
  searchingText?: string
  /** Callback when address is selected, receives parsed address fields */
  onAddressSelected?: (addressData: {
    addressLine1?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    lat?: number
    lng?: number
    googlePlaceId?: string
  }, rowData: Record<string, unknown>) => void
}

interface GooglePlacesEditorProps {
  config?: GooglePlacesEditorConfig
  value: string
  onChange: (v: string) => void
  onSave: (v?: string) => void
  onCancel: () => void
  rowData: Record<string, unknown>
}

// Generate a simple session token for Google Places API billing optimization
function generateSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

function calculatePopupPosition(cellRef: React.RefObject<HTMLElement | null>) {
  if (!cellRef.current) return { top: 0, left: 0, width: 0, openAbove: false }

  const rect = cellRef.current.getBoundingClientRect()
  const viewportHeight = window.innerHeight

  const spaceBelow = viewportHeight - rect.bottom
  const spaceAbove = rect.top

  let top: number
  let openAbove = false
  if (spaceBelow >= POPUP_MAX_HEIGHT || spaceBelow >= spaceAbove) {
    top = rect.bottom + 2
  } else {
    top = rect.top - 2
    openAbove = true
  }

  return {
    top,
    left: rect.left,
    width: Math.max(rect.width, 280),
    openAbove,
  }
}

export function GooglePlacesEditor({
  config = {},
  value,
  onChange,
  onSave,
  onCancel,
  rowData,
}: GooglePlacesEditorProps) {
  const {
    placeholder = 'Type address or postal code...',
    minQueryLength = 3,
    debounceMs = 300,
    noResultsText = 'No addresses found',
    searchingText = 'Searching...',
    onAddressSelected,
  } = config

  const [showDropdown, setShowDropdown] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, openAbove: false })
  const [textValue, setTextValue] = useState(value ?? '')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [hasUserTyped, setHasUserTyped] = useState(false)
  const [sessionToken] = useState(() => generateSessionToken())
  const [apiAvailable, setApiAvailable] = useState(true)

  const cellRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isClickingDropdownRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Position cursor at end of text on mount
  useEffect(() => {
    setTimeout(() => {
      if (cellRef.current) {
        const length = cellRef.current.value?.length || 0
        cellRef.current.selectionStart = length
        cellRef.current.selectionEnd = length
      }
    }, 0)
  }, [])

  // Debounce search query
  useEffect(() => {
    if (!hasUserTyped) return
    const timer = setTimeout(() => {
      setDebouncedQuery(textValue)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [textValue, hasUserTyped, debounceMs])

  // Fetch suggestions from API
  useEffect(() => {
    if (!hasUserTyped || debouncedQuery.length < minQueryLength) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    const fetchSuggestions = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({
          input: debouncedQuery,
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

        const data = response.result
        if (data?.available === false) {
          setApiAvailable(false)
          setSuggestions([])
        } else {
          setApiAvailable(true)
          setSuggestions(data?.suggestions ?? [])
        }
        setShowDropdown(true)
        setHighlightedIndex(0)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Places autocomplete error:', error)
          setSuggestions([])
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchSuggestions()

    return () => controller.abort()
  }, [debouncedQuery, minQueryLength, sessionToken, hasUserTyped])

  // Update position
  useEffect(() => {
    if (cellRef.current) {
      const pos = calculatePopupPosition(cellRef)
      setPosition(pos)
    }

    const updatePosition = () => {
      if (cellRef.current && showDropdown) {
        const pos = calculatePopupPosition(cellRef)
        setPosition(pos)
      }
    }

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showDropdown])

  // Click outside handling
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isOutsideCell = cellRef.current && !cellRef.current.contains(e.target as Node)
      const isOutsideDropdown = !dropdownRef.current || !dropdownRef.current.contains(e.target as Node)

      if (isOutsideCell && isOutsideDropdown) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSuggestionSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      isClickingDropdownRef.current = true
      setIsLoadingDetails(true)
      setShowDropdown(false)

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

          // Build the JSON value with all address fields
          const addressData = {
            addressLine1: details.addressLine1 || details.formattedAddress,
            city: details.city || undefined,
            state: details.state || undefined,
            postalCode: details.postalCode || undefined,
            country: details.country || undefined,
            lat: details.location?.lat || undefined,
            lng: details.location?.lng || undefined,
            googlePlaceId: details.placeId || undefined,
          }

          // Show formatted address in textarea
          setTextValue(details.formattedAddress)

          // Notify parent about selected address data
          if (onAddressSelected) {
            onAddressSelected(addressData, rowData)
          }

          // Return JSON string with all address fields
          const jsonValue = JSON.stringify(addressData)
          onChange(jsonValue)
          onSave(jsonValue)
        }
      } catch (error) {
        console.error('Failed to fetch place details:', error)
      } finally {
        setIsLoadingDetails(false)
      }
    },
    [sessionToken, onChange, onSave, onAddressSelected, rowData]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()

        if (showDropdown && suggestions.length > 0) {
          const selected = suggestions[highlightedIndex]
          handleSuggestionSelect(selected)
        } else {
          // No results to select - close dropdown
          setShowDropdown(false)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setShowDropdown(false)
        onCancel()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
      } else if (e.key === 'Tab') {
        setShowDropdown(false)
      }
    },
    [showDropdown, suggestions, highlightedIndex, handleSuggestionSelect, onCancel]
  )

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setTextValue(val)
      onChange(val)
      setHasUserTyped(true)
    },
    [onChange]
  )

  return (
    <>
      <textarea
        ref={cellRef}
        value={textValue}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Don't save on blur - only selected places are valid
        }}
        autoFocus
        className="hot-cell-editor hot-dropdown-editor"
        placeholder={placeholder}
        disabled={isLoadingDetails}
      />

      {showDropdown &&
        createPortal(
          <div
            ref={dropdownRef}
            className="hot-editor-dropdown"
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
              maxHeight: `${POPUP_MAX_HEIGHT}px`,
              overflowY: 'auto',
              zIndex: 10000,
              pointerEvents: 'auto',
              ...(position.openAbove ? { transform: 'translateY(-100%)' } : {}),
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              isClickingDropdownRef.current = true
            }}
            onMouseUp={() => {
              isClickingDropdownRef.current = false
            }}
          >
            {!apiAvailable ? (
              <div className="hot-editor-dropdown-empty">
                Address autocomplete not available. Enter address manually.
              </div>
            ) : isLoading ? (
              <div className="hot-editor-dropdown-empty">
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                {searchingText}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="hot-editor-dropdown-empty">{noResultsText}</div>
            ) : (
              suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.placeId}
                  className={`hot-editor-dropdown-item ${index === highlightedIndex ? 'highlighted' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSuggestionSelect(suggestion)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <MapPin className="inline h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="hot-editor-dropdown-item-primary">{suggestion.mainText}</div>
                    {suggestion.secondaryText && (
                      <div className="hot-editor-dropdown-item-secondary">{suggestion.secondaryText}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>,
          document.body
        )}
    </>
  )
}

// Factory function to create a DynamicTable-compatible editor
export type DynamicTableEditorFn = (
  value: unknown,
  onChange: (v: unknown) => void,
  onSave: (v?: unknown) => void,
  onCancel: () => void,
  rowData: Record<string, unknown>,
  col: unknown,
  rowIndex: number,
  colIndex: number
) => React.ReactNode

export function createGooglePlacesEditor(config?: GooglePlacesEditorConfig): DynamicTableEditorFn {
  return (value, onChange, onSave, onCancel, rowData) => (
    <GooglePlacesEditor
      config={config}
      value={String(value ?? '')}
      onChange={onChange as (v: string) => void}
      onSave={onSave as (v?: string) => void}
      onCancel={onCancel}
      rowData={rowData}
    />
  )
}

export type { PlaceDetails, PlaceSuggestion }
