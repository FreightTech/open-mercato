'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { X } from 'lucide-react'
import { OfferDetailView } from './OfferDetailView'
import { OfferContextPanel } from './OfferContextPanel'

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
        className="p-0 overflow-hidden"
        style={{
          width: '85vw',
          maxWidth: '1400px',
          minWidth: '800px',
          transition: 'width 0.3s ease',
        }}
        hideCloseButton
        ariaTitle="Offer Details"
        overlayClassName="backdrop-blur-none"
      >
        <OfferDetailDrawerInner
          offerId={offerId}
          onClose={onClose}
          onDelete={onDelete}
        />
      </SheetContent>
    </Sheet>
  )
}

function OfferDetailDrawerInner({
  offerId,
  onClose,
  onDelete,
}: {
  offerId: string
  onClose: () => void
  onDelete?: () => void
}) {
  const [rfqId, setRfqId] = useState<string | null>(null)
  const [usedCurrencies, setUsedCurrencies] = useState<string[]>([])

  const handleOfferLoaded = useCallback((data: { rfqId: string | null; currencies: string[] }) => {
    setRfqId(data.rfqId)
    setUsedCurrencies(data.currencies)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header — close button */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          gap: '4px',
        }}
      >
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body — two panel layout */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Left panel: Offer detail */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <OfferDetailView offerId={offerId} onBack={onClose} onDelete={onDelete} onOfferLoaded={handleOfferLoaded} />
        </div>

        {/* Right panel: Context */}
        <OfferContextPanel
          offerId={offerId}
          rfqId={rfqId}
          usedCurrencies={usedCurrencies}
        />
      </div>
    </div>
  )
}
