'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'

export type SelectOption = {
  value: string
  label: string
}

export type InlineSelectFieldProps = {
  value: string | null | undefined
  options: SelectOption[]
  placeholder: string
  onSave: (value: string | null) => Promise<void>
  readOnly?: boolean
  renderValue?: (value: string, option: SelectOption | undefined) => React.ReactNode
}

export function InlineSelectField({
  value,
  options,
  placeholder,
  onSave,
  readOnly = false,
  renderValue,
}: InlineSelectFieldProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const currentOption = options.find((o) => o.value === value)

  const handleSelect = React.useCallback(
    async (optionValue: string) => {
      setIsOpen(false)
      if (optionValue === value) return
      setIsSaving(true)
      try {
        await onSave(optionValue || null)
      } finally {
        setIsSaving(false)
      }
    },
    [onSave, value]
  )

  React.useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  if (readOnly) {
    const display = renderValue
      ? renderValue(value || '', currentOption)
      : currentOption?.label || value || placeholder
    return <span className="text-sm">{display}</span>
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
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm cursor-pointer"
      >
        {renderValue ? (
          renderValue(value || '', currentOption)
        ) : (
          <span className={value ? '' : 'text-muted-foreground'}>
            {currentOption?.label || placeholder}
          </span>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 min-w-[140px] bg-popover border rounded-md shadow-md py-1 max-h-[200px] overflow-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${
                option.value === value ? 'bg-accent/50 font-medium' : ''
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
