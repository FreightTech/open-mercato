'use client'

import * as React from 'react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { OfferDetailView } from './OfferDetailView'

type OfferDetailDrawerProps = {
  offerId: string | null
  open: boolean
  onClose: () => void
  onDelete?: () => void
  mainTableRef?: React.RefObject<HTMLDivElement | null>
}

export function OfferDetailDrawer({
  offerId,
  open,
  onClose,
  onDelete,
}: OfferDetailDrawerProps) {
  if (!offerId) return null
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent
        side="right"
        className="p-0 overflow-y-auto"
        style={{ width: '680px', maxWidth: '680px' }}
        hideCloseButton
      >
        <OfferDetailView offerId={offerId} onBack={onClose} onDelete={onDelete} />
      </SheetContent>
    </Sheet>
  )
}
