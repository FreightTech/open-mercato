import React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'

type ChipOption = {
  value: string
  label: string
  icon?: React.ReactNode
}

type ChipSelectorProps = {
  options: ChipOption[]
  selected: string | string[]
  onChange: (value: string | string[]) => void
  multiple?: boolean
  label?: string
}

export function ChipSelector({ options, selected, onChange, multiple = false, label }: ChipSelectorProps) {
  const selectedSet = new Set(Array.isArray(selected) ? selected : selected ? [selected] : [])

  const handleClick = (value: string) => {
    if (multiple) {
      const current = new Set(Array.isArray(selected) ? selected : [])
      if (current.has(value)) {
        current.delete(value)
      } else {
        current.add(value)
      }
      onChange(Array.from(current))
    } else {
      onChange(value === selected ? '' : value)
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      {label && (
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap flex-shrink-0">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isSelected = selectedSet.has(option.value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleClick(option.value)}
              className={cn(
                'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                'border cursor-pointer',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {option.icon && <span className="mr-1 flex items-center">{option.icon}</span>}
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
