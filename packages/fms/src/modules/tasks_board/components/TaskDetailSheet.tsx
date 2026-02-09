import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useQueryClient } from '@tanstack/react-query'
import {
  X,
  FolderKanban,
  Plus,
  Building2,
  User,
  FileText,
  Type,
} from 'lucide-react'
import type { RfqBoardCard, BoardColumn } from '../lib/types'
import { DIRECTION_OPTIONS, TRANSPORT_MODE_OPTIONS, CARGO_TYPE_OPTIONS, CONTAINER_OPTIONS } from '../lib/chip-options'
import { getTimeAgo } from '../lib/board-config'
import { ChipSelector } from './ChipSelector'
import { LocationSearchInput } from './LocationSearchInput'
import { ContractorSearchInput } from './ContractorSearchInput'
import { ContactSearchInput } from './ContactSearchInput'
import { UserSearchInput } from './UserSearchInput'

import { OfferCreationFormContent } from './OfferCreationForm'
import { SwapButton, ExpandableLocationSlot, ExpandableFieldRow, ExpandableTextFieldRow, ExpandableInputRow } from './shared-inputs'

type TaskDetailSheetProps = {
  task: RfqBoardCard | null
  columns: BoardColumn[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onOfferCreated: () => void
}

const DETAIL_WIDTH = '55vw'
const DETAIL_MAX = '960px'
const DETAIL_MIN = '640px'

type FormState = {
  title: string
  assignedToId: string | null
  assigneeName: string
  companyId: string | null
  companyName: string
  contactPersonId: string | null
  contactPerson: string
  direction: string
  transportMode: string
  cargoType: string
  containerTypes: string[]
  context: string
}

type LocationState = {
  originLocationId: string | null
  destinationLocationId: string | null
  placeOfLoadingId: string | null
  placeOfDeliveryId: string | null
  showLoading: boolean
  showDelivery: boolean
  showTitle: boolean
  showAssignee: boolean
  showCompany: boolean
  showContact: boolean
  showContext: boolean
}

function formFromTask(task: RfqBoardCard): FormState {
  return {
    title: task.title || '',
    assignedToId: task.assignee?.id || null,
    assigneeName: task.assignee?.name || '',
    companyId: null,
    companyName: task.companyName || '',
    contactPersonId: null,
    contactPerson: task.contactPerson || '',
    direction: task.direction || '',
    transportMode: task.transportMode || '',
    cargoType: task.cargoType || '',
    containerTypes: task.containerTypes || [],
    context: task.context || '',
  }
}

function isFormDirty(current: FormState, snapshot: FormState): boolean {
  return current.title !== snapshot.title
    || current.assignedToId !== snapshot.assignedToId
    || current.companyId !== snapshot.companyId
    || current.companyName !== snapshot.companyName
    || current.contactPersonId !== snapshot.contactPersonId
    || current.contactPerson !== snapshot.contactPerson
    || current.direction !== snapshot.direction
    || current.transportMode !== snapshot.transportMode
    || current.cargoType !== snapshot.cargoType
    || current.context !== snapshot.context
    || JSON.stringify(current.containerTypes) !== JSON.stringify(snapshot.containerTypes)
}

function isLocationDirty(current: LocationState, snapshot: LocationState): boolean {
  return current.originLocationId !== snapshot.originLocationId
    || current.destinationLocationId !== snapshot.destinationLocationId
    || current.placeOfLoadingId !== snapshot.placeOfLoadingId
    || current.placeOfDeliveryId !== snapshot.placeOfDeliveryId
}

function deriveShipmentType(direction: string | null, transportMode: string | null): string {
  if (transportMode === 'air') return 'AIR'
  if (transportMode === 'rail') return 'RAIL'
  if (transportMode === 'road') return 'FTL'
  if (direction === 'export') return 'EXP'
  if (direction === 'import') return 'IMP'
  return 'EXP'
}

function deriveCargoType(_cargoType: string | null): 'fcl' | 'lcl' {
  return 'fcl'
}

function deriveDirection(direction: string | null): 'export' | 'import' | 'domestic' {
  if (direction === 'export') return 'export'
  if (direction === 'import') return 'import'
  return 'export'
}

// -- Offers Section (table-like list + create offer button + project creation) --
function OffersSection({
  task,
  t,
  onCreateOffer,
}: {
  task: RfqBoardCard
  t: (key: string, fallback?: string) => string
  onCreateOffer: () => void
}) {
  const queryClient = useQueryClient()
  const [creatingProject, setCreatingProject] = useState(false)
  const isAccepted = task.latestOfferStatus === 'accepted'
  const hasOffers = task.offerCount > 0

  async function handleCreateProject() {
    if (!task.latestOfferId) return
    setCreatingProject(true)

    try {
      const projectRes = await apiCall<{ id: string; projectNumber: string }>('/api/fms_projects/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: task.id,
          offerId: task.latestOfferId,
          direction: deriveDirection(task.direction),
          cargoType: deriveCargoType(task.cargoType),
          shipmentType: deriveShipmentType(task.direction, task.transportMode),
          containerTypes: task.containerTypes ?? undefined,
        }),
      })

      if (!projectRes.ok || !projectRes.result?.id) {
        flash('Failed to create project', 'error')
        return
      }

      const projectId = projectRes.result.id

      await apiCall(`/api/fms_projects/projects/${projectId}/link-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: task.latestOfferId }),
      })

      if (task.status !== 'approved') {
        await apiCall(`/api/fms_offers/rfq/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        })
      }

      flash(t('tasks_board.detail.projectCreated', 'Project created successfully'), 'success')
      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
      window.location.href = `/backend/fms-projects/${projectId}`
    } catch {
      flash('Failed to create project', 'error')
    } finally {
      setCreatingProject(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('tasks_board.detail.offers', 'Offers')}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onCreateOffer}
          className="h-7 text-xs px-3"
        >
          <Plus className="h-3 w-3 mr-1" />
          {t('tasks_board.detail.createOffer', 'Create Offer')}
        </Button>
      </div>

      {hasOffers ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <a
            href={`/backend/fms-offers/${task.latestOfferId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--foreground)',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontWeight: 500 }}>{task.latestOfferNumber ?? 'Offer'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {task.latestOfferStatus && (
                <span className="text-[10px] text-muted-foreground">{task.latestOfferStatus}</span>
              )}
              <span className="text-[10px] text-muted-foreground">{task.latestOfferCreatedAt ? getTimeAgo(task.latestOfferCreatedAt) : ''}</span>
            </div>
          </a>
          {task.offerCount > 1 && (
            <span className="text-[10px] text-muted-foreground" style={{ paddingLeft: '10px' }}>
              +{task.offerCount - 1} more offer{task.offerCount > 2 ? 's' : ''}
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">
          {t('tasks_board.detail.noOffers', 'No offers created yet')}
        </span>
      )}

      {isAccepted && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 mt-3">
          <p className="text-xs text-emerald-700 mb-3">
            {t('tasks_board.detail.createProjectPrompt', 'Offer accepted — create a project to begin execution')}
          </p>
          <Button
            size="sm"
            onClick={handleCreateProject}
            disabled={creatingProject}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            <FolderKanban className="h-3.5 w-3.5 mr-1.5" />
            {creatingProject
              ? t('tasks_board.detail.creatingProject', 'Creating...')
              : t('tasks_board.detail.createProject', 'Create Project')}
          </Button>
        </div>
      )}
    </div>
  )
}

export function TaskDetailSheet({
  task,
  columns,
  open,
  onOpenChange,
  onOfferCreated,
}: TaskDetailSheetProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [showOfferForm, setShowOfferForm] = useState(false)
  const offerSectionRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState<FormState>(() =>
    task ? formFromTask(task) : formFromTask({} as RfqBoardCard),
  )
  const snapshotRef = useRef<FormState>(form)

  // Location state (separate from text form fields)
  const [locations, setLocations] = useState<LocationState>({
    originLocationId: null,
    destinationLocationId: null,
    placeOfLoadingId: null,
    placeOfDeliveryId: null,
    showLoading: false,
    showDelivery: false,
    showTitle: false,
    showAssignee: false,
    showCompany: false,
    showContact: false,
    showContext: false,
  })
  const locationSnapshotRef = useRef<LocationState>(locations)

  // Sync form when task changes or sheet opens
  useEffect(() => {
    if (task && open) {
      const next = formFromTask(task)
      setForm(next)
      snapshotRef.current = next
      const nextLoc: LocationState = {
        originLocationId: null,
        destinationLocationId: null,
        placeOfLoadingId: null,
        placeOfDeliveryId: null,
        showLoading: false,
        showDelivery: false,
        showTitle: false,
        showAssignee: false,
        showCompany: false,
        showContact: false,
        showContext: false,
      }
      setLocations(nextLoc)
      locationSnapshotRef.current = nextLoc
      setShowOfferForm(false)
    }
  }, [task, open])

  // Auto-scroll to offer section when it appears
  useEffect(() => {
    if (showOfferForm && offerSectionRef.current) {
      requestAnimationFrame(() => {
        offerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [showOfferForm])

  const dirty = isFormDirty(form, snapshotRef.current) || isLocationDirty(locations, locationSnapshotRef.current)

  const updateField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const updateLocation = useCallback((field: keyof LocationState, value: string | null | boolean) => {
    setLocations((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleSwapLocations = useCallback(() => {
    setLocations((prev) => ({
      ...prev,
      originLocationId: prev.destinationLocationId,
      destinationLocationId: prev.originLocationId,
    }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!task || !dirty) return
    setSaving(true)
    try {
      await apiCall(`/api/fms_offers/rfq/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title || null,
          assignedToId: form.assignedToId || null,
          companyName: form.companyName || null,
          contactPerson: form.contactPerson || null,
          direction: form.direction || null,
          transportMode: form.transportMode || null,
          cargoType: form.cargoType || null,
          containerTypes: form.containerTypes.length > 0 ? form.containerTypes : null,
          context: form.context || null,
          originLocationId: locations.originLocationId || null,
          destinationLocationId: locations.destinationLocationId || null,
          placeOfLoadingId: locations.showLoading ? locations.placeOfLoadingId : null,
          placeOfDeliveryId: locations.showDelivery ? locations.placeOfDeliveryId : null,
        }),
      })
      snapshotRef.current = { ...form }
      locationSnapshotRef.current = { ...locations }
      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    } catch {
      flash('Failed to save RFQ', 'error')
    } finally {
      setSaving(false)
    }
  }, [task, form, locations, dirty, queryClient])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (showOfferForm) return
        if (dirty) handleSave()
      }
    },
    [dirty, handleSave, showOfferForm],
  )

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleOfferCreated = useCallback(() => {
    setShowOfferForm(false)
    onOfferCreated()
  }, [onOfferCreated])

  if (!task) return null


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
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

        <div
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          onKeyDown={handleKeyDown}
        >
          {/* Scrollable body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
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

            {/* All fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <ExpandableInputRow
                expanded={locations.showTitle}
                onToggle={() => {
                  updateLocation('showTitle', !locations.showTitle)
                  if (locations.showTitle) {
                    setForm((prev) => ({ ...prev, title: '' }))
                  }
                }}
                onConfirm={() => updateLocation('showTitle', false)}
                value={form.title}
                onChange={(value) => updateField('title', value)}
                label={t('tasks_board.rfqDialog.fields.title', 'Title')}
                placeholder={t('tasks_board.rfqDialog.fields.title', 'Title') + '...'}
                icon={<Type style={{ width: 12, height: 12 }} />}
              />

              <ExpandableFieldRow
                expanded={locations.showAssignee}
                onToggle={() => {
                  updateLocation('showAssignee', !locations.showAssignee)
                  if (locations.showAssignee) {
                    setForm((prev) => ({ ...prev, assignedToId: null, assigneeName: '' }))
                  }
                }}
                label={t('tasks_board.detail.assignee', 'Assignee')}
                displayValue={form.assigneeName || undefined}
                icon={<User style={{ width: 12, height: 12 }} />}
              >
                <UserSearchInput
                  value={form.assignedToId}
                  onChange={(userId, name) => {
                    setForm((prev) => ({
                      ...prev,
                      assignedToId: userId,
                      assigneeName: name || '',
                    }))
                    if (userId) updateLocation('showAssignee', false)
                  }}
                  placeholder={t('tasks_board.detail.assignee', 'Assignee') + '...'}
                />
              </ExpandableFieldRow>

              <ExpandableFieldRow
                expanded={locations.showCompany}
                onToggle={() => {
                  updateLocation('showCompany', !locations.showCompany)
                  if (locations.showCompany) {
                    setForm((prev) => ({ ...prev, companyId: null, companyName: '' }))
                  }
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
                    if (contractorId) updateLocation('showCompany', false)
                  }}
                  placeholder={t('tasks_board.detail.company', 'Company') + '...'}
                />
              </ExpandableFieldRow>

              <ExpandableFieldRow
                expanded={locations.showContact}
                onToggle={() => {
                  updateLocation('showContact', !locations.showContact)
                  if (locations.showContact) {
                    setForm((prev) => ({ ...prev, contactPersonId: null, contactPerson: '' }))
                  }
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
                    if (contactId) updateLocation('showContact', false)
                  }}
                  contractorId={form.companyId}
                  placeholder={t('tasks_board.detail.contactPerson', 'Contact Person') + '...'}
                />
              </ExpandableFieldRow>

              <ExpandableTextFieldRow
                expanded={locations.showContext}
                onToggle={() => {
                  updateLocation('showContext', !locations.showContext)
                  if (locations.showContext) {
                    setForm((prev) => ({ ...prev, context: '' }))
                  }
                }}
                onConfirm={() => updateLocation('showContext', false)}
                value={form.context}
                onChange={(value) => updateField('context', value)}
                label={t('tasks_board.detail.notes', 'Notes')}
                placeholder={t('tasks_board.rfqDialog.fields.contextPlaceholder', 'Special requirements, notes...')}
                icon={<FileText style={{ width: 12, height: 12 }} />}
                rows={3}
              />

              <ChipSelector
                label={t('tasks_board.detail.direction', 'Direction')}
                options={DIRECTION_OPTIONS}
                selected={form.direction}
                onChange={(value) => updateField('direction', value as string)}
              />
              <ChipSelector
                label={t('tasks_board.detail.transportMode', 'Transport Mode')}
                options={TRANSPORT_MODE_OPTIONS}
                selected={form.transportMode}
                onChange={(value) => updateField('transportMode', value as string)}
              />
              <ChipSelector
                label={t('tasks_board.detail.cargoType', 'Cargo Type')}
                options={CARGO_TYPE_OPTIONS}
                selected={form.cargoType}
                onChange={(value) => updateField('cargoType', value as string)}
              />
              <ChipSelector
                label={t('tasks_board.detail.containerType', 'Container Type')}
                options={CONTAINER_OPTIONS}
                selected={form.containerTypes}
                onChange={(value) => setForm((prev) => ({ ...prev, containerTypes: value as string[] }))}
                multiple
              />
            </div>

            {/* Route — LocationSearchInput row */}
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                {t('tasks_board.detail.route', 'Route')}
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  paddingTop: (locations.showLoading || locations.showDelivery) ? '18px' : '0',
                  transition: 'padding-top 0.3s ease',
                }}
              >
                <ExpandableLocationSlot
                  expanded={locations.showLoading}
                  onToggle={() => {
                    updateLocation('showLoading', !locations.showLoading)
                    if (locations.showLoading) updateLocation('placeOfLoadingId', null)
                  }}
                  value={locations.placeOfLoadingId}
                  onChange={(v) => updateLocation('placeOfLoadingId', v)}
                  label={t('tasks_board.offerForm.placeOfLoading', 'Place of Loading')}
                  placeholder={t('tasks_board.offerForm.selectLocation', 'Select location...')}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <LocationSearchInput
                    value={locations.originLocationId}
                    onChange={(v) => updateLocation('originLocationId', v)}
                    placeholder={t('tasks_board.offerForm.from', 'From')}
                  />
                </div>

                <div style={{ flexShrink: 0 }}>
                  <SwapButton onClick={handleSwapLocations} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <LocationSearchInput
                    value={locations.destinationLocationId}
                    onChange={(v) => updateLocation('destinationLocationId', v)}
                    placeholder={t('tasks_board.offerForm.to', 'To')}
                  />
                </div>

                <ExpandableLocationSlot
                  expanded={locations.showDelivery}
                  onToggle={() => {
                    updateLocation('showDelivery', !locations.showDelivery)
                    if (locations.showDelivery) updateLocation('placeOfDeliveryId', null)
                  }}
                  value={locations.placeOfDeliveryId}
                  onChange={(v) => updateLocation('placeOfDeliveryId', v)}
                  label={t('tasks_board.offerForm.placeOfDelivery', 'Place of Delivery')}
                  placeholder={t('tasks_board.offerForm.selectLocation', 'Select location...')}
                />
              </div>
            </div>

            {/* Offers section */}
            <OffersSection
              task={task}
              t={t}
              onCreateOffer={() => setShowOfferForm(true)}
            />

            {/* Inline offer creation form (conditional) */}
            {showOfferForm && (
              <div ref={offerSectionRef}>
                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    paddingTop: '18px',
                  }}
                >
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-3">
                    {t('tasks_board.detail.newOffer', 'New Offer')}
                  </span>
                  <OfferCreationFormContent
                    rfq={{
                      ...task,
                      direction: form.direction || task.direction,
                      transportMode: form.transportMode || task.transportMode,
                      cargoType: form.cargoType || task.cargoType,
                      containerTypes: form.containerTypes.length > 0 ? form.containerTypes : task.containerTypes,
                    }}
                    direction={form.direction || task.direction || ''}
                    transportMode={form.transportMode || task.transportMode || ''}
                    cargoType={form.cargoType || task.cargoType || ''}
                    initialLocations={{
                      originLocationId: locations.originLocationId,
                      destinationLocationId: locations.destinationLocationId,
                      placeOfLoadingId: locations.placeOfLoadingId,
                      placeOfDeliveryId: locations.placeOfDeliveryId,
                    }}
                    onCreated={handleOfferCreated}
                    onCancel={() => setShowOfferForm(false)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer — Save button (hidden when offer form is active since it has its own buttons) */}
          {!showOfferForm && (
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
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!dirty || saving}
              >
                {saving
                  ? t('tasks_board.detail.saving', 'Saving...')
                  : t('tasks_board.detail.save', 'Save')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
