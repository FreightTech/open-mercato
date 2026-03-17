import React, { useState, useRef, useEffect, useCallback } from 'react'
import DatePicker from 'react-datepicker'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Download, Send, CheckCircle2, ChevronLeft, ChevronDown, Pencil, Plus, Building2, Trash2, FolderOpen, ExternalLink } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { DIRECTION_OPTIONS, TRANSPORT_MODE_OPTIONS, CARGO_TYPE_OPTIONS } from '../lib/chip-options'
import { ContractorSearchInput } from './ContractorSearchInput'
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
  isEnabled: boolean
}

type OfferCalculation = {
  id: string
  calculationNumber: number
  label: string | null
  containers: string[] | null
  originLocationId: string | null
  destinationLocationId: string | null
  placeOfLoadingId: string | null
  placeOfDeliveryId: string | null
  lines: OfferLine[]
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
  rfqLineLocations: Array<{
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

type ContractorAddress = {
  id: string
  purpose: string
  addressLine: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  isPrimary: boolean
  isActive: boolean
}

type ContractorData = {
  id: string
  name: string
  shortName: string | null
  addresses: ContractorAddress[]
}

type OfferDetailViewProps = {
  offerId: string
  onBack: () => void
  onDelete?: () => void
}

// -- Colors --
const ACCENT = '#1e3a5f'
const ACCENT_LIGHT = '#eef2f7'
const LABEL_COLOR = ACCENT
const BORDER_LIGHT = '#dce3ed'

// -- Dummy company address (issuer / billing) --
const COMPANY_INFO = {
  name: 'Transport Solutions',
  address: 'ul. Portowa 123, 80-001 Gdańsk, Poland',
  email: 'sales@transportsolutions.com',
  phone: '+48 58 123 4567',
}

function formatAddressLines(addr: ContractorAddress): string[] {
  const lines: string[] = []
  if (addr.addressLine) lines.push(addr.addressLine)
  const cityLine = [addr.postalCode, addr.city].filter(Boolean).join(' ')
  if (cityLine) {
    lines.push(addr.country ? `${cityLine}, ${addr.country}` : cityLine)
  } else if (addr.country) {
    lines.push(addr.country)
  }
  return lines
}

function pickBillingAddress(addresses: ContractorAddress[]): ContractorAddress | null {
  const active = addresses.filter((a) => a.isActive)
  const billing = active.find((a) => a.purpose === 'billing' && a.isPrimary)
    || active.find((a) => a.purpose === 'billing')
  if (billing) return billing
  const primary = active.find((a) => a.isPrimary)
  return primary || active[0] || null
}

function findOptionLabel(options: { value: string; label: string }[], value: string | null): string | null {
  if (!value) return null
  return options.find((o) => o.value === value)?.label ?? value
}

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
  if (isNaN(num)) return '0.00'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

// -- Status config --
const STATUS_OPTIONS: Array<{ status: FmsOfferStatus; label: string; color: string; bg: string }> = [
  { status: 'draft', label: 'Draft', color: '#374151', bg: '#f3f4f6' },
  { status: 'sent', label: 'Sent', color: '#1d4ed8', bg: '#dbeafe' },
  { status: 'accepted', label: 'Accepted', color: '#15803d', bg: '#dcfce7' },
  { status: 'declined', label: 'Declined', color: '#dc2626', bg: '#fee2e2' },
  { status: 'expired', label: 'Expired', color: '#c2410c', bg: '#ffedd5' },
]

export function OfferDetailView({ offerId, onBack, onDelete }: OfferDetailViewProps) {
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

  // Close calendar on click outside
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

  // -- Contractor data (fetched by FK) --
  const resolvedContractorId = offer?.contractorId || offer?.rfq?.contractorId || null
  const [contractorId, setContractorId] = useState<string | null>(null)
  const [changingContractor, setChangingContractor] = useState(false)

  // Sync contractorId from offer data when it loads
  useEffect(() => {
    if (resolvedContractorId) {
      setContractorId(resolvedContractorId)
    }
  }, [resolvedContractorId])

  // Fetch contractor detail
  const { data: contractor } = useQuery<ContractorData>({
    queryKey: ['contractor-detail', contractorId],
    queryFn: async () => {
      if (!contractorId) throw new Error('No contractor')
      const res = await apiCall<ContractorData>(`/api/contractors/contractors/${contractorId}`)
      if (!res.ok || !res.result) throw new Error('Failed to fetch contractor')
      return res.result
    },
    enabled: !!contractorId,
  })

  // Fetch contractor locations (fms_locations) which contain billing addresses
  const { data: contractorLocations, refetch: refetchLocations } = useQuery<ContractorAddress[]>({
    queryKey: ['contractor-locations', contractorId],
    queryFn: async () => {
      if (!contractorId) return []
      const res = await apiCall<{ items: Array<{ id: string; type: string; name: string; addressLine1: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; isPrimary: boolean; isActive: boolean }> }>(
        `/api/fms_locations/contractor-addresses?contractorId=${contractorId}`,
      )
      if (!res.ok || !res.result?.items) return []
      return res.result.items.map((loc) => ({
        id: loc.id,
        purpose: loc.type.replace('contractor_', ''),
        addressLine: loc.addressLine1,
        city: loc.city,
        state: loc.state,
        postalCode: loc.postalCode,
        country: loc.country,
        isPrimary: loc.isPrimary,
        isActive: loc.isActive,
      }))
    },
    enabled: !!contractorId,
  })

  const billingAddress = contractorLocations?.length
    ? (offer?.billingAddressId
        ? contractorLocations.find((a) => a.id === offer.billingAddressId) || null
        : pickBillingAddress(contractorLocations))
    : null

  // -- Add new address to contractor --
  const [addingAddress, setAddingAddress] = useState(false)
  const [newAddressLine, setNewAddressLine] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newPostalCode, setNewPostalCode] = useState('')
  const [newCountry, setNewCountry] = useState('')
  const newAddressRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingAddress && newAddressRef.current) {
      newAddressRef.current.focus()
    }
  }, [addingAddress])

  const handleSaveNewAddress = useCallback(async () => {
    if (!contractorId || !newAddressLine.trim()) return
    setAddingAddress(false)
    try {
      const addrRes = await apiCall<{ id: string }>('/api/fms_locations/contractor-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          type: 'contractor_billing',
          name: newAddressLine.trim(),
          addressLine1: newAddressLine.trim(),
          city: newCity.trim() || null,
          postalCode: newPostalCode.trim() || null,
          country: newCountry.trim() || null,
          isPrimary: true,
        }),
      })
      // Save billingAddressId on the offer
      if (addrRes.ok && addrRes.result?.id && offer?.id) {
        await apiCall(`/api/fms_offers/offers/${offer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ billingAddressId: addrRes.result.id }),
        })
        queryClient.invalidateQueries({ queryKey: ['offer-detail', offerId] })
      }
      refetchLocations()
      setNewAddressLine('')
      setNewCity('')
      setNewPostalCode('')
      setNewCountry('')
    } catch {
      flash('Failed to save address', 'error')
    }
  }, [contractorId, newAddressLine, newCity, newPostalCode, newCountry, refetchLocations, offer?.id, offerId, queryClient])

  const handleContractorChange = useCallback((newContractorId: string | null, name?: string) => {
    if (newContractorId) {
      setContractorId(newContractorId)
      setChangingContractor(false)
      // Save contractorId on the offer
      if (offer?.id) {
        apiCall(`/api/fms_offers/offers/${offer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contractorId: newContractorId }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['offer-detail', offerId] })
        })
      }
      // Also update the RFQ companyName + contractorId
      if (offer?.rfq?.id && name) {
        apiCall(`/api/fms_offers/rfq/${offer.rfq.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName: name, contractorId: newContractorId }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
        })
      }
    }
  }, [offer?.id, offer?.rfq?.id, offerId, queryClient])

  // -- Carrier data (fetched by FK) --
  const [carrierId, setCarrierId] = useState<string | null>(null)
  const [changingCarrier, setChangingCarrier] = useState(false)

  useEffect(() => {
    if (offer?.carrierId) {
      setCarrierId(offer.carrierId)
    }
  }, [offer?.carrierId])

  const { data: carrier } = useQuery<ContractorData>({
    queryKey: ['carrier-detail', carrierId],
    queryFn: async () => {
      if (!carrierId) throw new Error('No carrier')
      const res = await apiCall<ContractorData>(`/api/contractors/contractors/${carrierId}`)
      if (!res.ok || !res.result) throw new Error('Failed to fetch carrier')
      return res.result
    },
    enabled: !!carrierId,
  })

  const handleCarrierChange = useCallback((newCarrierId: string | null) => {
    if (newCarrierId) {
      setCarrierId(newCarrierId)
      setChangingCarrier(false)
      if (offer?.id) {
        apiCall(`/api/fms_offers/offers/${offer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ carrierId: newCarrierId }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['offer-detail', offerId] })
        })
      }
    }
  }, [offer?.id, offerId, queryClient])

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
      const response = await apiCall(`/api/fms_offers/offers/${offer.id}`, {
        method: 'DELETE',
      })
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
        // Trigger download
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

  // -- Send to client (dialog) --
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

  const direction = offer.direction || offer.rfq?.direction
  const transportMode = offer.transportMode || offer.rfq?.transportMode
  const cargoType = offer.cargoType || offer.rfq?.cargoType
  const origin = offer.rfq?.origin || null
  const destination = offer.rfq?.destination || null
  const hasContainerType = offer.calculations.some((c) => c.lines.some((l) => l.containerType))

  const currentStatusConfig = STATUS_OPTIONS.find((s) => s.status === offer.status) || STATUS_OPTIONS[0]
  const availableStatuses = STATUS_OPTIONS.filter((s) => s.status !== offer.status && s.status !== 'expired')

  // Totals for convert dialog
  const allEnabledLines = offer.calculations.flatMap((c) => c.lines.filter((l) => l.isEnabled))
  const totalAmount = allEnabledLines.reduce((sum, line) => sum + (parseFloat(line.sellPrice) || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 28px' }}>
        {/* ================================================================
            HEADER — Company info (left) + Offer badge + dates (right)
            ================================================================ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          {/* Company info (issuer) — top left */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: ACCENT }}>{COMPANY_INFO.name}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><polyline points="16 21 12 17 8 21" /><line x1="2" y1="7" x2="12" y2="2" /><line x1="12" y1="2" x2="22" y2="7" /></svg>
              {COMPANY_INFO.address}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,4 12,13 2,4" /></svg>
              {COMPANY_INFO.email}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              {COMPANY_INFO.phone}
            </div>
          </div>

          {/* Offer badge + dates — top right */}
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                display: 'inline-block',
                border: `2px solid ${ACCENT}`,
                borderRadius: '8px',
                padding: '8px 20px',
                marginBottom: '10px',
              }}
            >
              <div style={{ fontSize: '10px', color: ACCENT, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('fms_offers.offerDetail.offerNumber', 'Offer Number')}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: ACCENT, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {offer.offerNumber}
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: (offer.type || 'sell') === 'sell' ? '#dcfce7' : '#dbeafe',
                  color: (offer.type || 'sell') === 'sell' ? '#15803d' : '#1d4ed8',
                  textTransform: 'uppercase',
                }}>
                  {(offer.type || 'sell').toUpperCase()}
                </span>
              </div>
            </div>
            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
              <span>
                <span style={{ color: '#6b7280' }}>{t('fms_offers.offerDetail.created', 'Date')}:</span>{' '}
                <strong>{formatDate(offer.createdAt)}</strong>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                <span style={{ color: '#6b7280' }}>{t('fms_offers.offerDetail.validUntil', 'Valid until')}:</span>{' '}
                <button
                  type="button"
                  onClick={() => setEditingValidUntil(!editingValidUntil)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '13px',
                    fontWeight: 700,
                    border: `1.5px dashed ${editingValidUntil ? ACCENT : BORDER_LIGHT}`,
                    borderRadius: '14px',
                    padding: '2px 10px',
                    background: editingValidUntil ? ACCENT_LIGHT : 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: 'inherit',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ACCENT }}
                  onMouseLeave={(e) => { if (!editingValidUntil) (e.currentTarget as HTMLElement).style.borderColor = BORDER_LIGHT }}
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
                      border: '1px solid var(--border, #e5e7eb)',
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
        </div>

        <hr style={{ border: 'none', borderTop: `1px solid ${BORDER_LIGHT}`, margin: '0 0 24px' }} />

        {/* ================================================================
            CUSTOMER — Company name + billing address from contractor
            ================================================================ */}
        <SectionLabel>{t('fms_offers.offerDetail.customer', 'Customer')}</SectionLabel>
        <div
          style={{
            background: ACCENT_LIGHT,
            borderRadius: '8px',
            padding: '14px 18px',
            marginBottom: '24px',
            position: 'relative',
          }}
        >
          {changingContractor ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('fms_offers.offerDetail.changeContractor', 'Select contractor')}
              </div>
              <ContractorSearchInput
                value={contractorId}
                onChange={handleContractorChange}
                placeholder={t('fms_offers.offerDetail.searchContractor', 'Search contractor...')}
              />
              <button
                type="button"
                onClick={() => setChangingContractor(false)}
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                {t('fms_offers.offerDetail.cancelChange', 'Cancel')}
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>
                    {contractor?.name || offer.rfq?.companyName || t('fms_offers.offerDetail.noCustomer', 'Not specified')}
                  </div>
                  {billingAddress ? (
                    formatAddressLines(billingAddress).map((line, i) => (
                      <div key={i} style={{ fontSize: '13px', color: '#4b5563', marginTop: '1px' }}>{line}</div>
                    ))
                  ) : contractorId ? (
                    addingAddress ? (
                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          ref={newAddressRef}
                          type="text"
                          value={newAddressLine}
                          onChange={(e) => setNewAddressLine(e.target.value)}
                          placeholder={t('fms_offers.offerDetail.addressLine', 'Street address')}
                          style={{
                            fontSize: '12px',
                            padding: '4px 8px',
                            border: `1.5px dashed ${ACCENT}`,
                            borderRadius: '4px',
                            outline: 'none',
                            background: 'white',
                            fontFamily: 'inherit',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input
                            type="text"
                            value={newPostalCode}
                            onChange={(e) => setNewPostalCode(e.target.value)}
                            placeholder={t('fms_offers.offerDetail.postalCode', 'Postal code')}
                            style={{
                              fontSize: '12px',
                              padding: '4px 8px',
                              border: `1px solid ${BORDER_LIGHT}`,
                              borderRadius: '4px',
                              outline: 'none',
                              background: 'white',
                              fontFamily: 'inherit',
                              width: '90px',
                            }}
                          />
                          <input
                            type="text"
                            value={newCity}
                            onChange={(e) => setNewCity(e.target.value)}
                            placeholder={t('fms_offers.offerDetail.city', 'City')}
                            style={{
                              fontSize: '12px',
                              padding: '4px 8px',
                              border: `1px solid ${BORDER_LIGHT}`,
                              borderRadius: '4px',
                              outline: 'none',
                              background: 'white',
                              fontFamily: 'inherit',
                              flex: 1,
                            }}
                          />
                          <input
                            type="text"
                            value={newCountry}
                            onChange={(e) => setNewCountry(e.target.value)}
                            placeholder={t('fms_offers.offerDetail.country', 'Country')}
                            style={{
                              fontSize: '12px',
                              padding: '4px 8px',
                              border: `1px solid ${BORDER_LIGHT}`,
                              borderRadius: '4px',
                              outline: 'none',
                              background: 'white',
                              fontFamily: 'inherit',
                              width: '100px',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                          <button
                            type="button"
                            onClick={handleSaveNewAddress}
                            disabled={!newAddressLine.trim()}
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '3px 10px',
                              borderRadius: '4px',
                              border: 'none',
                              background: ACCENT,
                              color: 'white',
                              cursor: newAddressLine.trim() ? 'pointer' : 'not-allowed',
                              opacity: newAddressLine.trim() ? 1 : 0.5,
                              fontFamily: 'inherit',
                            }}
                          >
                            {t('fms_offers.offerDetail.saveAddress', 'Save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddingAddress(false)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 10px',
                              borderRadius: '4px',
                              border: `1px solid ${BORDER_LIGHT}`,
                              background: 'white',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              color: '#6b7280',
                            }}
                          >
                            {t('fms_offers.offerDetail.cancelAddress', 'Cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingAddress(true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '4px',
                          fontSize: '12px',
                          color: ACCENT,
                          background: 'transparent',
                          border: `1px dashed ${BORDER_LIGHT}`,
                          borderRadius: '4px',
                          padding: '3px 8px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <Plus style={{ width: 10, height: 10 }} />
                        {t('fms_offers.offerDetail.addAddress', 'Add billing address')}
                      </button>
                    )
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setChangingContractor(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: '#6b7280',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    padding: '2px 4px',
                  }}
                  title={t('fms_offers.offerDetail.changeContractorTitle', 'Change contractor')}
                >
                  <Building2 style={{ width: 12, height: 12 }} />
                  <Pencil style={{ width: 10, height: 10, opacity: 0.4 }} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* ================================================================
            CARRIER
            ================================================================ */}
        <SectionLabel>{t('fms_offers.offerDetail.carrier', 'Carrier')}</SectionLabel>
        <div
          style={{
            background: ACCENT_LIGHT,
            borderRadius: '8px',
            padding: '14px 18px',
            marginBottom: '24px',
            position: 'relative',
          }}
        >
          {changingCarrier ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('fms_offers.offerDetail.selectCarrier', 'Select carrier')}
              </div>
              <ContractorSearchInput
                value={carrierId}
                onChange={handleCarrierChange}
                placeholder={t('fms_offers.offerDetail.searchCarrier', 'Search carrier...')}
              />
              <button
                type="button"
                onClick={() => setChangingCarrier(false)}
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                {t('fms_offers.offerDetail.cancelChange', 'Cancel')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>
                {carrier?.name || t('fms_offers.offerDetail.noCarrier', 'Not specified')}
              </div>
              <button
                type="button"
                onClick={() => setChangingCarrier(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: '#6b7280',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                  padding: '2px 4px',
                }}
                title={t('fms_offers.offerDetail.changeCarrierTitle', 'Change carrier')}
              >
                <Building2 style={{ width: 12, height: 12 }} />
                <Pencil style={{ width: 10, height: 10, opacity: 0.4 }} />
              </button>
            </div>
          )}
        </div>

        {/* ================================================================
            SHIPMENT DETAILS
            ================================================================ */}
        <SectionLabel>{t('fms_offers.offerDetail.shipmentDetails', 'Shipment Details')}</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <FieldCell
            label={t('fms_offers.offerDetail.direction', 'Type')}
            value={findOptionLabel(DIRECTION_OPTIONS, direction ?? null) || t('fms_offers.offerDetail.notSpecified', 'Not specified')}
          />
          <FieldCell
            label={t('fms_offers.offerDetail.transportMode', 'Transport Mode')}
            value={findOptionLabel(TRANSPORT_MODE_OPTIONS, transportMode ?? null) || t('fms_offers.offerDetail.notSpecified', 'Not specified')}
          />
          <FieldCell
            label={t('fms_offers.offerDetail.cargoType', 'Cargo Type')}
            value={findOptionLabel(CARGO_TYPE_OPTIONS, cargoType ?? null) || t('fms_offers.offerDetail.notSpecified', 'Not specified')}
          />
        </div>

        {/* ================================================================
            ROUTE — without Containers field
            ================================================================ */}
        <SectionLabel>{t('fms_offers.offerDetail.route', 'Route')}</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            background: ACCENT_LIGHT,
            borderRadius: '8px',
            padding: '14px 18px',
            marginBottom: '28px',
          }}
        >
          <FieldCell
            label={t('fms_offers.offerDetail.from', 'From')}
            value={origin || t('fms_offers.offerDetail.notSpecified', 'Not specified')}
          />
          <FieldCell
            label={t('fms_offers.offerDetail.to', 'To')}
            value={destination || t('fms_offers.offerDetail.notSpecified', 'Not specified')}
          />
        </div>

        {/* ================================================================
            LINES TABLE — per calculation
            ================================================================ */}
        {offer.calculations.map((calc) => (
          <div key={calc.id} style={{ marginBottom: '8px' }}>
            {offer.calculations.length > 1 && (
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {calc.label || `Calculation #${calc.calculationNumber}`}
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <ThCell align="left">{t('fms_offers.offerDetail.product', 'Description')}</ThCell>
                  {hasContainerType && <ThCell align="left">{t('fms_offers.offerDetail.containerType', 'Container')}</ThCell>}
                  <ThCell align="left">{t('fms_offers.offerDetail.currency', 'Currency')}</ThCell>
                  <ThCell align="right">{t('fms_offers.offerDetail.value', 'Value')}</ThCell>
                </tr>
                <tr>
                  <td colSpan={hasContainerType ? 4 : 3} style={{ padding: 0 }}>
                    <div style={{ height: '2px', background: ACCENT, borderRadius: '1px' }} />
                  </td>
                </tr>
              </thead>
              <tbody>
                {calc.lines.length === 0 ? (
                  <tr>
                    <td colSpan={hasContainerType ? 4 : 3} style={{ padding: '16px 8px', color: '#9ca3af', fontStyle: 'italic', textAlign: 'center' }}>
                      {t('fms_offers.offerDetail.noLines', 'No lines in this calculation')}
                    </td>
                  </tr>
                ) : (
                  calc.lines.map((line) => (
                    <tr key={line.id} style={{ borderBottom: `1px solid ${BORDER_LIGHT}` }}>
                      <TdCell align="left" bold>{line.productName || line.chargeCode || '—'}</TdCell>
                      {hasContainerType && <TdCell align="left">{line.containerType || '—'}</TdCell>}
                      <TdCell align="left">{line.currencyCode}</TdCell>
                      <TdCell align="right" bold>{formatNumber(line.sellPrice)}</TdCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))}

        <hr style={{ border: 'none', borderTop: `1px solid ${BORDER_LIGHT}`, margin: '20px 0' }} />

        {/* ================================================================
            PROJECT Section
            ================================================================ */}
        <SectionLabel>{(offer.projects?.length ?? 0) > 1 ? t('fms_offers.offerDetail.projects', 'Projects') : t('fms_offers.offerDetail.project', 'Project')}</SectionLabel>
        <div
          style={{
            border: `1px solid ${BORDER_LIGHT}`,
            borderRadius: '8px',
            padding: '14px 18px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (offer.projects?.length ?? 0) > 0 ? '10px' : '0' }}>
            {(offer.projects?.length ?? 0) > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {offer.projects?.map((project) => (
                  <div key={project.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FolderOpen style={{ width: 14, height: 14, color: '#6b7280' }} />
                    <a
                      href={`/backend/fms-projects/${project.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '13px', fontWeight: 600, color: ACCENT, textDecoration: 'none' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                    >
                      {project.projectNumber}
                      <ExternalLink style={{ width: 11, height: 11, marginLeft: '4px', display: 'inline' }} />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: '13px', color: '#9ca3af' }}>{t('fms_offers.offerDetail.noProject', 'No project linked yet.')}</span>
            )}
            <Button
              size="sm"
              variant={(offer.projects?.length ?? 0) > 0 ? 'outline' : 'default'}
              onClick={() => setShowConvertDialog(true)}
              style={{ gap: '6px', flexShrink: 0 }}
            >
              <FolderOpen className="h-4 w-4" />
              {(offer.projects?.length ?? 0) > 0
                ? t('fms_offers.offerDetail.createAnotherProject', 'Create Another Project')
                : t('fms_offers.offerDetail.convertToProject', 'Convert to Project')}
            </Button>
          </div>
        </div>

        {/* ================================================================
            TERMS & CONDITIONS
            ================================================================ */}
        <SectionLabel>{t('fms_offers.offerDetail.terms', 'Terms & Conditions')}</SectionLabel>
        <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.8 }}>
          {offer.validUntil && (
            <BulletItem>
              {t('fms_offers.offerDetail.validityNote', 'This offer is valid until')} {formatDate(offer.validUntil)}.
            </BulletItem>
          )}
          {offer.paymentTerms ? (
            <BulletItem>
              {t('fms_offers.offerDetail.paymentTerms', 'Payment terms')}: {offer.paymentTerms}
            </BulletItem>
          ) : (
            <BulletItem>
              {t('fms_offers.offerDetail.paymentTerms', 'Payment terms')}: Net 30 days from invoice date.
            </BulletItem>
          )}
          {offer.specialTerms ? (
            <BulletItem>{offer.specialTerms}</BulletItem>
          ) : (
            <>
              <BulletItem>Rates are subject to availability and may change based on market conditions.</BulletItem>
              <BulletItem>Additional charges may apply for special handling, customs clearance delays, or demurrage.</BulletItem>
              <BulletItem>Shipments are subject to our standard Terms and Conditions available at www.transportsolutions.com/terms</BulletItem>
            </>
          )}
        </div>

        {/* Superseded warning */}
        {offer.supersededById && (
          <div style={{ marginTop: '20px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#7e22ce' }}>
            This offer has been superseded by a newer version.
          </div>
        )}
      </div>

      {/* ================================================================
          BOTTOM BAR — Actions
          ================================================================ */}
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
        {/* Left: Back */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {t('fms_offers.offerDetail.back', 'Back')}
        </Button>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Delete (draft only) */}
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

          {/* Save as PDF */}
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

          {/* Send to Client */}
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
                  border: '1px solid var(--border, #e5e7eb)',
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
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--muted, #f3f4f6)' }}
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

      {/* Send to Client dialog */}
      {offer && (
        <SendOfferDialog
          offerId={offer.id}
          offerNumber={offer.offerNumber}
          clientName={contractor?.name || offer.rfq?.companyName || ''}
          currentStatus={offer.status as FmsOfferStatus}
          sentAt={offer.sentAt}
          sentToEmail={offer.sentToEmail}
          open={showSendDialog}
          onClose={() => setShowSendDialog(false)}
          onSuccess={handleSendSuccess}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Offer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete offer &quot;{offer?.offerNumber}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
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
          clientName={contractor?.name || offer.rfq?.companyName || ''}
          originPortCode={offer.rfq?.origin}
          destinationPortCode={offer.rfq?.destination}
          totalAmount={totalAmount}
          currencyCode={allEnabledLines[0]?.currencyCode || 'USD'}
          convertDialogData={offer.convertDialogData}
          open={showConvertDialog}
          onClose={() => {
            setShowConvertDialog(false)
          }}
        />
      )}

      {/* DatePicker custom styles */}
      <style>{`
        .offer-datepicker {
          border: none !important;
          font-family: inherit;
          background: var(--popover, white);
        }
        .offer-datepicker .react-datepicker__header {
          background: var(--popover, white);
          border-bottom: 1px solid var(--border, #e5e7eb);
          padding-top: 8px;
        }
        .offer-datepicker .react-datepicker__current-month {
          font-size: 14px;
          font-weight: 600;
          color: ${ACCENT};
        }
        .offer-datepicker .react-datepicker__day-name,
        .offer-datepicker .react-datepicker__day {
          width: 32px;
          line-height: 32px;
          margin: 2px;
          font-size: 13px;
          color: var(--foreground, #374151);
        }
        .offer-datepicker .react-datepicker__day:hover {
          background-color: ${ACCENT_LIGHT};
          border-radius: 6px;
        }
        .offer-datepicker .react-datepicker__day--selected,
        .offer-datepicker .react-datepicker__day--keyboard-selected {
          background-color: ${ACCENT} !important;
          color: white !important;
          border-radius: 6px;
        }
        .offer-datepicker .react-datepicker__day--today {
          font-weight: bold;
          background-color: ${ACCENT_LIGHT};
          border-radius: 6px;
        }
        .offer-datepicker .react-datepicker__navigation {
          top: 12px;
        }
        .offer-datepicker .react-datepicker__navigation-icon::before {
          border-color: #6b7280;
        }
        .offer-datepicker .react-datepicker__navigation:hover *::before {
          border-color: ${ACCENT};
        }
      `}</style>
    </div>
  )
}

// ── Primitives ──

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: LABEL_COLOR,
        marginBottom: '10px',
      }}
    >
      {children}
    </div>
  )
}

function FieldCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function ThCell({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '8px 10px 6px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#374151',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

function TdCell({ children, align, bold }: { children: React.ReactNode; align: 'left' | 'right'; bold?: boolean }) {
  return (
    <td
      style={{
        textAlign: align,
        padding: '10px 10px',
        fontWeight: bold ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  )
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{ flexShrink: 0 }}>&bull;</span>
      <span>{children}</span>
    </div>
  )
}
