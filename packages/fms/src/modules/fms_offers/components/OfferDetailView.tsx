import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import DatePicker from 'react-datepicker'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Download, Send, CheckCircle2, ChevronLeft, ChevronDown, ChevronRight, Pencil, Trash2, FolderOpen, ExternalLink, Check, Square } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { SendOfferDialog } from './SendOfferDialog'
import { ConvertToProjectDialog } from './ConvertToProjectDialog'
import type { FmsOfferStatus } from '../data/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'

if (typeof window !== 'undefined') {
  // @ts-ignore - CSS import handled by bundler
  import('react-datepicker/dist/react-datepicker.css')
}

type OfferLine = {
  id: string
  lineNumber: number
  productId: string | null
  productName: string | null
  chargeCode: string | null
  chargeBasis: string | null
  chargeUnit: string | null
  containerType?: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  quantity: string
  isEnabled: boolean
  clientGroupLabel?: string | null
}

type OfferCalculation = {
  id: string
  calculationNumber: number
  sectionType: string | null
  label: string | null
  containers: string[] | null
  originLocationId: string | null
  destinationLocationId: string | null
  placeOfLoadingId: string | null
  placeOfDeliveryId: string | null
  lines: OfferLine[]
}

const SECTION_ORDER = ['main_freight', 'origin', 'destination'] as const
const SECTION_LABELS: Record<string, string> = {
  main_freight: 'MAIN FREIGHT',
  origin: 'ORIGIN',
  destination: 'DESTINATION',
}
const LABEL_TO_SECTION: Record<string, string> = {
  'Main Freight': 'main_freight',
  'Origin': 'origin',
  'Destination': 'destination',
}

const SECTION_COLORS: Record<string, { borderLeft: string; text: string }> = {
  main_freight: { borderLeft: 'var(--primary)', text: 'var(--foreground)' },
  origin: { borderLeft: '#f59e0b', text: 'var(--foreground)' },
  destination: { borderLeft: '#8b5cf6', text: 'var(--foreground)' },
}

const INCOTERM_VISIBLE_SECTIONS: Record<string, Set<string>> = {
  exw: new Set(['main_freight', 'origin', 'destination']),
  fca: new Set(['main_freight', 'origin', 'destination']),
  fas: new Set(['main_freight', 'origin']),
  fob: new Set(['main_freight', 'destination']),
  cfr: new Set(['main_freight', 'destination']),
  cif: new Set(['main_freight', 'destination']),
  cpt: new Set(['main_freight', 'destination']),
  cip: new Set(['main_freight', 'destination']),
  dap: new Set(['main_freight']),
  dpu: new Set(['main_freight']),
  ddp: new Set(['main_freight']),
}

function getVisibleSections(incoterm: string | null | undefined): Set<string> {
  if (!incoterm) return new Set(['main_freight', 'origin', 'destination'])
  return INCOTERM_VISIBLE_SECTIONS[incoterm.toLowerCase()] || new Set(['main_freight', 'origin', 'destination'])
}

type Location = {
  id: string
  name: string
  code?: string | null
  type?: string | null
}

type ConvertDialogLine = {
  id: string
  productId: string | null
  productName: string | null
  chargeCode: string | null
  chargeBasis: string | null
  containerType?: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  isEnabled: boolean
  originLocationId: string | null
  destinationLocationId: string | null
}

type ConvertDialogData = {
  locations: Location[]
  lines: ConvertDialogLine[]
  rfqLineLocations?: Array<{
    rfqLineId: string
    originLocationId: string | null
    originLocation: Location | null
    destinationLocationId: string | null
    destinationLocation: Location | null
  }>
  defaultOriginLocationId: string | null
  defaultDestinationLocationId: string | null
}

type OfferDetailData = {
  id: string
  offerNumber: string
  type: string
  version: number
  status: string
  createdAt: string
  validUntil: string | null
  sentAt: string | null
  sentToEmail: string | null
  direction: string | null
  transportMode: string | null
  cargoType: string | null
  paymentTerms: string | null
  specialTerms: string | null
  customerNotes: string | null
  notes: string | null
  contractorId: string | null
  carrierId: string | null
  carrierIds: string[] | null
  providerIds: string[] | null
  incoterm: string | null
  contactPersonId: string | null
  billingAddressId: string | null
  supersededById?: string | null
  documentId?: string | null
  rfq: {
    id: string
    title: string | null
    origin: string | null
    destination: string | null
    companyName: string | null
    contractorId: string | null
    contactPerson: string | null
    contactPersonId: string | null
    containerCount: number | null
    direction: string | null
    transportMode: string | null
    cargoType: string | null
  } | null
  calculations: OfferCalculation[]
  convertDialogData?: ConvertDialogData | null
  projects?: {
    id: string
    projectNumber: string
  }[]
}

