'use client'

import * as React from 'react'
import { Badge } from '@open-mercato/ui/primitives/badge'

type ContractorDetailSectionProps = {
  title: string
  count?: number
  actions?: React.ReactNode
  children: React.ReactNode
}

export function ContractorDetailSection({
  title,
  count,
  actions,
  children,
}: ContractorDetailSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium tracking-wider uppercase text-muted-foreground">
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
