import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'

type ChipItem = { id: string; name: string }

type MultiChipInputProps = {
  selectedIds: string[]
  selectedNames: string[]
  onChange: (ids: string[], names: string[]) => void
  apiEndpoint: string
  placeholder?: string
  chipColor?: { bg: string; text: string }
}

export function MultiChipInput({
  selectedIds,
  selectedNames,
  onChange,
  apiEndpoint,
  placeholder = 'Search...',
  chipColor = { bg: '#fef3c7', text: '#92400e' },
}: MultiChipInputProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(timer)
  }, [search])

  const { data: results } = useQuery({
    queryKey: ['multi-chip-search', apiEndpoint, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '30', isActive: 'true' })
      if (debouncedSearch) params.set('q', debouncedSearch)
      const res = await apiCall<{ items?: ChipItem[] }>(`${apiEndpoint}?${params}`)
      return res.result?.items || []
    },
    staleTime: 60_000,
    enabled: focused,
  })

  const filtered = useMemo(() => {
    const items = results || []
    return items.filter((item) => !selectedIds.includes(item.id))
  }, [results, selectedIds])

  useEffect(() => {
    if (focused && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width })
    }
  }, [focused, search, filtered.length])

  useEffect(() => {
    if (!focused) return
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return
      if (dropdownRef.current?.contains(e.target as Node)) return
      setFocused(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [focused])

  const addItem = useCallback((item: ChipItem) => {
    onChange([...selectedIds, item.id], [...selectedNames, item.name])
    setSearch('')
    inputRef.current?.focus()
  }, [selectedIds, selectedNames, onChange])

  const removeItem = useCallback((id: string) => {
    const idx = selectedIds.indexOf(id)
    if (idx === -1) return
    onChange(
      selectedIds.filter((_, i) => i !== idx),
      selectedNames.filter((_, i) => i !== idx),
    )
  }, [selectedIds, selectedNames, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !search && selectedIds.length > 0) {
      removeItem(selectedIds[selectedIds.length - 1])
    }
    if (e.key === 'Enter' && search.trim() && filtered.length > 0) {
      e.preventDefault()
      addItem(filtered[0])
    }
    if (e.key === 'Escape') {
      setFocused(false)
    }
  }, [search, selectedIds, filtered, addItem, removeItem])

  const dialogPortal = useMemo(() => {
    if (typeof window === 'undefined') return null
    return wrapperRef.current?.closest('[role="dialog"]') as HTMLElement | null
  }, [focused])

  const showDropdown = focused && filtered.length > 0

  return (
    <div
      ref={wrapperRef}
      onClick={() => inputRef.current?.focus()}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        padding: '6px 10px',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        background: 'var(--background)',
        cursor: 'text',
        minHeight: '36px',
        alignItems: 'center',
      }}
    >
      {selectedNames.map((name, i) => (
        <span
          key={selectedIds[i]}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            fontSize: '12px',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: '4px',
            background: chipColor.bg,
            color: chipColor.text,
            whiteSpace: 'nowrap',
          }}
        >
          {name}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeItem(selectedIds[i]) }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
              color: chipColor.text,
              opacity: 0.6,
              fontSize: '13px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder={selectedIds.length === 0 ? placeholder : ''}
        style={{
          flex: 1,
          minWidth: '80px',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '12px',
          fontFamily: 'inherit',
          color: 'var(--foreground)',
          padding: '2px 0',
        }}
      />
      {showDropdown && dropdownPos && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
            background: 'var(--popover, #fff)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            maxHeight: '180px',
            overflowY: 'auto',
            padding: '4px',
          }}
        >
          {filtered.slice(0, 15).map((item) => (
            <button
              key={item.id}
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); addItem(item) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 500,
                textAlign: 'left',
                border: 'none',
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
                color: 'inherit',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {item.name}
            </button>
          ))}
        </div>,
        dialogPortal || document.body,
      )}
    </div>
  )
}
