import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Building2,
  User,
  FileText,
  Type,
  Pencil,
  ArrowRight,
  ChevronsUpDown,
  Trash2,
  AlertTriangle,
  Plus,
  ExternalLink,
} from 'lucide-react'
import type { RfqBoardCard, BoardColumn } from '../lib/types'
import { DIRECTION_OPTIONS, TRANSPORT_MODE_OPTIONS, CARGO_TYPE_OPTIONS } from '../lib/chip-options'
import { ChipSelector } from './ChipSelector'
import { LocationSearchInput } from './LocationSearchInput'
import { ContractorSearchInput } from './ContractorSearchInput'
import { ContactSearchInput } from './ContactSearchInput'
import { UserSearchInput } from './UserSearchInput'
import { OfferCreationFormContent, type InitialCalculation } from './OfferCreationForm'
import type { ChargeRow } from './ChargesTable'
import { OfferDetailView } from './OfferDetailView'
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
  context: string
}

type LocationState = {
  originLocationId: string | null
  originLocationName: string | null
  destinationLocationId: string | null
  destinationLocationName: string | null
  placeOfLoadingId: string | null
  placeOfLoadingName: string | null
  placeOfDeliveryId: string | null
  placeOfDeliveryName: string | null
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
    companyId: task.contractorId || null,
    companyName: task.companyName || '',
    contactPersonId: task.contactPersonId || null,
    contactPerson: task.contactPerson || '',
    direction: task.direction || '',
    transportMode: task.transportMode || '',
    cargoType: task.cargoType || '',
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
}

function isLocationDirty(current: LocationState, snapshot: LocationState): boolean {
  return current.originLocationId !== snapshot.originLocationId
    || current.destinationLocationId !== snapshot.destinationLocationId
    || current.placeOfLoadingId !== snapshot.placeOfLoadingId
    || current.placeOfDeliveryId !== snapshot.placeOfDeliveryId
    || current.originLocationName !== snapshot.originLocationName
    || current.destinationLocationName !== snapshot.destinationLocationName
    || current.placeOfLoadingName !== snapshot.placeOfLoadingName
    || current.placeOfDeliveryName !== snapshot.placeOfDeliveryName
}

type RfqOffer = {
  id: string
  offerNumber: string
  status: string
  version: number
  createdAt: string
}

// -- Delete confirmation popover --
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
          {t('tasks_board.detail.deleteConfirm', 'Are you sure you want to delete this RFQ? This action cannot be undone.')}
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
          {t('tasks_board.detail.cancel', 'Cancel')}
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
          {deleting ? t('tasks_board.detail.deleting', 'Deleting...') : t('tasks_board.detail.delete', 'Delete')}
        </button>
      </div>
    </div>
  )
}

