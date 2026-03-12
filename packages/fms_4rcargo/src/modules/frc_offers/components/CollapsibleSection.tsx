'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type CollapsibleSectionProps = {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  icon?: LucideIcon
  actions?: React.ReactNode
  count?: number
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  icon: Icon,
  actions,
  count,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  const handleToggle = React.useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleToggle()
      }
    },
    [handleToggle]
  )

  return (
    <div className="bg-card border rounded-lg">
      <div className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-t-lg transition-colors">
        {/* Clickable toggle area - using div with role="button" to avoid nested button issues */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          className="flex items-center gap-2 flex-1 cursor-pointer select-none"
        >
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          <h2 className="text-sm font-medium">{title}</h2>
          {typeof count === 'number' && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Actions rendered outside the clickable toggle area */}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
          {/* Chevron is part of the toggle - clicking it also toggles */}
          <div
            role="button"
            tabIndex={-1}
            onClick={handleToggle}
            className="cursor-pointer"
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
