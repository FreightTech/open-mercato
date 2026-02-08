import React, { useState, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { ChipSelector } from './ChipSelector'

type RfqCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const DIRECTION_OPTIONS = [
  { value: 'import', label: 'Import' },
  { value: 'export', label: 'Export' },
  { value: 'both', label: 'Both' },
]

const TRANSPORT_MODE_OPTIONS = [
  { value: 'sea', label: 'Sea' },
  { value: 'air', label: 'Air' },
  { value: 'road', label: 'Road' },
  { value: 'rail', label: 'Rail' },
  { value: 'barge', label: 'Barge' },
]

const CARGO_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'dangerous', label: 'Dangerous' },
  { value: 'perishable', label: 'Perishable' },
  { value: 'oog', label: 'OOG' },
]

export function RfqCreateDialog({ open, onOpenChange, onCreated }: RfqCreateDialogProps) {
  const t = useT()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    companyName: '',
    contactPerson: '',
    origin: '',
    destination: '',
    direction: '' as string,
    transportMode: '' as string,
    cargoType: '' as string,
    containerCount: '',
    context: '',
  })

  const resetForm = useCallback(() => {
    setForm({
      title: '',
      companyName: '',
      contactPerson: '',
      origin: '',
      destination: '',
      direction: '',
      transportMode: '',
      cargoType: '',
      containerCount: '',
      context: '',
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      await apiCall('/api/fms_offers/rfq', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title || null,
          companyName: form.companyName || null,
          contactPerson: form.contactPerson || null,
          origin: form.origin || null,
          destination: form.destination || null,
          direction: form.direction || null,
          transportMode: form.transportMode || null,
          cargoType: form.cargoType || null,
          containerCount: form.containerCount ? Number(form.containerCount) : null,
          context: form.context || null,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      resetForm()
      onCreated()
    } catch (error) {
      console.error('[RfqCreateDialog] Failed to create RFQ:', error)
    } finally {
      setSubmitting(false)
    }
  }, [form, onCreated, resetForm])

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{t('tasks_board.rfqDialog.title', 'Create RFQ')}</DialogTitle>
          <DialogDescription>
            {t('tasks_board.rfqDialog.description', 'Add a new Request for Quotation to the board')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rfq-title" className="text-xs">
                {t('tasks_board.rfqDialog.fields.title', 'RFQ Title')}
              </Label>
              <Input
                id="rfq-title"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="RFQ-2026-001"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rfq-company" className="text-xs">
                {t('tasks_board.rfqDialog.fields.companyName', 'Company')}
              </Label>
              <Input
                id="rfq-company"
                value={form.companyName}
                onChange={(event) => updateField('companyName', event.target.value)}
                placeholder="Siemens AG"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rfq-contact" className="text-xs">
              {t('tasks_board.rfqDialog.fields.contactPerson', 'Contact Person')}
            </Label>
            <Input
              id="rfq-contact"
              value={form.contactPerson}
              onChange={(event) => updateField('contactPerson', event.target.value)}
              placeholder="Max Mustermann"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rfq-origin" className="text-xs">
                {t('tasks_board.rfqDialog.fields.origin', 'Origin')}
              </Label>
              <Input
                id="rfq-origin"
                value={form.origin}
                onChange={(event) => updateField('origin', event.target.value)}
                placeholder="Hamburg"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rfq-destination" className="text-xs">
                {t('tasks_board.rfqDialog.fields.destination', 'Destination')}
              </Label>
              <Input
                id="rfq-destination"
                value={form.destination}
                onChange={(event) => updateField('destination', event.target.value)}
                placeholder="Shanghai"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <ChipSelector
            label={t('tasks_board.rfqDialog.fields.direction', 'Direction')}
            options={DIRECTION_OPTIONS}
            selected={form.direction}
            onChange={(value) => updateField('direction', value as string)}
          />

          <ChipSelector
            label={t('tasks_board.rfqDialog.fields.transportMode', 'Transport Mode')}
            options={TRANSPORT_MODE_OPTIONS}
            selected={form.transportMode}
            onChange={(value) => updateField('transportMode', value as string)}
          />

          <ChipSelector
            label={t('tasks_board.rfqDialog.fields.cargoType', 'Cargo Type')}
            options={CARGO_TYPE_OPTIONS}
            selected={form.cargoType}
            onChange={(value) => updateField('cargoType', value as string)}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rfq-containers" className="text-xs">
              {t('tasks_board.rfqDialog.fields.containerCount', 'Container Count')}
            </Label>
            <Input
              id="rfq-containers"
              type="number"
              value={form.containerCount}
              onChange={(event) => updateField('containerCount', event.target.value)}
              placeholder="1"
              min={1}
              className="h-8 text-sm w-24"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rfq-context" className="text-xs">
              {t('tasks_board.rfqDialog.fields.context', 'Additional Context')}
            </Label>
            <Textarea
              id="rfq-context"
              value={form.context}
              onChange={(event) => updateField('context', event.target.value)}
              placeholder={t('tasks_board.rfqDialog.fields.contextPlaceholder', 'Special requirements, notes...')}
              className="text-sm resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {t('ui.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? t('tasks_board.rfqDialog.creating', 'Creating...')
              : t('tasks_board.rfqDialog.create', 'Create RFQ')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
