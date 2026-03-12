'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'

type ContractorDetailSectionProps = {
  icon: LucideIcon
  title: string
  count?: number
  actions?: React.ReactNode
  children: React.ReactNode
}

export function ContractorDetailSection({
  icon: Icon,
  title,
  count,
  actions,
  children,
}: ContractorDetailSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            {title}
          </h3>
          {count != null && count > 0 && (
            <Badge variant="secondary" className="h-5 text-xs px-1.5 rounded-full">
              {count}
            </Badge>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
