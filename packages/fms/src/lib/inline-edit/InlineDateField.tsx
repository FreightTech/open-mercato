'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { Calendar } from '@open-mercato/ui/primitives/calendar'

export type InlineDateFieldProps = {
  value: string | null | undefined
  placeholder: string
  onSave: (value: string | null) => Promise<void>
  readOnly?: boolean
}

function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function toDate(dateStr: string | null | undefined): Date | undefined {
  if (!dateStr) return undefined
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return undefined
    return date
  } catch {
    return undefined
  }
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function InlineDateField({
  value,
  placeholder,
  onSave,
  readOnly = false,
}: InlineDateFieldProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  const selectedDate = toDate(value)

  const handleSelect = React.useCallback(
    async (day: Date | undefined) => {
      if (!day) return
      const newVal = toISODate(day)
      const oldVal = selectedDate ? toISODate(selectedDate) : null
      if (newVal === oldVal) {
        setIsOpen(false)
        return
      }
      setIsOpen(false)
      setIsSaving(true)
      try {
        await onSave(newVal)
      } finally {
        setIsSaving(false)
      }
    },
    [onSave, selectedDate]
  )

  const handleClear = React.useCallback(async () => {
    setIsOpen(false)
    if (!value) return
    setIsSaving(true)
    try {
      await onSave(null)
    } finally {
      setIsSaving(false)
    }
  }, [onSave, value])

  const handleToday = React.useCallback(async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const newVal = toISODate(today)
    const oldVal = selectedDate ? toISODate(selectedDate) : null
    if (newVal === oldVal) {
      setIsOpen(false)
      return
    }
    setIsOpen(false)
    setIsSaving(true)
    try {
      await onSave(newVal)
    } finally {
      setIsSaving(false)
    }
  }, [onSave, selectedDate])

  if (isSaving) {
    return (
      <span className="flex items-center gap-1 text-sm">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </span>
    )
  }

  if (readOnly) {
    return (
      <div className={`text-sm truncate ${value ? '' : 'text-muted-foreground'}`}>
        {formatDateDisplay(value) || placeholder}
      </div>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div
          className={`text-sm truncate cursor-pointer ${value ? '' : 'text-muted-foreground'}`}
        >
          {formatDateDisplay(value) || placeholder}
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto bg-muted" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          defaultMonth={selectedDate}
          navLayout="around"
          autoFocus
        />
        <div className="flex items-center justify-between border-t px-3 py-2">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-primary hover:underline focus:outline-none"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="text-sm text-primary hover:underline focus:outline-none"
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
