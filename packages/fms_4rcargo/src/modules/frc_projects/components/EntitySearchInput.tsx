'use client'

import * as React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Loader2 } from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'

const POPUP_MAX_HEIGHT = 200

export type SearchResult = {
  entityId: string
  recordId: string
  presenter?: {
    title?: string
    subtitle?: string
    icon?: string
    badge?: string
  }
  fields?: Record<string, unknown>
}

export interface EntitySearchInputProps {
  /** Entity type for search (e.g., 'contractors:contractor') */
  entityType: string
  /** Selected entity ID */
  value: string | null
  /** Display value for current selection */
  displayValue?: string | null
  /** Callback when selection changes */
  onChange: (id: string | null, name: string | null) => void
  /** Placeholder text */
  placeholder?: string
  /** Whether input is disabled */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
  /** Minimum characters before search */
  minQueryLength?: number
  /** Debounce delay in ms */
  debounceMs?: number
  /** Text shown when no results */
  noResultsText?: string
  /** Text shown while searching */
  searchingText?: string
  /** Custom format for option display */
  formatOption?: (result: SearchResult) => { primary: string; secondary?: string }
}

// Patterns to filter out IDs from display
const UUID_WITH_DASHES = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_WITHOUT_DASHES = /^[0-9a-f]{32}$/i
const HEX_ID_PATTERN = /^[0-9a-f]{8,}$/i

function looksLikeIdOrUuid(value: string | undefined): boolean {
  if (!value) return false
  return UUID_WITH_DASHES.test(value) || UUID_WITHOUT_DASHES.test(value) || HEX_ID_PATTERN.test(value)
}

function defaultFormatOption(result: SearchResult): { primary: string; secondary?: string } {
  const title = result.presenter?.title
  const subtitle = result.presenter?.subtitle

  const primary =
    title && !looksLikeIdOrUuid(title) ? title : result.recordId.slice(0, 8) + '...'

  const secondary = subtitle && !looksLikeIdOrUuid(subtitle) ? subtitle : undefined

  return { primary, secondary }
}

function calculatePopupPosition(inputRef: React.RefObject<HTMLElement | null>) {
  if (!inputRef.current) return { top: 0, left: 0, width: 0, openAbove: false }

  const rect = inputRef.current.getBoundingClientRect()
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
    width: Math.max(rect.width, 250),
    openAbove,
  }
}

export function EntitySearchInput({
  entityType,
  value,
  displayValue,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  className,
  minQueryLength = 2,
  debounceMs = 300,
  noResultsText = 'No results found',
  searchingText = 'Searching...',
  formatOption = defaultFormatOption,
}: EntitySearchInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, openAbove: false })
  const [inputValue, setInputValue] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Show display value when not focused
  const showValue = !isFocused && value && displayValue

  // Debounce search query
  useEffect(() => {
    if (!isFocused) return
    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [inputValue, isFocused, debounceMs])

  // Fetch results from search API
  useEffect(() => {
    if (!isFocused || debouncedQuery.length < minQueryLength) {
      setResults([])
      setIsOpen(false)
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    const fetchResults = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          strategies: 'meilisearch',
          entityTypes: entityType,
          limit: '20',
        })

        const response = await fetch(`/api/search/search?${params.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Search failed')
        }

        const data = await response.json()
        setResults(data.results || [])
        setIsOpen(true)
        setHighlightedIndex(0)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Entity search error:', error)
          setResults([])
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchResults()

    return () => controller.abort()
  }, [debouncedQuery, entityType, minQueryLength, isFocused])

  // Update position
  useEffect(() => {
    if (containerRef.current) {
      const pos = calculatePopupPosition(containerRef)
      setPosition(pos)
    }

    const updatePosition = () => {
      if (containerRef.current && isOpen) {
        const pos = calculatePopupPosition(containerRef)
        setPosition(pos)
      }
    }

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen])

  // Click outside handling
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(e.target as Node)
      const isOutsideDropdown = !dropdownRef.current || !dropdownRef.current.contains(e.target as Node)

      if (isOutsideContainer && isOutsideDropdown) {
        setIsOpen(false)
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback(
    (result: SearchResult) => {
      const { primary } = formatOption(result)
      onChange(result.recordId, primary)
      setIsOpen(false)
      setIsFocused(false)
      setInputValue('')
    },
    [formatOption, onChange]
  )

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange(null, null)
      setInputValue('')
      setResults([])
      inputRef.current?.focus()
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (isOpen && results.length > 0) {
          handleSelect(results[highlightedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        setIsFocused(false)
        inputRef.current?.blur()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
      }
    },
    [isOpen, results, highlightedIndex, handleSelect]
  )

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    if (inputValue.length >= minQueryLength) {
      setIsOpen(true)
    }
  }, [inputValue.length, minQueryLength])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          'relative flex items-center h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
          'focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <Search className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />

        {showValue ? (
          <div
            className="flex-1 truncate cursor-pointer"
            onClick={() => {
              if (!disabled) {
                setIsFocused(true)
                inputRef.current?.focus()
              }
            }}
          >
            {displayValue}
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        )}

        {isLoading && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin ml-2" />}

        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-0.5 text-muted-foreground hover:text-foreground ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="bg-popover border rounded-md shadow-lg overflow-hidden"
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
              maxHeight: `${POPUP_MAX_HEIGHT}px`,
              overflowY: 'auto',
              zIndex: 10000,
              ...(position.openAbove ? { transform: 'translateY(-100%)' } : {}),
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{searchingText}</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{noResultsText}</div>
            ) : (
              results.map((result, index) => {
                const { primary, secondary } = formatOption(result)

                return (
                  <div
                    key={result.recordId}
                    className={cn(
                      'px-3 py-2 cursor-pointer text-sm',
                      index === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleSelect(result)
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <div className="font-medium">{primary}</div>
                    {secondary && <div className="text-xs text-muted-foreground">{secondary}</div>}
                  </div>
                )
              })
            )}
          </div>,
          document.body
        )}
    </>
  )
}
