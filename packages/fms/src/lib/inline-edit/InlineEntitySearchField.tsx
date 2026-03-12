'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'

type EntityValue = { id: string; name: string } | null

type SearchResult = {
  entityId: string
  recordId: string
  presenter?: {
    title?: string
    subtitle?: string
  }
}

export type InlineEntitySearchFieldProps = {
  value: EntityValue
  entityType: string
  placeholder: string
  onSave: (value: EntityValue) => Promise<void>
  readOnly?: boolean
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function InlineEntitySearchField({
  value,
  entityType,
  placeholder,
  onSave,
  readOnly = false,
}: InlineEntitySearchFieldProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const [dropdownPos, setDropdownPos] = React.useState({ top: 0, left: 0, width: 0 })

  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  const debouncedQuery = useDebounce(query, 200)

  // Search effect
  React.useEffect(() => {
    if (!isOpen || debouncedQuery.length < 2) {
      setResults([])
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const doSearch = async () => {
      setIsSearching(true)
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          strategies: 'fulltext',
          entityTypes: entityType,
          limit: '8',
          scoped: 'true',
        })
        const response = await fetch(`/api/search/search?${params}`, {
          signal: controller.signal,
        })
        if (!response.ok) return
        const data = await response.json()
        setResults(data.results || [])
        setHighlightedIndex(0)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setResults([])
        }
      } finally {
        setIsSearching(false)
      }
    }

    doSearch()
    return () => controller.abort()
  }, [debouncedQuery, entityType, isOpen])

  // Position dropdown
  React.useEffect(() => {
    if (!isOpen || !containerRef.current) return
    const updatePos = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 240),
      })
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [isOpen])

  // Click outside
  React.useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        (!dropdownRef.current || !dropdownRef.current.contains(e.target as Node))
      ) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const handleOpen = React.useCallback(() => {
    if (readOnly) return
    setIsOpen(true)
    setQuery(value?.name || '')
    setResults([])
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [readOnly, value])

  const handleSelect = React.useCallback(
    async (result: SearchResult) => {
      setIsOpen(false)
      setQuery('')
      setIsSaving(true)
      try {
        await onSave({
          id: result.recordId,
          name: result.presenter?.title || '',
        })
      } finally {
        setIsSaving(false)
      }
    },
    [onSave]
  )

  const handleClear = React.useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsSaving(true)
      try {
        await onSave(null)
      } finally {
        setIsSaving(false)
      }
    },
    [onSave]
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results[highlightedIndex]) {
        e.preventDefault()
        handleSelect(results[highlightedIndex])
      } else if (e.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
      }
    },
    [results, highlightedIndex, handleSelect]
  )

  if (readOnly) {
    return (
      <span className={`text-sm ${value?.name ? '' : 'text-muted-foreground'}`}>
        {value?.name || placeholder}
      </span>
    )
  }

  if (isSaving) {
    return (
      <span className="flex items-center gap-1 text-sm">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </span>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      {isOpen ? (
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Small delay to allow click on dropdown items
            setTimeout(() => {
              if (!dropdownRef.current?.matches(':hover')) {
                setIsOpen(false)
                setQuery('')
              }
            }, 150)
          }}
          placeholder={placeholder}
          className="bg-transparent outline-none border-none p-0 m-0 text-sm w-full"
        />
      ) : (
        <div
          onClick={handleOpen}
          className="flex items-center gap-1 text-sm cursor-text group max-w-full"
        >
          <span className={`truncate ${value?.name ? '' : 'text-muted-foreground'}`}>
            {value?.name || placeholder}
          </span>
          {value?.name && (
            <X
              className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
              onClick={handleClear}
            />
          )}
        </div>
      )}

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 max-h-[200px] overflow-auto"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
          >
            {isSearching && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching...
              </div>
            )}
            {!isSearching && debouncedQuery.length >= 2 && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No results found</div>
            )}
            {results.map((result, index) => (
              <button
                key={result.recordId}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  index === highlightedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
              >
                <div className="truncate font-medium">
                  {result.presenter?.title || result.recordId.slice(0, 8)}
                </div>
                {result.presenter?.subtitle && (
                  <div className="truncate text-xs text-muted-foreground">
                    {result.presenter.subtitle}
                  </div>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
