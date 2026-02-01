'use client'

import * as React from 'react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, ChevronDown, User, Loader2, Check } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type TeamMemberResponse = {
  items: Array<{
    userId: string
    userName: string
    userEmail: string
  }>
  total: number
}

type UserItem = {
  id: string
  name?: string | null
  email?: string | null
}

type GuardianSelectProps = {
  value?: string | null
  displayValue?: string | null
  onChange: (userId: string | null, user: UserItem | null) => void
  placeholder?: string
  disabled?: boolean
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }
  return '??'
}

function getAvatarColor(id: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-cyan-500',
  ]
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

export function GuardianSelect({
  value,
  displayValue,
  onChange,
  placeholder = 'Select...',
  disabled = false,
}: GuardianSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch users via team members API (returns org users with name search)
  const { data, isLoading } = useQuery({
    queryKey: ['users-search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return []

      const params = new URLSearchParams()
      params.set('search', debouncedSearch)
      params.set('pageSize', '20')

      const result = await apiCall<TeamMemberResponse>(`/api/fms_teams/members?${params}`)

      // Transform API response to UserItem format and dedupe by userId
      const seen = new Set<string>()
      return (result.result?.items || [])
        .filter((item) => {
          if (seen.has(item.userId)) return false
          seen.add(item.userId)
          return true
        })
        .map((item): UserItem => ({
          id: item.userId,
          name: item.userName || null,
          email: item.userEmail || null,
        }))
    },
    staleTime: 30 * 1000,
    enabled: isOpen && debouncedSearch.length >= 2,
  })

  const options = data || []

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Reset highlighted index when options change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [options])

  // Scroll highlighted into view
  useEffect(() => {
    if (listRef.current && isOpen) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement | undefined
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const handleSelect = useCallback((user: UserItem) => {
    onChange(user.id, user)
    setIsOpen(false)
    setSearchQuery('')
  }, [onChange])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null, null)
  }, [onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => Math.min(prev + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (options[highlightedIndex]) {
        handleSelect(options[highlightedIndex])
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full h-10 flex items-center gap-2.5 px-3 border rounded-lg bg-background hover:bg-accent/30 hover:border-border/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left group"
      >
        {value && displayValue ? (
          <>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0 ${getAvatarColor(value)}`}>
              {getInitials(displayValue)}
            </div>
            <span className="flex-1 text-sm font-medium truncate">{displayValue}</span>
          </>
        ) : (
          <>
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="flex-1 text-sm text-muted-foreground truncate">{placeholder}</span>
          </>
        )}
        {value && !disabled && (
          <X
            className="h-4 w-4 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            onClick={handleClear}
          />
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search users..."
                className="w-full h-8 pl-8 pr-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Searching...</span>
              </div>
            ) : searchQuery.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters...
              </div>
            ) : options.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No users found
              </div>
            ) : (
              options.map((user, index) => {
                const displayName = user.name || user.email || 'Unknown'
                const isSelected = user.id === value
                const isHighlighted = index === highlightedIndex

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelect(user)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      isHighlighted ? 'bg-accent' : 'hover:bg-accent/50'
                    } ${isSelected ? 'bg-accent/30' : ''}`}
                  >
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0 ${getAvatarColor(user.id)}`}>
                      {getInitials(user.name, user.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{displayName}</div>
                      {user.name && user.email && user.email !== user.name && (
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
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
