'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { QuoteWizardContent } from './QuoteWizardContent'
import { useDrawerTableFocus } from '../../../../hooks'

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
  const headerTableRef = React.useRef<HTMLDivElement>(null)

  const { handleOpenAutoFocus, handleCloseAutoFocus } = useDrawerTableFocus({
    isOpen: open,
    isContentReady: true,
    drawerTableRef: headerTableRef,
    mainTableRef,
  })

  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-full sm:max-w-full p-0 flex flex-col"
        onInteractOutside={(e: Event) => e.preventDefault()}
        hideCloseButton
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{mode === 'new' ? 'New Quote' : 'Quote Wizard'}</SheetTitle>
        </SheetHeader>
        <QuoteWizardContent
          quoteId={quoteId}
          mode={mode}
          onClose={onClose}
          onQuoteCreated={onQuoteCreated}
          headerTableRef={headerTableRef}
        />
      </SheetContent>
    </Sheet>
  )
}
