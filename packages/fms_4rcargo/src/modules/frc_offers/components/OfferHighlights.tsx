'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Plane,
  Calendar,
  Check,
  X,
  Edit2,
  Loader2,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Input } from '@open-mercato/ui/primitives/input'
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
  originAirport: { code: string; city: string | null } | null
  destinationAirport: { code: string; city: string | null } | null
}

export type OfferHighlightsProps = {
  offer: OfferHighlightsData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  onDelete: () => void
  isDeleting: boolean
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

type InlineEditFieldProps = {
  value: string | null | undefined
  placeholder: string
  onSave: (value: string | null) => Promise<void>
  required?: boolean
}

function InlineEditField({
  value,
  placeholder,
  onSave,
  required = false,
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [editValue, setEditValue] = React.useState(value ?? '')
  const [isSaving, setIsSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleSave = React.useCallback(async () => {
    if (required && !editValue.trim()) return
    setIsSaving(true)
    try {
      await onSave(editValue.trim() || null)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }, [editValue, onSave, required])

  const handleCancel = React.useCallback(() => {
    setEditValue(value ?? '')
    setIsEditing(false)
  }, [value])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'Escape') {
        handleCancel()
      }
    },
    [handleSave, handleCancel]
  )

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  React.useEffect(() => {
    setEditValue(value ?? '')
  }, [value])

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-7 text-sm w-40"
          disabled={isSaving}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || (required && !editValue.trim())}
          className="h-6 w-6 p-0"
        >
          {isSaving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3 text-green-600" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={isSaving}
          className="h-6 w-6 p-0"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="flex items-center gap-1 text-sm hover:text-primary transition-colors group"
    >
      <span className={value ? '' : 'text-muted-foreground'}>
        {value || placeholder}
      </span>
      <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

export function OfferHighlights({
  offer,
  onFieldSave,
  onDelete,
  isDeleting,
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
            {/* Name */}
            <div className="font-medium">
              <InlineEditField
                value={offer.name}
                placeholder={t('frc_offers.detail.namePlaceholder', 'Offer name')}
                onSave={(val) => onFieldSave('name', val)}
                required
              />
            </div>

            {/* Status badge */}
            <Badge variant={statusConfig.variant} className="h-5 text-xs">
              {t(`frc_offers.status.${offer.status}`, statusConfig.label)}
            </Badge>

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