type OfferDetailViewProps = {
  offerId: string
  onBack: () => void
  onDelete?: () => void
  onOfferLoaded?: (data: { rfqId: string | null; currencies: string[] }) => void
}

// -- Status config --
const STATUS_OPTIONS: Array<{ status: FmsOfferStatus; label: string; color: string; bg: string }> = [
  { status: 'draft', label: 'Draft', color: '#374151', bg: '#f3f4f6' },
  { status: 'sent', label: 'Sent', color: '#1d4ed8', bg: '#dbeafe' },
  { status: 'accepted', label: 'Accepted', color: '#15803d', bg: '#dcfce7' },
  { status: 'declined', label: 'Declined', color: '#dc2626', bg: '#fee2e2' },
  { status: 'expired', label: 'Expired', color: '#c2410c', bg: '#ffedd5' },
]

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

function formatNumber(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num) || num === 0) return '0.00'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function calcMarginPercent(buy: number, sell: number): string {
  if (!sell || sell === 0) return '0.0'
  const margin = ((sell - buy) / sell) * 100
  return margin.toFixed(1)
}

export function OfferDetailView({ offerId, onBack, onDelete, onOfferLoaded }: OfferDetailViewProps) {
  const t = useT()
  const queryClient = useQueryClient()

  const { data: offer, isLoading, isError } = useQuery<OfferDetailData>({
    queryKey: ['offer-detail', offerId],
    queryFn: async () => {
      const res = await apiCall<OfferDetailData>(`/api/fms_offers/offers/${offerId}`)
      if (!res.ok || !res.result) throw new Error('Failed to fetch offer')
      return res.result
    },
    enabled: !!offerId,
    staleTime: 30_000,
  })

  // Notify parent of rfqId and currencies when offer loads
  const offerRfqId = (offer as any)?.rfqId || offer?.rfq?.id || null
  const offerCurrencies = useMemo(() => {
    if (!offer) return []
    const currencies = new Set<string>()
    for (const calc of offer.calculations) {
      for (const line of calc.lines) {
        if (line.isEnabled && line.currencyCode) currencies.add(line.currencyCode)
      }
    }
    return Array.from(currencies).sort()
  }, [offer])

  const prevNotifiedRef = useRef<string>('')
  useEffect(() => {
    if (!offer || !onOfferLoaded) return
    const key = `${offerRfqId}|${offerCurrencies.join(',')}`
    if (key === prevNotifiedRef.current) return
    prevNotifiedRef.current = key
    onOfferLoaded({ rfqId: offerRfqId, currencies: offerCurrencies })
  }, [offer, onOfferLoaded, offerRfqId, offerCurrencies])

  // -- Expanded item boxes --
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set([0]))

  // Group calculations by location pair (same origin+destination = same item/route)
  const calculationGroups = useMemo(() => {
    if (!offer) return []
    const groups = new Map<string, OfferCalculation[]>()
    for (const calc of offer.calculations) {
      const key = `${calc.originLocationId || '_'}|${calc.destinationLocationId || '_'}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(calc)
    }
    return Array.from(groups.values())
  }, [offer])

  // Initialize all boxes expanded when offer first loads
  const initializedForOffer = useRef<string | null>(null)
  useEffect(() => {
    if (calculationGroups.length > 0 && initializedForOffer.current !== offerId) {
      initializedForOffer.current = offerId
      setExpandedBoxes(new Set(calculationGroups.map((_, i) => i)))
    }
  }, [calculationGroups, offerId])

  // -- Resolve location names from IDs --
  const locationIds = useMemo(() => {
    if (!offer) return []
    const ids = new Set<string>()
    for (const calc of offer.calculations) {
      if (calc.originLocationId) ids.add(calc.originLocationId)
      if (calc.destinationLocationId) ids.add(calc.destinationLocationId)
    }
    return Array.from(ids)
  }, [offer])

  const { data: locationNames } = useQuery<Map<string, string>>({
    queryKey: ['location-names', locationIds.sort().join(',')],
    queryFn: async () => {
      const nameMap = new Map<string, string>()
      for (const locId of locationIds) {
        const res = await apiCall<{ id: string; name: string; code?: string }>(`/api/fms_locations/locations/${locId}`)
        if (res.ok && res.result) {
          nameMap.set(locId, res.result.code || res.result.name)
        }
      }
      return nameMap
    },
    enabled: locationIds.length > 0,
    staleTime: 5 * 60_000,
  })

  // -- Editable valid until --
  const [editingValidUntil, setEditingValidUntil] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)

  const validUntilDate = offer?.validUntil ? new Date(offer.validUntil) : null

  const handleValidUntilChange = useCallback(async (date: Date | null) => {
    if (!offer || !date) return
    setEditingValidUntil(false)
    try {
      await apiCall(`/api/fms_offers/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validUntil: date.toISOString() }),
      })
      queryClient.invalidateQueries({ queryKey: ['offer-detail', offerId] })
    } catch {
      flash('Failed to update valid until date', 'error')
    }
  }, [offer, offerId, queryClient])

  useEffect(() => {
    if (!editingValidUntil) return
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setEditingValidUntil(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingValidUntil])

  // -- Status dropdown --
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false)
      }
    }
    if (statusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [statusDropdownOpen])

  const handleStatusChange = useCallback(async (newStatus: FmsOfferStatus) => {
    if (!offer) return
    setUpdatingStatus(true)
    setStatusDropdownOpen(false)
    try {
      await apiCall(`/api/fms_offers/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      flash(`Offer marked as ${newStatus}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['offer-detail', offerId] })
      queryClient.invalidateQueries({ queryKey: ['rfq-offers'] })
      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
      queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
    } catch {
      flash('Failed to update status', 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }, [offer, offerId, queryClient])

  // -- Delete offer --
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = useCallback(async () => {
    if (!offer) return
    setIsDeleting(true)
    try {
      const response = await apiCall(`/api/fms_offers/offers/${offer.id}`, { method: 'DELETE' })
      if (response.ok) {
        flash('Offer deleted', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
        queryClient.invalidateQueries({ queryKey: ['rfq-offers'] })
        queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
        setShowDeleteDialog(false)
        onDelete?.()
        onBack()
      } else {
        flash('Failed to delete offer', 'error')
      }
    } catch {
      flash('Failed to delete offer', 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [offer, queryClient, onDelete, onBack])

  // -- Convert to project --
  const [showConvertDialog, setShowConvertDialog] = useState(false)

  // -- PDF generation --
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const handleSavePdf = useCallback(async () => {
    if (!offer) return
    setGeneratingPdf(true)
    try {
      const res = await apiCall<{ documentId: string; url: string; fileName: string }>(`/api/fms_offers/offers/${offer.id}/pdf`, {
        method: 'POST',
      })
      if (res.ok && res.result?.url) {
        queryClient.invalidateQueries({ queryKey: ['offer-detail', offerId] })
        const link = document.createElement('a')
        link.href = res.result.url
        link.download = res.result.fileName || `${offer.offerNumber}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        flash('Failed to generate PDF', 'error')
      }
    } catch {
      flash('Failed to generate PDF', 'error')
    } finally {
      setGeneratingPdf(false)
    }
  }, [offer, offerId, queryClient])

  // -- Send to client --
  const [showSendDialog, setShowSendDialog] = useState(false)
  const handleSendSuccess = useCallback(() => {
    setShowSendDialog(false)
    queryClient.invalidateQueries({ queryKey: ['offer-detail', offerId] })
    queryClient.invalidateQueries({ queryKey: ['rfq-offers'] })
    queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
  }, [offerId, queryClient])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px' }}>
        <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t('fms_offers.offerDetail.loading', 'Loading offer...')}</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (isError || !offer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
        <span className="text-sm text-destructive">{t('fms_offers.offerDetail.error', 'Failed to load offer')}</span>
      </div>
    )
  }

  const transportMode = offer.transportMode || offer.rfq?.transportMode
  const currentStatusConfig = STATUS_OPTIONS.find((s) => s.status === offer.status) || STATUS_OPTIONS[0]
  const availableStatuses = STATUS_OPTIONS.filter((s) => s.status !== offer.status && s.status !== 'expired')
  const allEnabledLines = offer.calculations.flatMap((c) => c.lines.filter((l) => l.isEnabled))
  const totalAmount = allEnabledLines.reduce((sum, line) => sum + (parseFloat(line.sellPrice) || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Compact header: Offer number + type + dates */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>
            {offer.offerNumber}
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '9999px',
              backgroundColor: (offer.type || 'sell') === 'sell' ? '#dcfce7' : '#dbeafe',
              color: (offer.type || 'sell') === 'sell' ? '#15803d' : '#1d4ed8',
              textTransform: 'uppercase',
            }}
          >
            {(offer.type || 'sell').toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground">v{offer.version}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
          <span className="text-muted-foreground">
            {formatDate(offer.createdAt)}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
            <span className="text-muted-foreground">{t('fms_offers.offerDetail.validUntil', 'Valid until')}:</span>
            <button
              type="button"
              onClick={() => setEditingValidUntil(!editingValidUntil)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 600,
                border: `1.5px dashed ${editingValidUntil ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: '14px',
                padding: '1px 8px',
                background: editingValidUntil ? 'var(--accent)' : 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--foreground)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {formatDate(offer.validUntil)}
              <Pencil style={{ width: 10, height: 10, opacity: 0.4 }} />
            </button>
            {editingValidUntil && (
              <div
                ref={calendarRef}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  zIndex: 50,
                  background: 'var(--popover, white)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                  padding: '4px',
                }}
              >
                <DatePicker
                  selected={validUntilDate}
                  onChange={handleValidUntilChange}
                  inline
                  calendarClassName="offer-datepicker"
                />
              </div>
            )}
          </span>
        </div>
      </div>

      {/* Scrollable content: Per-item boxes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {calculationGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
            {t('fms_offers.offerDetail.noCalculations', 'No calculations in this offer')}
          </div>
        ) : calculationGroups.map((calcs, groupIdx) => {
          const isExpanded = expandedBoxes.has(groupIdx)
          const firstCalc = calcs[0]
          const originName = firstCalc.originLocationId ? locationNames?.get(firstCalc.originLocationId) : null
          const destName = firstCalc.destinationLocationId ? locationNames?.get(firstCalc.destinationLocationId) : null
          const displayOrigin = originName || offer.rfq?.origin || '?'
          const displayDest = destName || offer.rfq?.destination || '?'
          const visibleSections = getVisibleSections(offer.incoterm)

          return (
            <div key={groupIdx} style={{ marginBottom: '16px' }}>
              {/* Route header bar */}
              <button
                type="button"
                onClick={() => {
                  setExpandedBoxes((prev) => {
                    const next = new Set(prev)
                    if (next.has(groupIdx)) next.delete(groupIdx)
                    else next.add(groupIdx)
                    return next
                  })
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: 'var(--accent)',
                  borderRadius: isExpanded ? '10px 10px 0 0' : '10px',
                  width: '100%',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexWrap: 'wrap',
                  textAlign: 'left',
                }}
              >
                {isExpanded
                  ? <ChevronDown style={{ width: 14, height: 14, opacity: 0.5, color: 'var(--foreground)' }} />
                  : <ChevronRight style={{ width: 14, height: 14, opacity: 0.5, color: 'var(--foreground)' }} />}

                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>
                  {displayOrigin}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>→</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>
                  {displayDest}
                </span>

                {transportMode && (
                  <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px',
                    background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)',
                  }}>
                    {transportMode.charAt(0).toUpperCase() + transportMode.slice(1)}
                  </span>
                )}

                {offer.incoterm && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px',
                    background: '#fef3c7', color: '#92400e',
                  }}>
                    {offer.incoterm.toUpperCase()}
                  </span>
                )}
              </button>

              {/* Expanded: sectioned table */}
              {isExpanded && (
                <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--accent)' }}>
                        <th style={{ width: 36, padding: '8px 12px' }} />
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--muted-foreground)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('fms_offers.offerDetail.name', 'Name')}
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--muted-foreground)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('fms_offers.offerDetail.basis', 'Basis')}
                        </th>
                        <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 500, color: 'var(--muted-foreground)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: 50 }}>
                          QTY
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--muted-foreground)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('fms_offers.offerDetail.currency', 'Currency')}
                        </th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500, color: 'var(--muted-foreground)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('fms_offers.offerDetail.buy', 'Buy')}
                        </th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500, color: 'var(--muted-foreground)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: 70 }}>
                          {t('fms_offers.offerDetail.margin', 'Margin')}%
                        </th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500, color: 'var(--muted-foreground)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('fms_offers.offerDetail.sell', 'Sell')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Render each calculation as a section, using label or sectionType for identity */}
                      {calcs.map((calc) => {
                        const resolvedSectionType = calc.sectionType || LABEL_TO_SECTION[calc.label || ''] || null
                        // Hide empty sections filtered by incoterm; always show sections with lines
                        if (resolvedSectionType && !visibleSections.has(resolvedSectionType) && calc.lines.length === 0) return null
                        const colors = SECTION_COLORS[resolvedSectionType || 'main_freight']
                        const sectionLabel = calc.label || SECTION_LABELS[resolvedSectionType || ''] || 'CHARGES'

                        return (
                          <React.Fragment key={calc.id}>
                            {/* Section header row */}
                            <tr>
                              <td
                                colSpan={8}
                                style={{
                                  padding: '8px 14px',
                                  borderLeft: `3px solid ${colors.borderLeft}`,
                                  borderBottom: '1px solid var(--border)',
                                  background: 'var(--background)',
                                }}
                              >
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  letterSpacing: '0.08em',
                                  color: colors.text,
                                  textTransform: 'uppercase',
                                }}>
                                  {sectionLabel.toUpperCase()}
                                </span>
                              </td>
                            </tr>

                            {/* Lines for this section */}
                            {calc.lines.length === 0 ? (
                              <tr>
                                <td colSpan={8} style={{ padding: '12px 16px', color: 'var(--muted-foreground)', fontSize: '12px', fontStyle: 'italic' }}>
                                  —
                                </td>
                              </tr>
                            ) : (
                              calc.lines.map((line) => {
                                const buy = parseFloat(line.buyPrice) || 0
                                const sell = parseFloat(line.sellPrice) || 0
                                const qty = parseFloat(line.quantity) || 1
                                const marginPct = calcMarginPercent(buy, sell)

                                return (
                                  <tr
                                    key={line.id}
                                    style={{
                                      borderBottom: '1px solid var(--border)',
                                      opacity: line.isEnabled ? 1 : 0.4,
                                    }}
                                  >
                                    <td style={{ padding: '8px 12px', width: 36, textAlign: 'center' }}>
                                      {line.isEnabled ? (
                                        <Check className="h-4 w-4 text-primary" />
                                      ) : (
                                        <Square className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                                      {line.productName || line.chargeCode || '—'}
                                    </td>
                                    <td style={{ padding: '8px 12px', color: 'var(--muted-foreground)' }}>
                                      {line.chargeBasis || line.containerType || '—'}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>
                                      {qty !== 1 ? qty : ''}
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                      {line.currencyCode}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                      {formatNumber(line.buyPrice)}
                                    </td>
                                    <td style={{
                                      padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '12px',
                                      color: parseFloat(marginPct) > 0 ? '#15803d' : parseFloat(marginPct) < 0 ? '#dc2626' : 'var(--muted-foreground)',
                                    }}>
                                      {marginPct}%
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                      {formatNumber(line.sellPrice)}
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}

        {/* Projects section */}
        {(offer.projects?.length ?? 0) > 0 && (
          <div style={{ marginTop: '8px', padding: '12px 0' }}>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              {(offer.projects?.length ?? 0) > 1 ? t('fms_offers.offerDetail.projects', 'Projects') : t('fms_offers.offerDetail.project', 'Project')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {offer.projects?.map((project) => (
                <div key={project.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <a
                    href={`/backend/fms-projects/${project.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-semibold text-primary hover:underline"
                  >
                    {project.projectNumber}
                    <ExternalLink className="h-2.5 w-2.5 ml-1 inline" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Superseded warning */}
        {offer.supersededById && (
          <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-3 text-[13px] text-purple-700">
            This offer has been superseded by a newer version.
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--card)',
        }}
      >
        {/* Left: Back + Convert */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t('fms_offers.offerDetail.back', 'Back')}
          </Button>
          <Button
            size="sm"
            variant={(offer.projects?.length ?? 0) > 0 ? 'ghost' : 'outline'}
            onClick={() => setShowConvertDialog(true)}
            style={{ gap: '6px' }}
          >
            <FolderOpen className="h-4 w-4" />
            {(offer.projects?.length ?? 0) > 0
              ? t('fms_offers.offerDetail.createAnotherFile', 'Create File')
              : t('fms_offers.offerDetail.convertToFile', 'Convert to File')}
          </Button>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {offer.status === 'draft' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDeleteDialog(true)}
              className="text-muted-foreground hover:text-destructive"
              style={{ gap: '6px' }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleSavePdf}
            disabled={generatingPdf}
            style={{ gap: '6px' }}
          >
            <Download className="h-4 w-4" />
            {generatingPdf
              ? t('fms_offers.offerDetail.generatingPdf', 'Generating...')
              : t('fms_offers.offerDetail.savePdf', 'Save as PDF')}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSendDialog(true)}
            style={{ gap: '6px' }}
          >
            <Send className="h-4 w-4" />
            {t('fms_offers.offerDetail.sendToClient', 'Send to Client')}
          </Button>

          {/* Status dropdown */}
          <div ref={statusRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              disabled={updatingStatus}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: updatingStatus ? 'wait' : 'pointer',
                border: 'none',
                background: currentStatusConfig.bg,
                color: currentStatusConfig.color,
                fontFamily: 'inherit',
                opacity: updatingStatus ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <CheckCircle2 style={{ width: 14, height: 14 }} />
              {currentStatusConfig.label}
              <ChevronDown style={{ width: 12, height: 12 }} />
            </button>
            {statusDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: '4px',
                  minWidth: '180px',
                  background: 'var(--popover, white)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                  padding: '4px',
                  zIndex: 50,
                }}
              >
                {availableStatuses.map((item) => (
                  <button
                    key={item.status}
                    type="button"
                    onClick={() => handleStatusChange(item.status)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      color: 'inherit',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: item.color,
                        flexShrink: 0,
                      }}
                    />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Send dialog */}
      {offer && (
        <SendOfferDialog
          offerId={offer.id}
          offerNumber={offer.offerNumber}
          clientName={offer.rfq?.companyName || ''}
          currentStatus={offer.status as FmsOfferStatus}
          sentAt={offer.sentAt}
          sentToEmail={offer.sentToEmail}
          open={showSendDialog}
          onClose={() => setShowSendDialog(false)}
          onSuccess={handleSendSuccess}
        />
      )}

      {/* Delete dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Offer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete offer &quot;{offer?.offerNumber}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Project Dialog */}
      {offer && (
        <ConvertToProjectDialog
          offerId={offer.id}
          offerNumber={offer.offerNumber}
          clientName={offer.rfq?.companyName || ''}
          originPortCode={offer.rfq?.origin}
          destinationPortCode={offer.rfq?.destination}
          totalAmount={totalAmount}
          currencyCode={allEnabledLines[0]?.currencyCode || 'USD'}
          convertDialogData={offer.convertDialogData}
          open={showConvertDialog}
          onClose={() => setShowConvertDialog(false)}
        />
      )}

      {/* DatePicker styles */}
      <style>{`
        .offer-datepicker {
          border: none !important;
          font-family: inherit;
          background: var(--popover, white);
        }
        .offer-datepicker .react-datepicker__header {
          background: var(--popover, white);
          border-bottom: 1px solid var(--border);
          padding-top: 8px;
        }
        .offer-datepicker .react-datepicker__current-month {
          font-size: 14px;
          font-weight: 600;
          color: var(--primary);
        }
        .offer-datepicker .react-datepicker__day-name,
        .offer-datepicker .react-datepicker__day {
          width: 32px;
          line-height: 32px;
          margin: 2px;
          font-size: 13px;
          color: var(--foreground);
        }
        .offer-datepicker .react-datepicker__day:hover {
          background-color: var(--accent);
          border-radius: 6px;
        }
        .offer-datepicker .react-datepicker__day--selected,
        .offer-datepicker .react-datepicker__day--keyboard-selected {
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          border-radius: 6px;
        }
        .offer-datepicker .react-datepicker__day--today {
          font-weight: bold;
          background-color: var(--accent);
          border-radius: 6px;
        }
        .offer-datepicker .react-datepicker__navigation { top: 12px; }
        .offer-datepicker .react-datepicker__navigation-icon::before { border-color: var(--muted-foreground); }
        .offer-datepicker .react-datepicker__navigation:hover *::before { border-color: var(--primary); }
      `}</style>
    </div>
  )
}
