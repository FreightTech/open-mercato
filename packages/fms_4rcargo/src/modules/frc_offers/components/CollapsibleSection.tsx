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

  return (
    <div className="bg-card border rounded-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 rounded-t-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          <h2 className="text-sm font-medium">{title}</h2>
          {typeof count === 'number' && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions && (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
              {actions}
            </div>
          )}
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
