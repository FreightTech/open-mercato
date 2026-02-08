import React, { useState, useEffect, useRef, useCallback } from 'react'
import { User, Check, X } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'

type UserItem = {
  id: string
  email: string
  name?: string | null
}

type UserSearchInputProps = {
  value: string | null
  onChange: (value: string | null, name?: string) => void
  placeholder?: string
  disabled?: boolean
}

function displayName(user: UserItem): string {
  return user.name || user.email
}

export function UserSearchInput({
  value,
  onChange,
  placeholder = 'Assign...',
  disabled = false,
}: UserSearchInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [cachedItem, setCachedItem] = useState<UserItem | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data, isLoading } = useQuery({
    queryKey: ['task-board-users', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('pageSize', '50')
      const result = await apiCall<{ items?: UserItem[] }>(
        `/api/auth/users?${params.toString()}`,
      )
      return result.result?.items || []
    },
    staleTime: 5 * 60 * 1000,
    enabled: isFocused || !!value,
  })

  const options = data || []

  const selectedItem = value
    ? (cachedItem?.id === value ? cachedItem : options.find((item) => item.id === value) || cachedItem)
    : null

  useEffect(() => {
    if (value && options.length > 0) {
      const found = options.find((item) => item.id === value)
      if (found) setCachedItem(found)
    }
    if (!value) setCachedItem(null)
  }, [value, options])

  const showDropdown = isFocused && (searchQuery.length > 0 || options.length > 0)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false)
        setSearchQuery('')
      }
    }
    if (isFocused) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFocused])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [options])

  useEffect(() => {
    if (listRef.current && showDropdown) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement | undefined
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex, showDropdown])

  const handleSelect = useCallback(
    (item: UserItem) => {
      setCachedItem(item)
      onChange(item.id, displayName(item))
      setSearchQuery('')
      setIsFocused(false)
      inputRef.current?.blur()
    },
    [onChange],
  )

  const handleClear = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setCachedItem(null)
      onChange(null)
      setSearchQuery('')
      inputRef.current?.focus()
    },
    [onChange],
  )

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = event.target.value
      setSearchQuery(newQuery)
      if (value) {
        setCachedItem(null)
        onChange(null)
      }
    },
    [value, onChange],
  )

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    if (selectedItem) {
      setSearchQuery(displayName(selectedItem))
      requestAnimationFrame(() => {
        inputRef.current?.select()
      })
    }
  }, [selectedItem])

  const handleBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleBlur = useCallback(() => {
    handleBlurTimeout.current = setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setIsFocused(false)
        setSearchQuery('')
      }
    }, 150)
  }, [])

  useEffect(() => {
    return () => {
      if (handleBlurTimeout.current) clearTimeout(handleBlurTimeout.current)
    }
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setIsFocused(false)
        setSearchQuery('')
        inputRef.current?.blur()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (showDropdown && options.length > 0 && highlightedIndex < options.length) {
          handleSelect(options[highlightedIndex])
        }
      }
    },
    [options, highlightedIndex, showDropdown, handleSelect],
  )

  const inputDisplayValue = isFocused ? searchQuery : (selectedItem ? displayName(selectedItem) : '')

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 12px',
          borderRadius: '9999px',
          border: `1.5px solid ${isFocused ? 'var(--ring)' : 'color-mix(in srgb, var(--foreground) 25%, var(--border))'}`,
          background: 'var(--background)',
          height: '38px',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: isFocused ? '0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)' : 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <User style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }} />
        <input
          ref={inputRef}
          type="text"
          value={inputDisplayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '13px',
            color: 'var(--foreground)',
            minWidth: 0,
            padding: 0,
          }}
        />
        {selectedItem && !disabled && !isFocused && (
          <X
            style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.35, cursor: 'pointer' }}
            onClick={handleClear}
            onMouseEnter={(event) => { event.currentTarget.style.opacity = '1' }}
            onMouseLeave={(event) => { event.currentTarget.style.opacity = '0.35' }}
          />
        )}
      </div>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            zIndex: 50,
            width: '100%',
            marginTop: '4px',
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          <div ref={listRef} style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                Loading...
              </div>
            ) : options.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                No users found
              </div>
            ) : (
              options.map((item, index) => {
                const isSelected = item.id === value
                const isHighlighted = index === highlightedIndex
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      handleSelect(item)
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      fontSize: '12px',
                      textAlign: 'left',
                      border: 'none',
                      cursor: 'pointer',
                      background: isHighlighted
                        ? 'var(--accent)'
                        : isSelected
                          ? 'color-mix(in srgb, var(--accent) 50%, transparent)'
                          : 'transparent',
                      color: isHighlighted ? 'var(--accent-foreground)' : 'var(--popover-foreground)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <User style={{ width: 12, height: 12, flexShrink: 0, opacity: 0.4 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayName(item)}
                      </span>
                      {item.name && (
                        <span style={{ fontSize: '10px', opacity: 0.5 }}>
                          {item.email}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
