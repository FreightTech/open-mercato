'use client'

import * as React from 'react'
import { useCallback } from 'react'
import { X } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { ConsoleWizardContent } from './ConsoleWizardContent'

interface ConsoleWizardDrawerProps {
  open: boolean
  onClose: () => void
  onCreated?: (consoleId: string) => void | Promise<void>
}

export function ConsoleWizardDrawer({
  open,
  onClose,
  onCreated,
}: ConsoleWizardDrawerProps) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  const handleCreated = useCallback(
    async (consoleId: string) => {
      await onCreated?.(consoleId)
      onClose()
    },
    [onCreated, onClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-background z-50 flex flex-col"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
        <h2 className="text-xl font-semibold">New Console</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <ConsoleWizardContent onCreated={handleCreated} onCancel={onClose} />
      </div>
    </div>
  )
}
