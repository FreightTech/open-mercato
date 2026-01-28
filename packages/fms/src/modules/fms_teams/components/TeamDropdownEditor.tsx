'use client'

import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Plus, Check } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

type TeamOption = {
  value: string | null
  label: string
}

type TeamDropdownEditorProps = {
  value: string | null
  teams: TeamOption[]
  onChange: (val: string | null) => void
  onSave: (val: string | null, clearEditing?: boolean) => void
  onCancel: () => void
  onTeamCreated: (team: { id: string; name: string }) => void
}

export function TeamDropdownEditor({
  value,
  teams,
  onChange,
  onSave,
  onCancel,
  onTeamCreated,
}: TeamDropdownEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(value)
  const [showDropdown, setShowDropdown] = useState(true)
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const cellRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Options including "No team" at the top
  const options: TeamOption[] = [
    { value: null, label: '(No team)' },
    ...teams,
  ]

  useEffect(() => {
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect()
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft
      setPosition({
        top: rect.bottom + scrollTop + 2,
        left: rect.left + scrollLeft,
        width: Math.max(rect.width, 200),
      })
    }
  }, [])

  useEffect(() => {
    if (showCreateInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showCreateInput])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isOutsideCell = cellRef.current && !cellRef.current.contains(e.target as Node)
      const isOutsideDropdown = !dropdownRef.current || !dropdownRef.current.contains(e.target as Node)

      if (isOutsideCell && isOutsideDropdown) {
        setShowDropdown(false)
        onSave(selectedId, true)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onSave, selectedId])

  const handleSelect = (optionValue: string | null) => {
    setSelectedId(optionValue)
    onChange(optionValue)
    setShowDropdown(false)
    onSave(optionValue, true)
  }

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      flash('Team name is required', 'error')
      return
    }

    setIsCreating(true)
    try {
      const response = await apiCall<{ id: string; error?: string }>('/api/fms_teams/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim() }),
      })

      if (response.ok && response.result) {
        flash('Team created', 'success')
        const newTeam = { id: response.result.id, name: newTeamName.trim() }
        onTeamCreated(newTeam)
        setSelectedId(newTeam.id)
        onChange(newTeam.id)
        setShowDropdown(false)
        onSave(newTeam.id, true)
      } else {
        const error = response.result?.error || 'Failed to create team'
        flash(error, 'error')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsCreating(false)
      setShowCreateInput(false)
      setNewTeamName('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCreateInput) {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        handleCreateTeam()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setShowCreateInput(false)
        setNewTeamName('')
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex((prev) => (prev < options.length ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      if (highlightedIndex === options.length) {
        // "Create new team" option
        setShowCreateInput(true)
      } else if (highlightedIndex < options.length) {
        handleSelect(options[highlightedIndex].value)
      }
    } else if (e.key === 'Tab') {
      setShowDropdown(false)
      onSave(selectedId, false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setShowDropdown(false)
      onCancel()
    }
  }

  const selectedLabel = options.find((opt) => opt.value === selectedId)?.label || 'Select team...'

  return (
    <>
      <div
        ref={cellRef}
        className="hot-cell-editor flex items-center min-h-[28px] px-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
      >
        <span className="truncate text-sm">{selectedLabel}</span>
      </div>

      {showDropdown &&
        ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            className="bg-popover border border-border rounded-md shadow-lg text-popover-foreground"
            style={{
              position: 'absolute',
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 10000,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {options.map((option, index) => {
              const isSelected = option.value === selectedId
              const isHighlighted = index === highlightedIndex
              return (
                <div
                  key={option.value ?? 'null'}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm ${
                    isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                  } ${isSelected ? 'bg-accent/50' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(option.value)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                </div>
              )
            })}

            <div className="border-t border-border" />

            {showCreateInput ? (
              <div className="px-3 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter team name..."
                  className="w-full px-2 py-1 text-sm border border-input rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={isCreating}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleCreateTeam}
                    disabled={isCreating || !newTeamName.trim()}
                    className="flex-1 px-2 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isCreating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateInput(false)
                      setNewTeamName('')
                    }}
                    className="px-2 py-1 text-sm border border-input rounded hover:bg-accent hover:text-accent-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
                  highlightedIndex === options.length
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setShowCreateInput(true)
                }}
                onMouseEnter={() => setHighlightedIndex(options.length)}
              >
                <Plus className="w-4 h-4" />
                <span>Create new team...</span>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  )
}
