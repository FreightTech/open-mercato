import React, { useState, useCallback, useEffect } from 'react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Plane,
  Building2,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import type { FrcRfqBoardCard, BoardColumn } from '../lib/board-types'
import { getTimeAgo } from '../lib/board-config'

type FrcRfqDetailSheetProps = {
  task: FrcRfqBoardCard | null
  columns: BoardColumn[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onOfferCreated: () => void
}

const DETAIL_WIDTH = '55vw'
const DETAIL_MAX = '960px'
const DETAIL_MIN = '640px'

type FrcOffer = {
  id: string
  name: string
  status: string
  awbNumber: string | null
  totalRate: string | null
  currencyCode: string
  createdAt: string
}

function DeleteConfirmPopover({
  open,
  onConfirm,
  onCancel,
  deleting,
  t,
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
  t: (key: string, fallback?: string) => string
}) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        marginTop: '6px',
        zIndex: 50,
        background: 'var(--popover)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        padding: '14px 16px',
        width: '260px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <AlertTriangle style={{ width: 16, height: 16, color: 'var(--destructive)', flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: '13px', lineHeight: 1.4 }}>
          {t('frc_rfqs.board.detail.deleteConfirm', 'Are you sure you want to delete this RFQ? This action cannot be undone.')}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={deleting}
          style={{
            padding: '5px 12px',
            borderRadius: '9999px',
            border: '1px solid var(--border)',
            background: 'var(--background)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t('frc_rfqs.board.detail.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={deleting}
          style={{
            padding: '5px 12px',
            borderRadius: '9999px',
            border: '1.5px solid var(--destructive)',
            background: 'var(--background)',
            color: 'var(--destructive)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: deleting ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: deleting ? 0.6 : 1,
          }}
        >
          {deleting ? t('frc_rfqs.board.detail.deleting', 'Deleting...') : t('frc_rfqs.board.detail.delete', 'Delete')}
        </button>
      </div>
    </div>
  )
}

export function FrcRfqDetailSheet({
  task,
  columns,
  open,
  onOpenChange,
  onOfferCreated,
}: FrcRfqDetailSheetProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [creatingOffer, setCreatingOffer] = useState(false)

  // Fetch offers for this RFQ
  const { data: rfqOffers = [] } = useQuery<FrcOffer[]>({
    queryKey: ['frc-rfq-offers', task?.id],
    queryFn: async () => {
      if (!task?.id) return []
      const res = await apiCall<{ items: FrcOffer[] }>(`/api/frc_offers/offers?rfqId=${task.id}`)
      if (!res.ok || !res.result) return []
      return res.result.items ?? []
    },
    enabled: !!task?.id && open,
  })

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleDelete = useCallback(async () => {
    if (!task) return
    setDeleting(true)
    try {
      await apiCall(`/api/frc_rfqs/rfqs/${task.id}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['frc-rfq-board'] })
      onOpenChange(false)
    } catch {
      flash('Failed to delete RFQ', 'error')
    } finally {
      setDeleting(false)
    }
  }, [task, queryClient, onOpenChange])

  const handleCreateOffer = useCallback(async () => {
    if (!task) return
    setCreatingOffer(true)
    try {
      // Generate offer name based on RFQ name and timestamp
      const offerName = `Offer - ${task.name}`
      const res = await apiCall<{ id: string; name: string }>('/api/frc_offers/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: task.id,
          name: offerName,
        }),
      })

      if (!res.ok || !res.result?.id) {
        flash('Failed to create offer', 'error')
        return
      }

      // Update RFQ status to offer_sent if still received
      if (task.salesStage === 'received') {
        await apiCall(`/api/frc_rfqs/rfqs/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salesStage: 'offer_sent' }),
        })
      }

      flash(t('frc_rfqs.board.detail.offerCreated', 'Offer created successfully'), 'success')
      queryClient.invalidateQueries({ queryKey: ['frc-rfq-offers', task.id] })
      queryClient.invalidateQueries({ queryKey: ['frc-rfq-board'] })
      onOfferCreated()
    } catch {
      flash('Failed to create offer', 'error')
    } finally {
      setCreatingOffer(false)
    }
  }, [task, queryClient, onOfferCreated, t])

  useEffect(() => {
    if (!open) {
      setShowDeleteConfirm(false)
    }
  }, [open])

  if (!task) return null

  const hasRoute = task.originAirportCode || task.destinationAirportCode
  const currentColumn = columns.find((col) => col.id === task.salesStage)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{
          width: DETAIL_WIDTH,
          maxWidth: DETAIL_MAX,
          minWidth: DETAIL_MIN,
        }}
        hideCloseButton
        ariaTitle="RFQ Details"
        overlayClassName="backdrop-blur-none"
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Scrollable body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label={t('ui.dialog.close.ariaLabel', 'Close')}
              style={{ position: 'absolute', top: '16px', right: '20px', zIndex: 1 }}
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div>
              <h2 className="text-lg font-semibold pr-8">{task.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                {currentColumn && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: currentColumn.color + '20', color: currentColumn.color }}
                  >
                    {currentColumn.title}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {t('frc_rfqs.board.detail.updated', 'Updated')} {getTimeAgo(task.updatedAt)}
                </span>
              </div>
            </div>

            {/* Details card */}
            <div className="rounded-lg border bg-card">
              <div className="p-4 space-y-4">
                {/* Route */}
                {hasRoute && (
                  <div className="flex items-center gap-3">
                    <Plane className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.route', 'Route')}</div>
                      <div className="font-medium">
                        {task.originAirportCode || '???'} → {task.destinationAirportCode || '???'}
                      </div>
                      {(task.originAirportName || task.destinationAirportName) && (
                        <div className="text-xs text-muted-foreground">
                          {task.originAirportName} → {task.destinationAirportName}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Client */}
                {task.accountName && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.client', 'Client')}</div>
                      <div className="font-medium">{task.accountName}</div>
                    </div>
                  </div>
                )}

                {/* Product & Commodity */}
                {(task.product || task.commodity) && (
                  <div className="grid grid-cols-2 gap-4">
                    {task.product && (
                      <div>
                        <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.product', 'Product')}</div>
                        <div className="font-medium">{task.product}</div>
                      </div>
                    )}
                    {task.commodity && (
                      <div>
                        <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.commodity', 'Commodity')}</div>
                        <div className="font-medium">{task.commodity}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Cargo details */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.pieces', 'Pieces')}</div>
                    <div className="font-medium">{task.totalPieces}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.chargeableWeight', 'Chg. Weight')}</div>
                    <div className="font-medium">{task.totalChargeableWeight} kg</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.probability', 'Probability')}</div>
                    <div className="font-medium">{task.probability}%</div>
                  </div>
                </div>

                {/* Amount */}
                {task.amount && (
                  <div>
                    <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.amount', 'Amount')}</div>
                    <div className="font-medium">{task.amount} {task.currencyCode}</div>
                  </div>
                )}

                {/* Description */}
                {task.description && (
                  <div>
                    <div className="text-xs text-muted-foreground">{t('frc_rfqs.board.detail.description', 'Description')}</div>
                    <div className="text-sm">{task.description}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Offers section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">{t('frc_rfqs.board.detail.offers', 'Offers')}</h3>
                <span className="text-xs text-muted-foreground">({rfqOffers.length})</span>
              </div>
              {rfqOffers.length > 0 ? (
                <div className="space-y-2">
                  {rfqOffers.map((offer) => (
                    <div
                      key={offer.id}
                      className="rounded-md border p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-sm">{offer.name}</div>
                        {offer.awbNumber && (
                          <div className="text-xs text-muted-foreground">AWB: {offer.awbNumber}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                          {offer.status}
                        </span>
                        {offer.totalRate && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {offer.totalRate} {offer.currencyCode}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                  {t('frc_rfqs.board.detail.noOffers', 'No offers yet')}
                </div>
              )}
            </div>

            {/* Delete button */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  border: '1.5px solid var(--destructive)',
                  background: 'var(--background)',
                  color: 'var(--destructive)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Trash2 style={{ width: 12, height: 12 }} />
                {t('frc_rfqs.board.detail.delete', 'Delete')}
              </button>
              <DeleteConfirmPopover
                open={showDeleteConfirm}
                onConfirm={() => { setShowDeleteConfirm(false); handleDelete() }}
                onCancel={() => setShowDeleteConfirm(false)}
                deleting={deleting}
                t={t}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
              padding: '12px 24px',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
              background: 'var(--card)',
            }}
          >
            <Button onClick={handleCreateOffer} disabled={creatingOffer}>
              {creatingOffer
                ? t('frc_rfqs.board.detail.creatingOffer', 'Creating...')
                : t('frc_rfqs.board.detail.createOffer', 'Create Offer')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
