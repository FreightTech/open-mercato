'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'

export type InlineEditFieldProps = {
  value: string | null | undefined
  placeholder: string
  onSave: (value: string | null) => Promise<void>
  required?: boolean
  readOnly?: boolean
  className?: string
}

export function InlineEditField({
  value,
  placeholder,
  onSave,
  required = false,
  readOnly = false,
  className,
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [editValue, setEditValue] = React.useState(value ?? '')
  const [isSaving, setIsSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleSave = React.useCallback(async () => {
    if (required && !editValue.trim()) return
    const trimmed = editValue.trim() || null
    if (trimmed === (value ?? null)) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setIsSaving(false)
      setIsEditing(false)
    }
  }, [editValue, onSave, required, value])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'Escape') {
        setEditValue(value ?? '')
        setIsEditing(false)
      }
    },
    [handleSave, value]
  )

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  React.useEffect(() => {
    if (!isEditing) setEditValue(value ?? '')
  }, [value, isEditing])

  if (isSaving) {
    return (
      <span className={`flex items-center gap-1 ${className ?? 'text-sm'}`}>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </span>
    )
  }

  if (isEditing && !readOnly) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        placeholder={placeholder}
        className={`bg-transparent outline-none border-none p-0 m-0 w-full ${className ?? 'text-sm'}`}
      />
    )
  }

  return (
    <div
      onClick={readOnly ? undefined : () => setIsEditing(true)}
      className={`truncate ${readOnly ? '' : 'cursor-text'} ${className ?? 'text-sm'} ${
        value ? '' : 'text-muted-foreground'
      }`}
    >
      {value || placeholder}
    </div>
  )
}
