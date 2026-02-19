import React, { useState, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Label } from '@open-mercato/ui/primitives/label'
import { X } from 'lucide-react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { FrcRfqBoardCard } from '../lib/board-types'

type FrcRfqCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (rfq: Partial<FrcRfqBoardCard>) => void
}

export function FrcRfqCreateDialog({ open, onOpenChange, onCreated }: FrcRfqCreateDialogProps) {
  const t = useT()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    product: '',
    commodity: '',
    description: '',
    probability: '50',
  })

  const resetForm = useCallback(() => {
    setForm({
      name: '',
      product: '',
      commodity: '',
      description: '',
      probability: '50',
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) {
      flash(t('frc_rfqs.board.createDialog.nameRequired', 'Name is required'), 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await apiCall<{ id: string; name: string }>('/api/frc_rfqs/rfqs', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          product: form.product.trim() || null,
          commodity: form.commodity.trim() || null,
          description: form.description.trim() || null,
          probability: parseInt(form.probability, 10) || 0,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok || !res.result?.id) {
        flash(t('frc_rfqs.board.createDialog.failed', 'Failed to create RFQ'), 'error')
        return
      }

      resetForm()
      onCreated({
        id: res.result.id,
        name: res.result.name,
        salesStage: 'received',
        probability: parseInt(form.probability, 10) || 0,
      })
    } catch {
      flash(t('frc_rfqs.board.createDialog.failed', 'Failed to create RFQ'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [form, onCreated, resetForm, t])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetForm()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetForm],
  )

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{ width: '480px', maxWidth: '90vw' }}
        hideCloseButton
        ariaTitle="Create RFQ"
        overlayClassName="backdrop-blur-none"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div>
            <div className="text-base font-semibold">
              {t('frc_rfqs.board.createDialog.title', 'Create RFQ')}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('frc_rfqs.board.createDialog.description', 'Add a new air cargo RFQ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ml-3 flex-shrink-0"
            aria-label={t('ui.dialog.close.ariaLabel', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="name">{t('frc_rfqs.board.createDialog.name', 'Name')} *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder={t('frc_rfqs.board.createDialog.namePlaceholder', 'e.g., Company/Origin/Dest/Date')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product">{t('frc_rfqs.board.createDialog.product', 'Product')}</Label>
            <Input
              id="product"
              value={form.product}
              onChange={(e) => updateField('product', e.target.value)}
              placeholder={t('frc_rfqs.board.createDialog.productPlaceholder', 'e.g., General Cargo, DG, Perishable')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="commodity">{t('frc_rfqs.board.createDialog.commodity', 'Commodity')}</Label>
            <Input
              id="commodity"
              value={form.commodity}
              onChange={(e) => updateField('commodity', e.target.value)}
              placeholder={t('frc_rfqs.board.createDialog.commodityPlaceholder', 'Commodity description')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="probability">{t('frc_rfqs.board.createDialog.probability', 'Probability (%)')}</Label>
            <Input
              id="probability"
              type="number"
              min="0"
              max="100"
              value={form.probability}
              onChange={(e) => updateField('probability', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('frc_rfqs.board.createDialog.description', 'Description')}</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder={t('frc_rfqs.board.createDialog.descriptionPlaceholder', 'Notes or special requirements')}
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '12px 24px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            background: 'var(--card)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              {t('ui.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? t('frc_rfqs.board.createDialog.creating', 'Creating...')
                : t('frc_rfqs.board.createDialog.create', 'Create RFQ')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
