'use client'

import { Badge } from '@open-mercato/ui/primitives/badge'

export function ProjectBLInstructionsSection() {
  return (
    <div className="border rounded-lg bg-white">
      <div className="px-3 py-1.5 border-b flex items-center justify-between">
        <h3 className="text-sm font-medium">Bill of Lading Instructions</h3>
        <Badge variant="secondary" className="text-xs">
          Coming Soon
        </Badge>
      </div>
      <div className="p-3">
        <div className="bg-muted/50 rounded-md py-2 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            BL draft confirmation workflow will be available here
          </p>
        </div>
      </div>
    </div>
  )
}
