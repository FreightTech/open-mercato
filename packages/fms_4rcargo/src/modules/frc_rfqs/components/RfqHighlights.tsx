'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Plane,
  Building2,
  Calendar,
  User,
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

type RfqHighlightsData = {
  id: string
  name: string
  accountId: string | null
  accountName?: string | null
  contactId: string | null
  contactName?: string | null
  salesStage: string
  probability: number
  amount: string | null
  currencyCode: string
  deliveryStatus: string
  isDelayed: boolean
  originAirport: { code: string; longCode: string } | null
  destinationAirport: { code: string; longCode: string } | null
  shipmentReadyDate: string | null
  requiredAtDestinationDate: string | null
  assignedToId: string | null
  assignedToName?: string | null
}

export type RfqHighlightsProps = {
  rfq: RfqHighlightsData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  onDelete: () => void
  isDeleting: boolean
}

const SALES_STAGE_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  received: { label: 'Received', variant: 'secondary' },
  offer_sent: { label: 'Offer Sent', variant: 'default' },
  offer_accepted: { label: 'Accepted', variant: 'default' },
  closed_lost: { label: 'Lost', variant: 'destructive' },
}

const DELIVERY_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  awaiting: { label: 'Awaiting', color: 'bg-gray-100 text-gray-700' },
  in_transit: { label: 'In Transit', color: 'bg-blue-100 text-blue-700' },
  in_transit_delayed: { label: 'In Transit (Delayed)', color: 'bg-amber-100 text-amber-700' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700' },
  paid: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700' },
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

export function RfqHighlights({
  rfq,
  onFieldSave,
  onDelete,
  isDeleting,
}: RfqHighlightsProps) {
  const t = useT()
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)

  const stageConfig = SALES_STAGE_CONFIG[rfq.salesStage] ?? { label: rfq.salesStage, variant: 'secondary' as const }
  const deliveryConfig = DELIVERY_STATUS_CONFIG[rfq.deliveryStatus] ?? { label: rfq.deliveryStatus, color: 'bg-gray-100 text-gray-700' }

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
          href="/backend/frc-rfqs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('frc_rfqs.detail.backToList', 'Opportunities')}</span>
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
            {t('frc_rfqs.detail.delete', 'Delete')}
          </Button>

          {/* Delete confirmation popover */}
          {showDeleteConfirm && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-popover border rounded-lg shadow-lg p-4 w-64">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <span className="text-sm">
                  {t('frc_rfqs.detail.deleteConfirm', 'Delete this opportunity? This cannot be undone.')}
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
          <Plane className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Name */}
            <div className="font-medium">
              <InlineEditField
                value={rfq.name}
                placeholder={t('frc_rfqs.detail.namePlaceholder', 'Opportunity name')}
                onSave={(val) => onFieldSave('name', val)}
                required
              />
            </div>

            {/* Sales stage badge */}
            <Badge variant={stageConfig.variant} className="h-5 text-xs">
              {t(`frc_rfqs.salesStage.${rfq.salesStage}`, stageConfig.label)}
            </Badge>

            {/* Delivery status badge */}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${deliveryConfig.color}`}>
              {t(`frc_rfqs.deliveryStatus.${rfq.deliveryStatus}`, deliveryConfig.label)}
            </span>

            {rfq.isDelayed && (
              <Badge variant="destructive" className="h-5 text-xs">
                {t('frc_rfqs.detail.delayed', 'Delayed')}
              </Badge>
            )}

            <div className="h-4 w-px bg-border" />

            {/* Probability */}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="font-medium">{rfq.probability}%</span>
              <span>{t('frc_rfqs.detail.probability', 'probability')}</span>
            </div>

            {/* Amount */}
            {rfq.amount && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="text-sm font-medium">
                  {rfq.amount} {rfq.currencyCode}
                </div>
              </>
            )}
          </div>

          {/* Second row with route and dates */}
          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {/* Route */}
            {(rfq.originAirport || rfq.destinationAirport) && (
              <div className="flex items-center gap-1">
                <Plane className="h-3 w-3" />
                <span>
                  {rfq.originAirport?.code ?? '???'} → {rfq.destinationAirport?.code ?? '???'}
                </span>
              </div>
            )}

            {/* Client */}
            {rfq.accountName && (
              <div className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                <span>{rfq.accountName}</span>
              </div>
            )}

            {/* Contact */}
            {rfq.contactName && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{rfq.contactName}</span>
              </div>
            )}

            {/* Dates */}
            {rfq.shipmentReadyDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{t('frc_rfqs.detail.readyDate', 'Ready')}: {formatDate(rfq.shipmentReadyDate)}</span>
              </div>
            )}

            {rfq.requiredAtDestinationDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{t('frc_rfqs.detail.requiredDate', 'Required')}: {formatDate(rfq.requiredAtDestinationDate)}</span>
              </div>
            )}

            {/* Assigned to */}
            {rfq.assignedToName && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{t('frc_rfqs.detail.assignedTo', 'Assigned')}: {rfq.assignedToName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
