'use client'

import * as React from 'react'
import { OfferWizardSheet } from './OfferWizardSheet'

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
    <OfferWizardSheet
      open={open}
      onOpenChange={(v) => { if (!v) onClose() }}
      existingOfferId={offerId}
    />
  )
}
