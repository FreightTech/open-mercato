import React, { useState, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { X, Building2, User, FileText, Type } from 'lucide-react'
import { DIRECTION_OPTIONS, TRANSPORT_MODE_OPTIONS, CARGO_TYPE_OPTIONS } from '../lib/chip-options'
import { ChipSelector } from './ChipSelector'
import { LocationSearchInput } from './LocationSearchInput'
import { ContractorSearchInput } from './ContractorSearchInput'
import { ContactSearchInput } from './ContactSearchInput'
import { SwapButton, ExpandableLocationSlot, ExpandableFieldRow, ExpandableTextFieldRow, ExpandableInputRow } from './shared-inputs'

type CreatedRfq = {
  id: string
  title?: string | null
  companyName?: string | null
  contactPerson?: string | null
  context?: string | null
  origin?: string | null
  destination?: string | null
  originLocationId?: string | null
  destinationLocationId?: string | null
  placeOfLoading?: string | null
  placeOfLoadingId?: string | null
  placeOfDelivery?: string | null
  placeOfDeliveryId?: string | null
  direction?: string | null
  transportMode?: string | null
  cargoType?: string | null
  status?: string
}

type RfqCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (rfq: CreatedRfq) => void
}

export function RfqCreateDialog({ open, onOpenChange, onCreated }: RfqCreateDialogProps) {
  const t = useT()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    companyId: null as string | null,
    companyName: '',
    contactPersonId: null as string | null,
    contactPerson: '',
    direction: '' as string,
    transportMode: '' as string,
    cargoType: '' as string,
    context: '',
  })

  const [originLocationId, setOriginLocationId] = useState<string | null>(null)
  const [originLocationName, setOriginLocationName] = useState<string | null>(null)
  const [destinationLocationId, setDestinationLocationId] = useState<string | null>(null)
  const [destinationLocationName, setDestinationLocationName] = useState<string | null>(null)
  const [placeOfLoadingId, setPlaceOfLoadingId] = useState<string | null>(null)
  const [placeOfLoadingName, setPlaceOfLoadingName] = useState<string | null>(null)
  const [placeOfDeliveryId, setPlaceOfDeliveryId] = useState<string | null>(null)
  const [placeOfDeliveryName, setPlaceOfDeliveryName] = useState<string | null>(null)
  const [showLoading, setShowLoading] = useState(false)
  const [showDelivery, setShowDelivery] = useState(false)
  const [showTitle, setShowTitle] = useState(false)
  const [showCompany, setShowCompany] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [showContext, setShowContext] = useState(false)

  const resetForm = useCallback(() => {
    setForm({
      title: '',
      companyId: null,
      companyName: '',
      contactPersonId: null,
      contactPerson: '',
      direction: '',
      transportMode: '',
      cargoType: '',
      context: '',
    })
    setOriginLocationId(null)
    setOriginLocationName(null)
    setDestinationLocationId(null)
    setDestinationLocationName(null)
    setPlaceOfLoadingId(null)
    setPlaceOfLoadingName(null)
    setPlaceOfDeliveryId(null)
    setPlaceOfDeliveryName(null)
    setShowLoading(false)
    setShowDelivery(false)
    setShowTitle(false)
    setShowCompany(false)
    setShowContact(false)
    setShowContext(false)
  }, [])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      const res = await apiCall<CreatedRfq>('/api/fms_offers/rfq', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title || null,
          companyName: form.companyName || null,
          contractorId: form.companyId || null,
          contactPerson: form.contactPerson || null,
          contactPersonId: form.contactPersonId || null,
          origin: originLocationName || null,
          destination: destinationLocationName || null,
          originLocationId: originLocationId || null,
          destinationLocationId: destinationLocationId || null,
          placeOfLoading: showLoading ? placeOfLoadingName : null,
          placeOfLoadingId: showLoading ? placeOfLoadingId : null,
          placeOfDelivery: showDelivery ? placeOfDeliveryName : null,
          placeOfDeliveryId: showDelivery ? placeOfDeliveryId : null,
          direction: form.direction || null,
          transportMode: form.transportMode || null,
          cargoType: form.cargoType || null,
          context: form.context || null,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok || !res.result?.id) {
        console.error('[RfqCreateDialog] Failed to create RFQ')
        return
      }
      resetForm()
      onCreated(res.result)
    } catch (error) {
      console.error('[RfqCreateDialog] Failed to create RFQ:', error)
    } finally {
      setSubmitting(false)
    }
  }, [form, originLocationId, originLocationName, destinationLocationId, destinationLocationName, placeOfLoadingId, placeOfLoadingName, placeOfDeliveryId, placeOfDeliveryName, showLoading, showDelivery, onCreated, resetForm])

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

  const handleSwapLocations = useCallback(() => {
    setOriginLocationId((prev) => {
      setDestinationLocationId(prev)
      return destinationLocationId
    })
    setOriginLocationName((prev) => {
      setDestinationLocationName(prev)
      return destinationLocationName
    })
  }, [destinationLocationId, destinationLocationName])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{ width: '55vw', maxWidth: '960px', minWidth: '640px' }}
        hideCloseButton
        ariaTitle="Create RFQ"
        overlayClassName="backdrop-blur-none"
        onKeyDown={handleKeyDown}
      >
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

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
            <div className="text-base font-semibold">{t('tasks_board.rfqDialog.title', 'Create RFQ')}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('tasks_board.rfqDialog.description', 'Add a new Request for Quotation to the board')}
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
            gap: '18px',
          }}
        >
          {/* All fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <ExpandableInputRow
              expanded={showTitle}
              onToggle={() => {
                setShowTitle((prev) => !prev)
                if (showTitle) setForm((prev) => ({ ...prev, title: '' }))
              }}
              onConfirm={() => setShowTitle(false)}
              onBlur={() => setShowTitle(false)}
              value={form.title}
              onChange={(value) => updateField('title', value)}
              label={t('tasks_board.rfqDialog.fields.title', 'Title')}
              placeholder={t('tasks_board.rfqDialog.fields.title', 'RFQ Title') + '...'}
              icon={<Type style={{ width: 12, height: 12 }} />}
            />

            <ExpandableFieldRow
              expanded={showCompany}
              onToggle={() => {
                setShowCompany((prev) => !prev)
                if (showCompany) setForm((prev) => ({ ...prev, companyId: null, companyName: '' }))
              }}
              label={t('tasks_board.detail.company', 'Company')}
              displayValue={form.companyName || undefined}
              icon={<Building2 style={{ width: 12, height: 12 }} />}
            >
              <ContractorSearchInput
                value={form.companyId}
                onChange={(contractorId, name) => {
                  setForm((prev) => ({
                    ...prev,
                    companyId: contractorId,
                    companyName: name || '',
                  }))
                  if (contractorId) setShowCompany(false)
                }}
                placeholder={t('tasks_board.detail.company', 'Company') + '...'}
              />
            </ExpandableFieldRow>

            <ExpandableFieldRow
              expanded={showContact}
              onToggle={() => {
                setShowContact((prev) => !prev)
                if (showContact) setForm((prev) => ({ ...prev, contactPersonId: null, contactPerson: '' }))
              }}
              label={t('tasks_board.detail.contactPerson', 'Contact Person')}
              displayValue={form.contactPerson || undefined}
              icon={<User style={{ width: 12, height: 12 }} />}
            >
              <ContactSearchInput
                value={form.contactPersonId}
                onChange={(contactId, name) => {
                  setForm((prev) => ({
                    ...prev,
                    contactPersonId: contactId,
                    contactPerson: name || '',
                  }))
                  if (contactId) setShowContact(false)
                }}
                contractorId={form.companyId}
                placeholder={t('tasks_board.detail.contactPerson', 'Contact Person') + '...'}
              />
            </ExpandableFieldRow>

            <ExpandableTextFieldRow
              expanded={showContext}
              onToggle={() => {
                setShowContext((prev) => !prev)
                if (showContext) setForm((prev) => ({ ...prev, context: '' }))
              }}
              onConfirm={() => setShowContext(false)}
              onBlur={() => setShowContext(false)}
              value={form.context}
              onChange={(value) => updateField('context', value)}
              label={t('tasks_board.detail.notes', 'Notes')}
              placeholder={t('tasks_board.rfqDialog.fields.contextPlaceholder', 'Special requirements, notes...')}
              icon={<FileText style={{ width: 12, height: 12 }} />}
              rows={3}
            />

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
          </div>

          {/* Route — LocationSearchInput row (same as offer form) */}
          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              {t('tasks_board.detail.route', 'Route')}
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                paddingTop: (showLoading || showDelivery) ? '18px' : '0',
                transition: 'padding-top 0.3s ease',
              }}
            >
              <ExpandableLocationSlot
                expanded={showLoading}
                onToggle={() => {
                  setShowLoading((prev) => !prev)
                  if (showLoading) { setPlaceOfLoadingId(null); setPlaceOfLoadingName(null) }
                }}
                value={placeOfLoadingId}
                onChange={(id, name) => { setPlaceOfLoadingId(id); setPlaceOfLoadingName(name ?? null) }}
                label={t('tasks_board.offerForm.placeOfLoading', 'Place of Loading')}
                placeholder={t('tasks_board.offerForm.selectLocation', 'Select location...')}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <LocationSearchInput
                  value={originLocationId}
                  onChange={(id, name) => { setOriginLocationId(id); setOriginLocationName(name ?? null) }}
                  placeholder={t('tasks_board.offerForm.from', 'From')}
                />
              </div>

              <div style={{ flexShrink: 0 }}>
                <SwapButton onClick={handleSwapLocations} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <LocationSearchInput
                  value={destinationLocationId}
                  onChange={(id, name) => { setDestinationLocationId(id); setDestinationLocationName(name ?? null) }}
                  placeholder={t('tasks_board.offerForm.to', 'To')}
                />
              </div>

              <ExpandableLocationSlot
                expanded={showDelivery}
                onToggle={() => {
                  setShowDelivery((prev) => !prev)
                  if (showDelivery) { setPlaceOfDeliveryId(null); setPlaceOfDeliveryName(null) }
                }}
                value={placeOfDeliveryId}
                onChange={(id, name) => { setPlaceOfDeliveryId(id); setPlaceOfDeliveryName(name ?? null) }}
                label={t('tasks_board.offerForm.placeOfDelivery', 'Place of Delivery')}
                placeholder={t('tasks_board.offerForm.selectLocation', 'Select location...')}
              />
            </div>
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
                ? t('tasks_board.rfqDialog.creating', 'Creating...')
                : t('tasks_board.rfqDialog.create', 'Create RFQ')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