// -- Compact read-only summary of RFQ fields --
function RfqSummaryView({
  task,
  form,
  onEdit,
  onDelete,
  deleting,
  t,
}: {
  task: RfqBoardCard
  form: FormState
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
  t: (key: string, fallback?: string) => string
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const labelClass = 'text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0'

  function findOption(options: { value: string; label: string; icon?: React.ReactNode }[], value: string) {
    return options.find((o) => o.value === value)
  }

  const hasTitle = !!form.title
  const hasAssignee = !!form.assigneeName
  const hasCompany = !!form.companyName
  const hasContact = !!form.contactPerson
  const hasNotes = !!form.context
  const hasDirection = !!form.direction
  const hasTransport = !!form.transportMode
  const hasCargo = !!form.cargoType
  const hasRoute = !!(task.origin || task.destination)

  const hasAnyField = hasTitle || hasAssignee || hasCompany || hasContact || hasNotes || hasDirection || hasTransport || hasCargo || hasRoute

  const directionOpt = hasDirection ? findOption(DIRECTION_OPTIONS, form.direction) : null
  const transportOpt = hasTransport ? findOption(TRANSPORT_MODE_OPTIONS, form.transportMode) : null
  const cargoOpt = hasCargo ? findOption(CARGO_TYPE_OPTIONS, form.cargoType) : null

  if (!hasAnyField) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0' }}>
        <span className="text-sm text-muted-foreground">{t('tasks_board.detail.noDetails', 'No details yet')}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1.5" />
            {t('tasks_board.detail.edit', 'Edit')}
          </Button>
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
              {t('tasks_board.detail.delete', 'Delete')}
            </button>
            <DeleteConfirmPopover
              open={showDeleteConfirm}
              onConfirm={() => { setShowDeleteConfirm(false); onDelete() }}
              onCancel={() => setShowDeleteConfirm(false)}
              deleting={deleting}
              t={t}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('tasks_board.detail.title', 'RFQ Details')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '9999px',
              border: '1.5px solid var(--destructive)',
              background: 'var(--background)',
              color: 'var(--destructive)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              height: '28px',
            }}
          >
            <Trash2 style={{ width: 12, height: 12 }} />
            {t('tasks_board.detail.delete', 'Delete')}
          </button>
          <DeleteConfirmPopover
            open={showDeleteConfirm}
            onConfirm={() => { setShowDeleteConfirm(false); onDelete() }}
            onCancel={() => setShowDeleteConfirm(false)}
            deleting={deleting}
            t={t}
          />
          <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 text-xs px-2">
            <Pencil className="h-3 w-3 mr-1" />
            {t('tasks_board.detail.edit', 'Edit')}
          </Button>
        </div>
      </div>

      {/* Card body — 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
        {/* Route first, spans full width, left-aligned */}
        {hasRoute && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderBottom: '1px solid var(--border)', gridColumn: '1 / -1' }}>
            <span className={labelClass} style={{ flexShrink: 0 }}>{t('tasks_board.detail.route', 'Route')}</span>
            <span className="rounded-full px-3 py-1 text-xs font-medium inline-flex items-center border border-foreground">
              {task.origin || '—'}
            </span>
            <ArrowRight style={{ width: 14, height: 14 }} className="text-muted-foreground shrink-0" />
            <span className="rounded-full px-3 py-1 text-xs font-medium inline-flex items-center border border-foreground">
              {task.destination || '—'}
            </span>
          </div>
        )}

        {hasTitle && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className={labelClass}>{t('tasks_board.rfqDialog.fields.title', 'Title')}</span>
            <span className="text-sm font-medium text-foreground">{form.title}</span>
          </div>
        )}
        {hasAssignee && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className={labelClass}>{t('tasks_board.detail.assignee', 'Assignee')}</span>
            <span className="text-sm font-medium text-foreground">{form.assigneeName}</span>
          </div>
        )}
        {hasCompany && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className={labelClass}>{t('tasks_board.detail.company', 'Company')}</span>
            <span className="text-sm font-medium text-foreground">{form.companyName}</span>
          </div>
        )}
        {hasContact && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className={labelClass}>{t('tasks_board.detail.contactPerson', 'Contact')}</span>
            <span className="text-sm font-medium text-foreground">{form.contactPerson}</span>
          </div>
        )}
        {directionOpt && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className={labelClass}>{t('tasks_board.detail.direction', 'Direction')}</span>
            <span className="text-sm font-medium text-foreground">{directionOpt.label}</span>
          </div>
        )}
        {transportOpt && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className={labelClass}>{t('tasks_board.detail.transportMode', 'Transport')}</span>
            <span className="text-sm font-medium text-foreground">{transportOpt.label}</span>
          </div>
        )}
        {cargoOpt && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className={labelClass}>{t('tasks_board.detail.cargoType', 'Cargo Type')}</span>
            <span className="text-sm font-medium text-foreground">{cargoOpt.label}</span>
          </div>
        )}
        {/* Notes spans full width */}
        {hasNotes && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 14px', gridColumn: '1 / -1', gap: '16px' }}>
            <span className={labelClass} style={{ flexShrink: 0 }}>{t('tasks_board.detail.notes', 'Notes')}</span>
            <span className="text-sm text-foreground whitespace-pre-wrap">{form.context}</span>
          </div>
        )}
      </div>
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
  const [deleting, setDeleting] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [viewingOfferId, setViewingOfferId] = useState<string | null>(null)
  const [offerSubmitting, setOfferSubmitting] = useState(false)
  const offerSubmitRef = useRef<(() => void) | null>(null)
  const [activeTab, setActiveTab] = useState<string>('new')

  const [form, setForm] = useState<FormState>(() =>
    task ? formFromTask(task) : formFromTask({} as RfqBoardCard),
  )
  const snapshotRef = useRef<FormState>(form)

  // Location state (separate from text form fields)
  const [locations, setLocations] = useState<LocationState>({
    originLocationId: null,
    originLocationName: null,
    destinationLocationId: null,
    destinationLocationName: null,
    placeOfLoadingId: null,
    placeOfLoadingName: null,
    placeOfDeliveryId: null,
    placeOfDeliveryName: null,
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
        originLocationId: task.originLocationId ?? null,
        originLocationName: task.origin ?? null,
        destinationLocationId: task.destinationLocationId ?? null,
        destinationLocationName: task.destination ?? null,
        placeOfLoadingId: task.placeOfLoadingId ?? null,
        placeOfLoadingName: task.placeOfLoading ?? null,
        placeOfDeliveryId: task.placeOfDeliveryId ?? null,
        placeOfDeliveryName: task.placeOfDelivery ?? null,
        showLoading: !!task.placeOfLoadingId,
        showDelivery: !!task.placeOfDeliveryId,
        showTitle: false,
        showAssignee: false,
        showCompany: false,
        showContact: false,
        showContext: false,
      }
      setLocations(nextLoc)
      locationSnapshotRef.current = nextLoc
      setEditMode(false)
      setViewingOfferId(null)
      setActiveTab('new')
    }
  }, [task, open])

  // Fetch offers for this RFQ
  const { data: rfqOffers = [] } = useQuery<RfqOffer[]>({
    queryKey: ['rfq-offers', task?.id],
    queryFn: async () => {
      if (!task?.id) return []
      const res = await apiCall<{ offers: RfqOffer[] }>(`/api/fms_offers/rfq/${task.id}`)
      if (!res.ok || !res.result) return []
      return res.result.offers ?? []
    },
    enabled: !!task?.id && open,
  })

  // Default to the most recent offer tab when offers load
  useEffect(() => {
    if (rfqOffers.length > 0) {
      setActiveTab((prev) => {
        if (prev === 'new') return rfqOffers[0].id
        if (rfqOffers.some((o) => o.id === prev)) return prev
        return rfqOffers[0].id
      })
    } else {
      setActiveTab('new')
    }
  }, [rfqOffers])

  // Fetch offer detail when an existing offer tab is active
  const activeOfferId = activeTab !== 'new' ? activeTab : null

  const { data: activeOfferDetail } = useQuery({
    queryKey: ['offer-detail', activeOfferId],
    queryFn: async () => {
      const res = await apiCall<{
        id: string
        calculations: Array<{
          id: string
          originLocationId: string | null
          destinationLocationId: string | null
          placeOfLoadingId: string | null
          placeOfDeliveryId: string | null
          lines: Array<{
            id: string
            productId: string | null
            productName: string | null
            chargeCode: string | null
            chargeBasis: string | null
            containerType: string | null
            currencyCode: string
            rate: number
            buyPrice: number
            sellPrice: number
            isEnabled: boolean
          }>
        }>
      }>(`/api/fms_offers/offers/${activeOfferId}`)
      if (!res.ok || !res.result) throw new Error('Failed to fetch offer')
      return res.result
    },
    enabled: !!activeOfferId,
  })

  // Convert fetched offer detail into InitialCalculation[] for the form
  // Falls back to RFQ locations when the offer's calculation locations are null
  const activeOfferCalculations = useMemo((): InitialCalculation[] | undefined => {
    if (!activeOfferDetail) return undefined
    return activeOfferDetail.calculations.map((calc) => ({
      originLocationId: calc.originLocationId ?? locations.originLocationId,
      destinationLocationId: calc.destinationLocationId ?? locations.destinationLocationId,
      placeOfLoadingId: calc.placeOfLoadingId ?? locations.placeOfLoadingId,
      placeOfDeliveryId: calc.placeOfDeliveryId ?? locations.placeOfDeliveryId,
      chargeRows: calc.lines.map((line, index): ChargeRow => ({
        id: line.id || `line-${index}`,
        productId: line.productId,
        productName: line.productName || '',
        chargeCode: line.chargeCode || '',
        chargeBasis: line.chargeBasis || '',
        containerType: line.containerType,
        currencyCode: line.currencyCode,
        rate: line.rate,
        marginPercent: line.sellPrice && line.buyPrice
          ? Math.round(((line.sellPrice - line.buyPrice) / line.sellPrice) * 100)
          : 0,
        buyPrice: line.buyPrice,
        sellPrice: line.sellPrice,
        isEnabled: line.isEnabled,
      })),
    }))
  }, [activeOfferDetail, locations.originLocationId, locations.destinationLocationId, locations.placeOfLoadingId, locations.placeOfDeliveryId])

  const dirty = isFormDirty(form, snapshotRef.current) || isLocationDirty(locations, locationSnapshotRef.current)

  const updateField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const updateLocation = useCallback((field: keyof LocationState, value: string | null | boolean) => {
    setLocations((prev) => ({ ...prev, [field]: value }))
  }, [])

  const saveField = useCallback(async (
    apiPayload: Record<string, unknown>,
    formUpdates?: Partial<FormState>,
    locationUpdates?: Partial<LocationState>,
  ) => {
    if (!task) return
    try {
      await apiCall(`/api/fms_offers/rfq/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      })
      if (formUpdates) {
        snapshotRef.current = { ...snapshotRef.current, ...formUpdates }
      }
      if (locationUpdates) {
        locationSnapshotRef.current = { ...locationSnapshotRef.current, ...locationUpdates }
      }
      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    } catch {
      flash('Failed to save', 'error')
    }
  }, [task, queryClient])

  const handleSwapLocations = useCallback(() => {
    const swappedOriginId = locations.destinationLocationId
    const swappedOriginName = locations.destinationLocationName
    const swappedDestId = locations.originLocationId
    const swappedDestName = locations.originLocationName

    setLocations((prev) => ({
      ...prev,
      originLocationId: swappedOriginId,
      originLocationName: swappedOriginName,
      destinationLocationId: swappedDestId,
      destinationLocationName: swappedDestName,
    }))

    saveField(
      {
        origin: swappedOriginName || null,
        originLocationId: swappedOriginId || null,
        destination: swappedDestName || null,
        destinationLocationId: swappedDestId || null,
      },
      undefined,
      {
        originLocationId: swappedOriginId,
        originLocationName: swappedOriginName,
        destinationLocationId: swappedDestId,
        destinationLocationName: swappedDestName,
      },
    )
  }, [locations, saveField])

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
          contractorId: form.companyId || null,
          contactPerson: form.contactPerson || null,
          contactPersonId: form.contactPersonId || null,
          direction: form.direction || null,
          transportMode: form.transportMode || null,
          cargoType: form.cargoType || null,
          context: form.context || null,
          origin: locations.originLocationName || null,
          destination: locations.destinationLocationName || null,
          originLocationId: locations.originLocationId || null,
          destinationLocationId: locations.destinationLocationId || null,
          placeOfLoading: locations.showLoading ? locations.placeOfLoadingName : null,
          placeOfLoadingId: locations.showLoading ? locations.placeOfLoadingId : null,
          placeOfDelivery: locations.showDelivery ? locations.placeOfDeliveryName : null,
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

  const handleDelete = useCallback(async () => {
    if (!task) return
    setDeleting(true)
    try {
      await apiCall(`/api/fms_offers/rfq/${task.id}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
      onOpenChange(false)
    } catch {
      flash('Failed to delete RFQ', 'error')
    } finally {
      setDeleting(false)
    }
  }, [task, queryClient, onOpenChange])

  const handleCollapseEdit = useCallback(() => {
    setEditMode(false)
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!editMode) return
        if (dirty) handleSave()
      }
    },
    [dirty, handleSave, editMode],
  )

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleOfferCreated = useCallback((offerId: string) => {
    queryClient.invalidateQueries({ queryKey: ['rfq-offers', task?.id] })
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    onOfferCreated()
    setActiveTab(offerId)
  }, [onOfferCreated, queryClient, task?.id])

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
          {viewingOfferId ? (
            <OfferDetailView offerId={viewingOfferId} onBack={() => setViewingOfferId(null)} />
          ) : (
            <>
              {/* Scrollable body */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
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

                {editMode ? (
                  <>
                    {/* All fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={handleCollapseEdit} className="h-7 text-xs px-2">
                          <ChevronsUpDown className="h-3 w-3 mr-1" />
                          {t('tasks_board.detail.collapse', 'Collapse')}
                        </Button>
                      </div>
                      <ExpandableInputRow
                        expanded={locations.showTitle}
                        onToggle={() => {
                          const wasExpanded = locations.showTitle
                          updateLocation('showTitle', !locations.showTitle)
                          if (wasExpanded) {
                            setForm((prev) => ({ ...prev, title: '' }))
                            saveField({ title: null }, { title: '' })
                          }
                        }}
                        onConfirm={() => updateLocation('showTitle', false)}
                        onBlur={() => {
                          if (form.title !== snapshotRef.current.title) {
                            saveField({ title: form.title || null }, { title: form.title })
                          }
                          updateLocation('showTitle', false)
                        }}
                        value={form.title}
                        onChange={(value) => updateField('title', value)}
                        label={t('tasks_board.rfqDialog.fields.title', 'Title')}
                        placeholder={t('tasks_board.rfqDialog.fields.title', 'Title') + '...'}
                        icon={<Type style={{ width: 12, height: 12 }} />}
                      />

                      <ExpandableFieldRow
                        expanded={locations.showAssignee}
                        onToggle={() => {
                          const wasExpanded = locations.showAssignee
                          updateLocation('showAssignee', !locations.showAssignee)
                          if (wasExpanded) {
                            setForm((prev) => ({ ...prev, assignedToId: null, assigneeName: '' }))
                            saveField({ assignedToId: null }, { assignedToId: null, assigneeName: '' })
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
                            saveField({ assignedToId: userId || null }, { assignedToId: userId, assigneeName: name || '' })
                          }}
                          placeholder={t('tasks_board.detail.assignee', 'Assignee') + '...'}
                        />
                      </ExpandableFieldRow>

                      <ExpandableFieldRow
                        expanded={locations.showCompany}
                        onToggle={() => {
                          const wasExpanded = locations.showCompany
                          updateLocation('showCompany', !locations.showCompany)
                          if (wasExpanded) {
                            setForm((prev) => ({ ...prev, companyId: null, companyName: '' }))
                            saveField({ companyName: null, contractorId: null }, { companyId: null, companyName: '' })
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
                            saveField({ companyName: name || null, contractorId: contractorId || null }, { companyId: contractorId, companyName: name || '' })
                          }}
                          placeholder={t('tasks_board.detail.company', 'Company') + '...'}
                        />
                      </ExpandableFieldRow>

                      <ExpandableFieldRow
                        expanded={locations.showContact}
                        onToggle={() => {
                          const wasExpanded = locations.showContact
                          updateLocation('showContact', !locations.showContact)
                          if (wasExpanded) {
                            setForm((prev) => ({ ...prev, contactPersonId: null, contactPerson: '' }))
                            saveField({ contactPerson: null, contactPersonId: null }, { contactPersonId: null, contactPerson: '' })
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
                            saveField({ contactPerson: name || null, contactPersonId: contactId || null }, { contactPersonId: contactId, contactPerson: name || '' })
                          }}
                          contractorId={form.companyId}
                          placeholder={t('tasks_board.detail.contactPerson', 'Contact Person') + '...'}
                        />
                      </ExpandableFieldRow>

                      <ExpandableTextFieldRow
                        expanded={locations.showContext}
                        onToggle={() => {
                          const wasExpanded = locations.showContext
                          updateLocation('showContext', !locations.showContext)
                          if (wasExpanded) {
                            setForm((prev) => ({ ...prev, context: '' }))
                            saveField({ context: null }, { context: '' })
                          }
                        }}
                        onConfirm={() => updateLocation('showContext', false)}
                        onBlur={() => {
                          if (form.context !== snapshotRef.current.context) {
                            saveField({ context: form.context || null }, { context: form.context })
                          }
                          updateLocation('showContext', false)
                        }}
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
                        onChange={(value) => {
                          updateField('direction', value as string)
                          saveField({ direction: value || null }, { direction: value as string })
                        }}
                      />
                      <ChipSelector
                        label={t('tasks_board.detail.transportMode', 'Transport Mode')}
                        options={TRANSPORT_MODE_OPTIONS}
                        selected={form.transportMode}
                        onChange={(value) => {
                          updateField('transportMode', value as string)
                          saveField({ transportMode: value || null }, { transportMode: value as string })
                        }}
                      />
                      <ChipSelector
                        label={t('tasks_board.detail.cargoType', 'Cargo Type')}
                        options={CARGO_TYPE_OPTIONS}
                        selected={form.cargoType}
                        onChange={(value) => {
                          updateField('cargoType', value as string)
                          saveField({ cargoType: value || null }, { cargoType: value as string })
                        }}
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
                            const wasExpanded = locations.showLoading
                            updateLocation('showLoading', !locations.showLoading)
                            if (wasExpanded) {
                              setLocations((prev) => ({ ...prev, placeOfLoadingId: null, placeOfLoadingName: null }))
                              saveField(
                                { placeOfLoading: null, placeOfLoadingId: null },
                                undefined,
                                { placeOfLoadingId: null, placeOfLoadingName: null },
                              )
                            }
                          }}
                          value={locations.placeOfLoadingId}
                          onChange={(v, name) => {
                            setLocations((prev) => ({ ...prev, placeOfLoadingId: v, placeOfLoadingName: name ?? null }))
                            saveField(
                              { placeOfLoading: name || null, placeOfLoadingId: v || null },
                              undefined,
                              { placeOfLoadingId: v, placeOfLoadingName: name ?? null },
                            )
                          }}
                          label={t('tasks_board.offerForm.placeOfLoading', 'Place of Loading')}
                          placeholder={t('tasks_board.offerForm.selectLocation', 'Select location...')}
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LocationSearchInput
                            value={locations.originLocationId}
                            onChange={(v, name) => {
                              setLocations((prev) => ({ ...prev, originLocationId: v, originLocationName: name ?? null }))
                              saveField(
                                { origin: name || null, originLocationId: v || null },
                                undefined,
                                { originLocationId: v, originLocationName: name ?? null },
                              )
                            }}
                            placeholder={t('tasks_board.offerForm.from', 'From')}
                          />
                        </div>

                        <div style={{ flexShrink: 0 }}>
                          <SwapButton onClick={handleSwapLocations} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LocationSearchInput
                            value={locations.destinationLocationId}
                            onChange={(v, name) => {
                              setLocations((prev) => ({ ...prev, destinationLocationId: v, destinationLocationName: name ?? null }))
                              saveField(
                                { destination: name || null, destinationLocationId: v || null },
                                undefined,
                                { destinationLocationId: v, destinationLocationName: name ?? null },
                              )
                            }}
                            placeholder={t('tasks_board.offerForm.to', 'To')}
                          />
                        </div>

                        <ExpandableLocationSlot
                          expanded={locations.showDelivery}
                          onToggle={() => {
                            const wasExpanded = locations.showDelivery
                            updateLocation('showDelivery', !locations.showDelivery)
                            if (wasExpanded) {
                              setLocations((prev) => ({ ...prev, placeOfDeliveryId: null, placeOfDeliveryName: null }))
                              saveField(
                                { placeOfDelivery: null, placeOfDeliveryId: null },
                                undefined,
                                { placeOfDeliveryId: null, placeOfDeliveryName: null },
                              )
                            }
                          }}
                          value={locations.placeOfDeliveryId}
                          onChange={(v, name) => {
                            setLocations((prev) => ({ ...prev, placeOfDeliveryId: v, placeOfDeliveryName: name ?? null }))
                            saveField(
                              { placeOfDelivery: name || null, placeOfDeliveryId: v || null },
                              undefined,
                              { placeOfDeliveryId: v, placeOfDeliveryName: name ?? null },
                            )
                          }}
                          label={t('tasks_board.offerForm.placeOfDelivery', 'Place of Delivery')}
                          placeholder={t('tasks_board.offerForm.selectLocation', 'Select location...')}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <RfqSummaryView task={task} form={form} onEdit={() => setEditMode(true)} onDelete={handleDelete} deleting={deleting} t={t} />
                )}

                {/* Offer tabs */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0',
                        borderBottom: '1px solid var(--border)',
                        overflowX: 'auto',
                      }}
                    >
                      {rfqOffers.map((offer) => {
                        const isActive = activeTab === offer.id
                        const statusDot = offer.status === 'accepted'
                          ? '#16a34a'
                          : offer.status === 'sent'
                            ? '#2563eb'
                            : offer.status === 'declined'
                              ? '#dc2626'
                              : 'var(--muted-foreground)'
                        return (
                          <button
                            key={offer.id}
                            type="button"
                            onClick={() => setActiveTab(offer.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 14px',
                              fontSize: '12px',
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: isActive ? '2px solid var(--foreground)' : '2px solid transparent',
                              marginBottom: '-1px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              transition: 'color 0.15s, border-color 0.15s',
                              fontFamily: 'inherit',
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: statusDot,
                                flexShrink: 0,
                              }}
                            />
                            {offer.offerNumber}
                            <span style={{ fontSize: '10px', opacity: 0.6 }}>{offer.status}</span>
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => setActiveTab('new')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '8px 12px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: activeTab === 'new' ? '2px solid var(--foreground)' : '2px solid transparent',
                          marginBottom: '-1px',
                          cursor: 'pointer',
                          color: activeTab === 'new' ? 'var(--foreground)' : 'var(--muted-foreground)',
                          transition: 'color 0.15s, border-color 0.15s',
                        }}
                        title={t('tasks_board.offerForm.newOffer', 'New offer')}
                      >
                        <Plus style={{ width: 14, height: 14 }} />
                      </button>
                    </div>

                    {/* View details link for existing offers */}
                    {activeTab !== 'new' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setViewingOfferId(activeTab)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 0',
                            background: 'none',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'var(--muted-foreground)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'color 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--foreground)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-foreground)' }}
                        >
                          {t('tasks_board.detail.viewOfferDetails', 'View details')}
                          <ExternalLink style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    )}

                    {/* Tab content */}
                    <div style={{ paddingTop: activeTab !== 'new' ? '4px' : '12px' }}>
                      {activeTab !== 'new' && activeOfferCalculations ? (
                        <OfferCreationFormContent
                          key={activeTab}
                          rfq={{
                            ...task,
                            direction: form.direction || task.direction,
                            transportMode: form.transportMode || task.transportMode,
                            cargoType: form.cargoType || task.cargoType,
                            containerTypes: task.containerTypes,
                          }}
                          direction={form.direction || task.direction || ''}
                          transportMode={form.transportMode || task.transportMode || ''}
                          cargoType={form.cargoType || task.cargoType || ''}
                          initialCalculations={activeOfferCalculations}
                          onCreated={handleOfferCreated}
                          hideFooter
                          onSubmitRef={offerSubmitRef}
                          onSubmittingChange={setOfferSubmitting}
                        />
                      ) : activeTab !== 'new' ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
                          {t('tasks_board.detail.loadingOffer', 'Loading offer data...')}
                        </div>
                      ) : (
                        <OfferCreationFormContent
                          rfq={{
                            ...task,
                            direction: form.direction || task.direction,
                            transportMode: form.transportMode || task.transportMode,
                            cargoType: form.cargoType || task.cargoType,
                            containerTypes: task.containerTypes,
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
                          hideFooter
                          onSubmitRef={offerSubmitRef}
                          onSubmittingChange={setOfferSubmitting}
                        />
                      )}
                    </div>
                </div>
              </div>

              {/* Footer — always visible bottom bar */}
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
                <Button
                  onClick={() => offerSubmitRef.current?.()}
                  disabled={offerSubmitting}
                >
                  {offerSubmitting
                    ? t('tasks_board.offerForm.creating', 'Creating...')
                    : t('tasks_board.offerForm.create', 'Create Offer')}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
