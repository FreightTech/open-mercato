'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Plane,
  Calendar,
  Loader2,
  Trash2,
  AlertTriangle,
  Mail,
  Package,
} from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OfferHighlightsData = {
  id: string
  name: string
  rfqId: string | null
  rfqName: string | null
  carrierId: string | null
  carrierName?: string | null
  status: string
  awbNumber: string | null
  connectionMethod: string | null
  departureDate: string | null
  currencyCode: string
  totalRate: string | null
  cargoItemsCount: number
  originAirport: { code: string; city: string | null } | null
  destinationAirport: { code: string; city: string | null } | null
}

export type OfferHighlightsProps = {
  offer: OfferHighlightsData
  onDelete: () => void
  isDeleting: boolean
  onSendWithTemplate: () => void
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  sent: { label: 'Sent', variant: 'default' },
  booked: { label: 'Booked', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  expired: { label: 'Expired', variant: 'outline' },
}

const CONNECTION_METHOD_LABELS: Record<string, string> = {
  '4r_consol_truck': '4R Consol Truck',
  direct: 'Direct',
  connecting_flight: 'Connecting Flight',
}

/**
 * Format currency value with 2 decimal places
 */
function formatCurrency(value: string | null): string {
  if (!value) return ''
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  return num.toFixed(2)
}

export function OfferHighlights({
  offer,
  onDelete,
  isDeleting,
  onSendWithTemplate,
}: OfferHighlightsProps) {
  const t = useT()
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)

  const statusConfig = STATUS_CONFIG[offer.status] ?? { label: offer.status, variant: 'secondary' as const }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-3">
      {/* Top bar with back link and actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/backend/frc-offers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('frc_offers.detail.backToList', 'Offers')}</span>
        </Link>
        <div className="flex items-center gap-2 relative">
          {/* Send with Template button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSendWithTemplate}
            className="h-8"
          >
            <Mail className="h-3 w-3 mr-1" />
            {t('frc_offers.actions.send_with_template', 'Send')}
          </Button>

          {/* Delete button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/5"
          >
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            {t('frc_offers.detail.delete', 'Delete')}
          </Button>

          {/* Delete confirmation popover */}
          {showDeleteConfirm && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-popover border rounded-lg shadow-lg p-4 w-64">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <span className="text-sm">
                  {t('frc_offers.detail.deleteConfirm', 'Delete this offer? This cannot be undone.')}
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    onDelete()
                  }}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main info row */}
      <div className="flex items-center gap-4 py-3 border-b">
        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Name (read-only) */}
            <span className="font-medium text-lg">{offer.name}</span>

            {/* Status badge */}
            <Badge variant={statusConfig.variant} className="h-5 text-xs">
              {t(`frc_offers.status.${offer.status}`, statusConfig.label)}
            </Badge>

            {/* Total price */}
            {offer.totalRate && (
              <>
                <div className="h-4 w-px bg-border" />
                <span className="font-semibold text-primary">
                  {formatCurrency(offer.totalRate)} {offer.currencyCode}
                </span>
              </>
            )}

            {/* Cargo items count */}
            <>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Package className="h-3 w-3" />
                <span>
                  {offer.cargoItemsCount} {offer.cargoItemsCount === 1 
                    ? t('frc_offers.detail.cargoItem', 'item') 
                    : t('frc_offers.detail.cargoItems', 'items')}
                </span>
              </div>
            </>

            {/* AWB Number */}
            {offer.awbNumber && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground">AWB:</span>
                  <span className="font-mono">{offer.awbNumber}</span>
                </div>
              </>
            )}

            {/* Connection Method */}
            {offer.connectionMethod && (
              <>
                <div className="h-4 w-px bg-border" />
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {CONNECTION_METHOD_LABELS[offer.connectionMethod] ?? offer.connectionMethod}
                </span>
              </>
            )}
          </div>

          {/* Second row with route, dates, and linked RFQ */}
          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {/* Route */}
            {(offer.originAirport || offer.destinationAirport) && (
              <div className="flex items-center gap-1">
                <Plane className="h-3 w-3" />
                <span>
                  {offer.originAirport?.code ?? '???'} → {offer.destinationAirport?.code ?? '???'}
                </span>
              </div>
            )}

            {/* Departure Date */}
            {offer.departureDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{t('frc_offers.detail.departure', 'Departure')}: {formatDate(offer.departureDate)}</span>
              </div>
            )}

            {/* Linked RFQ */}
            {offer.rfqName && (
              <>
                <div className="h-4 w-px bg-border" />
                <Link
                  href={`/backend/frc-rfqs/${offer.rfqId}`}
                  className="text-primary hover:underline"
                >
                  {t('frc_offers.detail.linkedRfq', 'RFQ')}: {offer.rfqName}
                </Link>
              </>
            )}

            {/* Carrier */}
            {offer.carrierName && (
              <div className="flex items-center gap-1">
                <span>{t('frc_offers.detail.carrier', 'Carrier')}: {offer.carrierName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
