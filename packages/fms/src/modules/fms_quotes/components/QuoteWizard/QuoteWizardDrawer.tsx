'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { X } from 'lucide-react'
import { QuoteWizardContent } from './QuoteWizardContent'

type QuoteWizardDrawerProps = {
  quoteId: string | null
  mode: 'new' | 'edit'
  open: boolean
  onClose: () => void
  onQuoteCreated?: (quoteId: string) => void
  /** Ref to the main table for focus restoration when drawer closes */
  mainTableRef?: React.RefObject<HTMLDivElement | null>
}

export function QuoteWizardDrawer({ quoteId, mode, open, onClose, onQuoteCreated, mainTableRef }: QuoteWizardDrawerProps) {
  const handleOpenAutoFocus = React.useCallback((event: Event) => {
    event.preventDefault()
  }, [])

  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    event.preventDefault()
    mainTableRef?.current?.focus()
  }, [mainTableRef])

  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-full sm:max-w-full p-0 flex flex-col"
        onInteractOutside={(e: Event) => e.preventDefault()}
        hideCloseButton
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{mode === 'new' ? 'New Quote' : 'Quote Wizard'}</SheetTitle>
        </SheetHeader>
        <QuoteWizardContent
          quoteId={quoteId}
          mode={mode}
          onClose={onClose}
          onQuoteCreated={onQuoteCreated}
        />
      </SheetContent>
    </Sheet>
  )
}
