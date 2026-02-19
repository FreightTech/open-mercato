'use client'

import * as React from 'react'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import {
  Ship,
  MapPin,
  Anchor,
  Calendar,
  Package,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { TimestampEntry } from './CombinedTimestampCell'
import { getCarrierLogo } from '../assets'

// ─── Types ───────────────────────────────────────────────────

interface Coords {
  latitude: number
  longitude: number
}

interface FacilityLocation {
  name: string
  unlocode: string | null
  countryCode: string | null
  facilityCode: string | null
  facilityCodeListProvider: 'BIC' | 'SMDG' | null
  facilityTypeCode: string | null
  address: string | null
  coords: Coords | null
  operatorName: string | null
  source: 'dcsa' | 'bic' | 'manual'
}

interface TrackingEventData {
  id: string
  eventType: string
  eventCode: string
  eventClassifierCode: 'ACT' | 'PLN' | 'EST' | null
  eventDateTime: string
  description?: string | null
  locationName?: string | null
  locationUnlocode?: string | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  equipmentReference?: string | null
  isTransshipmentMove?: boolean | null
  // Facility/terminal details
  facilityCode?: string | null
  facilityCodeListProvider?: 'BIC' | 'SMDG' | null
  facilityTypeCode?: string | null
  facilityAddress?: string | null
  latitude?: number | null
  longitude?: number | null
}

interface ShipmentDetailsData {
  id: string
  status: string
  carrierCode?: string | null
  containerNumber?: string | null
  bookingNumber?: string | null
  bolNumber?: string | null
  etdTimestamps?: TimestampEntry[] | null
  etaTimestamps?: TimestampEntry[] | null
  atdTimestamps?: TimestampEntry[] | null
  ataTimestamps?: TimestampEntry[] | null
  // Location data (JSONB)
  originLocation?: FacilityLocation | null
  destinationLocation?: FacilityLocation | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  // Denormalized route and events (no longer need separate API call)
  routeStops?: RouteStop[] | null
  cargoEvents?: TrackingEventData[] | null
  // Kept for backward compatibility
  trackingJob?: { id: string } | null
}

interface RouteStop {
  location: string
  unlocode?: string
  type: 'origin' | 'transshipment' | 'destination'
  vesselName?: string
  ata?: string | null
  atd?: string | null
  eta?: string | null
  etd?: string | null
  // Facility/terminal details
  facilityCode?: string | null
  facilityCodeListProvider?: 'BIC' | 'SMDG' | null
  facilityTypeCode?: string | null
  facilityAddress?: string | null
  coords?: Coords | null
}

// ─── Helpers ─────────────────────────────────────────────────

function getPrimaryTimestamp(timestamps: TimestampEntry[] | null | undefined): string | null {
  if (!timestamps || timestamps.length === 0) return null
  const latest = timestamps.reduce((best, entry) =>
    entry.updatedAt > best.updatedAt ? entry : best
  )
  return latest.value
}

function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}

/**
 * Calculate transit time in days between departure and arrival.
 * Uses ATD as start, and ATA (if arrived) or ETA (if in transit) as end.
 */
function calculateTransitDays(
  atd: string | null | undefined,
  ata: string | null | undefined,
  eta: string | null | undefined
): number | null {
  const startDate = atd ? new Date(atd) : null
  const endDate = ata ? new Date(ata) : (eta ? new Date(eta) : null)
  if (!startDate || !endDate) return null
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null
  const diffMs = endDate.getTime() - startDate.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Calculate delay in days by comparing the oldest timestamp to the newest.
 * This shows drift over time as estimates get updated.
 * Returns positive for delays (late), negative for ahead of schedule.
 */
function calculateDelayFromHistory(timestamps: TimestampEntry[] | null | undefined): number | null {
  if (!timestamps || timestamps.length < 2) return null
  // Sort by updatedAt to get oldest (original estimate) and newest (latest update)
  const sorted = [...timestamps].sort((a, b) =>
    new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  )
  const oldest = new Date(sorted[0].value)
  const newest = new Date(sorted[sorted.length - 1].value)
  if (Number.isNaN(oldest.getTime()) || Number.isNaN(newest.getTime())) return null
  const diffMs = newest.getTime() - oldest.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  return diffDays !== 0 ? diffDays : null
}

/**
 * Calculate delay by comparing planned (ETD/ETA) to actual (ATD/ATA).
 * Returns positive for delays (late), negative for ahead of schedule.
 */
function calculateDelayFromPlanned(
  planned: string | null | undefined,
  actual: string | null | undefined
): number | null {
  if (!planned || !actual) return null
  const plannedDate = new Date(planned)
  const actualDate = new Date(actual)
  if (Number.isNaN(plannedDate.getTime()) || Number.isNaN(actualDate.getTime())) return null
  const diffMs = actualDate.getTime() - plannedDate.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  return diffDays !== 0 ? diffDays : null
}

// NOTE: getCarrierLogo() is now imported from '../assets' and returns StaticImageData
// for use with next/image component

/**
 * Build carrier tracking URL with optional reference number.
 * Some carriers support direct deep-linking to a specific shipment.
 */
function getCarrierTrackingUrl(
  carrierCode: string | null | undefined,
  reference?: string | null
): string | null {
  if (!carrierCode) return null
  const code = carrierCode.toLowerCase()
  const ref = reference?.trim()

  // Carriers that support direct deep-linking with reference in URL path
  if ((code === 'maeu' || code === 'maersk') && ref) {
    return `https://www.maersk.com/tracking/${encodeURIComponent(ref)}`
  }

  // Fallback to generic tracking pages
  const urls: Record<string, string> = {
    maeu: 'https://www.maersk.com/tracking',
    maersk: 'https://www.maersk.com/tracking',
    mscu: 'https://www.msc.com/track-a-shipment',
    msc: 'https://www.msc.com/track-a-shipment',
    cmdu: 'https://www.cma-cgm.com/ebusiness/tracking',
    'cma-cgm': 'https://www.cma-cgm.com/ebusiness/tracking',
    hlcu: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html',
    'hapag-lloyd': 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html',
    cosu: 'https://elines.coscoshipping.com/ebusiness/cargoTracking',
    cosco: 'https://elines.coscoshipping.com/ebusiness/cargoTracking',
    eglv: 'https://www.evergreen-line.com/trkc/',
    evergreen: 'https://www.evergreen-line.com/trkc/',
    oolu: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking',
    oocl: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking',
    one: 'https://ecomm.one-line.com/ecom/CUP_HOM_3301.do',
    oney: 'https://ecomm.one-line.com/ecom/CUP_HOM_3301.do',
    ymlu: 'https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx',
    'yang-ming': 'https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx',
    zimu: 'https://www.zim.com/tools/track-a-shipment',
    zim: 'https://www.zim.com/tools/track-a-shipment',
  }
  return urls[code] || null
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ARRIVED':
    case 'DELIVERED':
      return 'default'
    case 'IN_TRANSIT':
    case 'DEPARTED':
      return 'secondary'
    case 'PENDING':
    case 'BOOKED':
      return 'outline'
    default:
      return 'outline'
  }
}

// NOTE: extractRouteFromEvents logic has been moved to lib/route-extraction.ts
// and is now executed server-side in TrackingService.deriveShipmentStateFromEvents()
// The computed route is stored as `routeStops` JSONB on the shipment entity.

function getEventIcon(eventCode: string) {
  switch (eventCode) {
    case 'ARRI':
      return Anchor
    case 'DEPA':
      return Ship
    case 'LOAD':
    case 'DISC':
      return Package
    default:
      return Package
  }
}

function getEventLabel(eventCode: string): string {
  const labels: Record<string, string> = {
    ARRI: 'arrival',
    DEPA: 'departure',
    LOAD: 'load',
    DISC: 'discharge',
    GTOT: 'gate out',
    GTIN: 'gate in',
    STUF: 'stuffing',
    STRP: 'stripping',
    PICK: 'pickup',
    DROP: 'drop',
  }
  return labels[eventCode] || eventCode.toLowerCase()
}

// ─── Sub-components ──────────────────────────────────────────

type LucideIcon = typeof Ship

interface CollapsibleSectionProps {
  title: string
  icon: LucideIcon
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2">
          <Icon className="w-4 h-4" />
          <span className="font-medium text-gray-800">{title}</span>
          {count !== undefined && (
            <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs font-medium">
              {count}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

interface ShipmentCardProps {
  shipment: ShipmentDetailsData
}

function ShipmentCard({ shipment }: ShipmentCardProps) {
  const t = useT()
  const carrierLogo = getCarrierLogo(shipment.carrierCode)
  // For deep-linking, prefer BOL > booking > container as reference
  const trackingReference = shipment.bolNumber || shipment.bookingNumber || shipment.containerNumber
  const trackingUrl = getCarrierTrackingUrl(shipment.carrierCode, trackingReference)
  const atdActual = getPrimaryTimestamp(shipment.atdTimestamps)
  const ataActual = getPrimaryTimestamp(shipment.ataTimestamps)
  const etd = getPrimaryTimestamp(shipment.etdTimestamps)
  const eta = getPrimaryTimestamp(shipment.etaTimestamps)
  const atd = atdActual || etd
  const ata = ataActual || eta

  // Calculate transit time
  const transitDays = calculateTransitDays(atdActual || etd, ataActual, eta)

  // Extract location names from JSONB fields
  const originName = shipment.originLocation?.name || shipment.originLocation?.unlocode || '-'
  const destinationName = shipment.destinationLocation?.name || shipment.destinationLocation?.unlocode || '-'
  const originFacilityCode = formatFacilityCode(
    shipment.originLocation?.facilityCode,
    shipment.originLocation?.facilityCodeListProvider
  )
  const destinationFacilityCode = formatFacilityCode(
    shipment.destinationLocation?.facilityCode,
    shipment.destinationLocation?.facilityCodeListProvider
  )

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 relative">
      <div className="space-y-3">
        {/* Header with reference and carrier logo */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {shipment.bolNumber || shipment.bookingNumber || shipment.containerNumber || shipment.id.slice(0, 8)}
            </h2>
            {shipment.containerNumber && (
              <p className="text-sm text-gray-600 font-mono mt-1">{shipment.containerNumber}</p>
            )}
          </div>
        </div>

        {/* Carrier logo */}
        {carrierLogo && (
          <div className="w-12 h-12 flex items-center justify-center absolute top-4 right-4">
            <Image
              src={carrierLogo}
              alt={shipment.carrierCode || 'Carrier'}
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
        )}

        {/* Route: Origin -> Destination */}
        <div className="flex items-center gap-2 text-sm">
          <div className="font-medium text-gray-900">
            <b>{originName}</b>
            {originFacilityCode && (
              <span className="text-xs text-blue-600 ml-1 font-mono">[{originFacilityCode}]</span>
            )}
            {atd && <span className="text-gray-500"> ({formatDateOnly(atd)})</span>}
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />
          <div className="font-medium text-gray-900">
            <b>{destinationName}</b>
            {destinationFacilityCode && (
              <span className="text-xs text-blue-600 ml-1 font-mono">[{destinationFacilityCode}]</span>
            )}
            {ata && <span className="text-gray-500"> ({formatDateOnly(ata)})</span>}
          </div>
        </div>

        {/* Vessel info */}
        {shipment.vesselName && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Ship className="w-4 h-4" />
            <span className="font-medium">{shipment.vesselName}</span>
            {shipment.vesselImo && (
              <>
                <span className="text-gray-400">•</span>
                <span className="font-mono text-xs">IMO: {shipment.vesselImo}</span>
              </>
            )}
          </div>
        )}

        {/* Transit time */}
        {transitDays !== null && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>
              {t('shipment_tracking.details.transitTime', 'Transit time')}: {transitDays} {t('shipment_tracking.details.days', 'days')}
            </span>
          </div>
        )}

        {/* Verify on carrier website */}
        {trackingUrl && (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <span>{t('shipment_tracking.details.verifyOnCarrier', 'Verify on carrier website')}</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  )
}

interface DestinationStatusCardProps {
  shipment: ShipmentDetailsData
}

function DestinationStatusCard({ shipment }: DestinationStatusCardProps) {
  const t = useT()
  const ata = getPrimaryTimestamp(shipment.ataTimestamps)
  const eta = getPrimaryTimestamp(shipment.etaTimestamps)
  const hasArrived = ata !== null

  // Determine status
  let statusLabel = t('shipment_tracking.details.status.enRoute', 'En Route')
  let statusColor = 'bg-yellow-600'
  if (shipment.status === 'ARRIVED' || hasArrived) {
    statusLabel = t('shipment_tracking.details.status.inPort', 'In Port')
    statusColor = 'bg-blue-600'
  } else if (shipment.status === 'DELIVERED') {
    statusLabel = t('shipment_tracking.details.status.delivered', 'Delivered')
    statusColor = 'bg-green-600'
  }

  // Extract location name from JSONB field
  const destLoc = shipment.destinationLocation
  const destinationName = destLoc?.name || destLoc?.unlocode || '-'
  const facilityCode = formatFacilityCode(destLoc?.facilityCode, destLoc?.facilityCodeListProvider)

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-600" />
          {t('shipment_tracking.details.destinationStatus', 'Destination Status')}
        </h3>
        <span className={`${statusColor} text-white px-3 py-1 rounded-full text-xs font-medium`}>
          {statusLabel}
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Anchor className="w-4 h-4 text-gray-500" />
          <span className="font-medium">{destinationName}</span>
          {facilityCode && (
            <span className="text-xs text-blue-600 font-mono">[{facilityCode}]</span>
          )}
        </div>
        {/* Terminal address */}
        {destLoc?.address && (
          <div className="text-xs text-gray-500 ml-6 truncate" title={destLoc.address}>
            {destLoc.address}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Clock className="w-3 h-3" />
          <span>
            {hasArrived
              ? `ATA: ${formatShortDate(ata)}`
              : eta
              ? `ETA: ${formatShortDate(eta)}`
              : '-'}
          </span>
        </div>
      </div>
    </div>
  )
}

interface RouteDetailsProps {
  stops: RouteStop[]
}

/**
 * Get colors based on stop type.
 * Origin = green, Destination = blue, Transshipment = yellow
 */
function getStopColors(type: 'origin' | 'transshipment' | 'destination') {
  switch (type) {
    case 'origin':
      return {
        bg: 'bg-green-100 text-green-700 border-green-300',
        badge: 'bg-green-100 text-green-700',
      }
    case 'destination':
      return {
        bg: 'bg-blue-100 text-blue-700 border-blue-300',
        badge: 'bg-blue-100 text-blue-700',
      }
    case 'transshipment':
    default:
      return {
        bg: 'bg-yellow-100 text-yellow-700 border-yellow-300',
        badge: 'bg-yellow-100 text-yellow-700',
      }
  }
}

/**
 * Formats facility code with provider badge (e.g., "DCT (SMDG)")
 */
function formatFacilityCode(code: string | null | undefined, provider: string | null | undefined): string | null {
  if (!code) return null
  if (provider) return `${code} (${provider})`
  return code
}

function RouteDetails({ stops }: RouteDetailsProps) {
  const t = useT()

  if (stops.length === 0) {
    return null
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        {t('shipment_tracking.details.routeDetails', 'Route Details')}
      </h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[18px] top-8 bottom-8 w-0.5 bg-gray-200" />

        <div className="space-y-0">
          {stops.map((stop, index) => {
            const colors = getStopColors(stop.type)
            const badgeText = stop.type === 'destination'
              ? t('shipment_tracking.details.destination', 'Destination')
              : stop.type === 'transshipment'
              ? t('shipment_tracking.details.transshipment', 'Transshipment')
              : t('shipment_tracking.details.origin', 'Origin')

            // Calculate delays by comparing planned vs actual
            const departureDelay = calculateDelayFromPlanned(stop.etd, stop.atd)
            const arrivalDelay = calculateDelayFromPlanned(stop.eta, stop.ata)

            // Format facility code with provider
            const facilityDisplay = formatFacilityCode(stop.facilityCode, stop.facilityCodeListProvider)

            return (
              <div key={`${stop.unlocode || stop.location}-${index}`} className="relative flex items-start gap-3 py-2">
                <div className={`mt-1 p-2 rounded-full ${colors.bg}`}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-semibold text-gray-900">{stop.location}</div>
                      <div className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${colors.badge}`}>
                        {badgeText}
                      </div>
                    </div>
                    {/* UN/LOCODE and facility code */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      {stop.unlocode && <span className="font-mono">{stop.unlocode}</span>}
                      {facilityDisplay && (
                        <>
                          {stop.unlocode && <span>•</span>}
                          <span className="font-mono text-blue-600" title={t('shipment_tracking.details.terminalCode', 'Terminal Code')}>
                            {facilityDisplay}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Facility address */}
                    {stop.facilityAddress && (
                      <div className="text-xs text-gray-500 mb-1 max-w-[200px] truncate" title={stop.facilityAddress}>
                        {stop.facilityAddress}
                      </div>
                    )}
                    {/* Coordinates */}
                    {stop.coords && (
                      <div className="text-xs text-gray-400 mb-1 font-mono">
                        {stop.coords.latitude.toFixed(4)}, {stop.coords.longitude.toFixed(4)}
                      </div>
                    )}
                    {stop.vesselName && (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Ship className="w-3 h-3" />
                        <span>{stop.vesselName}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm space-y-2 flex-shrink-0">
                    {/* Departure timestamps */}
                    {(stop.atd || stop.etd) && (
                      <div>
                        <div className="text-gray-500 text-xs">{stop.atd ? 'ATD:' : 'ETD:'}</div>
                        <div className="font-medium text-gray-900">{formatShortDate(stop.atd || stop.etd)}</div>
                        {departureDelay !== null && (
                          <div className={`text-xs ${departureDelay > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {departureDelay > 0 ? '+' : ''}{departureDelay} {t('shipment_tracking.details.days', 'days')}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Arrival timestamps */}
                    {(stop.ata || stop.eta) && (
                      <div>
                        <div className="text-gray-500 text-xs">{stop.ata ? 'ATA:' : 'ETA:'}</div>
                        <div className="font-medium text-gray-900">{formatShortDate(stop.ata || stop.eta)}</div>
                        {arrivalDelay !== null && (
                          <div className={`text-xs ${arrivalDelay > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {arrivalDelay > 0 ? '+' : ''}{arrivalDelay} {t('shipment_tracking.details.days', 'days')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface JourneyTimelineProps {
  events: TrackingEventData[]
}

function JourneyTimeline({ events }: JourneyTimelineProps) {
  const t = useT()

  // Sort events by datetime ascending (chronological order - oldest first at top)
  // Use id as secondary sort key for stability when timestamps are equal
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => {
      const timeA = new Date(a.eventDateTime).getTime()
      const timeB = new Date(b.eventDateTime).getTime()
      if (timeA !== timeB) return timeA - timeB
      return a.id.localeCompare(b.id)
    }),
    [events]
  )

  return (
    <CollapsibleSection
      title={t('shipment_tracking.details.journeyTimeline', 'Journey Timeline')}
      icon={Calendar}
      count={events.length}
      defaultOpen={false}
    >
      <div className="p-3">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-4">
            {sortedEvents.map((event) => {
              const Icon = getEventIcon(event.eventCode)
              const isActual = event.eventClassifierCode === 'ACT'
              const borderColor = isActual ? 'border-green-300' : 'border-blue-300'
              const bgColor = isActual
                ? 'bg-green-100 border-green-300 text-green-800'
                : 'bg-blue-100 border-blue-300 text-blue-800'
              const badgeColor = isActual
                ? 'bg-green-200 text-green-800'
                : 'bg-blue-200 text-blue-800'

              return (
                <div key={event.id} className="relative flex items-start gap-4">
                  <div className={`relative z-10 p-2 rounded-full border-2 bg-white ${borderColor}`}>
                    <Icon className={`w-5 h-5 ${isActual ? 'text-green-600' : 'text-blue-600'}`} />
                  </div>
                  <div className={`flex-1 border rounded-lg p-3 ${bgColor}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold capitalize">{getEventLabel(event.eventCode)}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}>
                            {event.eventClassifierCode || 'N/A'}
                          </span>
                        </div>
                        <div className="text-sm font-medium mb-2">
                          {event.locationName || event.locationUnlocode || '-'}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatShortDate(event.eventDateTime)}
                          </div>
                          {event.vesselName && (
                            <div className="flex items-center gap-1">
                              <Ship className="w-3 h-3" />
                              {event.vesselName}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}

interface BookingDetailsProps {
  shipment: ShipmentDetailsData
}

function BookingDetails({ shipment }: BookingDetailsProps) {
  const t = useT()

  return (
    <CollapsibleSection
      title={t('shipment_tracking.details.bookingDetails', 'Booking Details')}
      icon={Package}
      defaultOpen={false}
    >
      <div className="p-3">
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {t('shipment_tracking.shipments.fields.containerNumber', 'Container Number')}
            </span>
            <span className="font-mono text-sm font-semibold text-gray-900">
              {shipment.containerNumber || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {t('shipment_tracking.shipments.fields.bookingNumber', 'Booking Number')}
            </span>
            <span className="font-mono text-sm font-semibold text-gray-900">
              {shipment.bookingNumber || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {t('shipment_tracking.shipments.fields.bolNumber', 'BOL Number')}
            </span>
            <span className="font-mono text-sm font-semibold text-gray-900">
              {shipment.bolNumber || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {t('shipment_tracking.shipments.fields.carrierCode', 'Carrier Code')}
            </span>
            <span className="font-mono text-sm font-semibold text-gray-900">
              {shipment.carrierCode || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {t('shipment_tracking.shipments.fields.status', 'Status')}
            </span>
            <Badge variant={getStatusBadgeVariant(shipment.status)}>
              {shipment.status}
            </Badge>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}

// ─── Main Component ──────────────────────────────────────────

export interface ShipmentDetailsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shipmentId: string | null
}

export function ShipmentDetailsDrawer({
  open,
  onOpenChange,
  shipmentId,
}: ShipmentDetailsDrawerProps) {
  const t = useT()

  // Fetch shipment data
  const { data: shipment, isLoading: isLoadingShipment } = useQuery({
    queryKey: ['shipment_tracking_shipment_details', shipmentId],
    queryFn: async () => {
      if (!shipmentId) return null
      const response = await apiCall<{ items: Record<string, unknown>[] }>(
        `/api/shipment_tracking/shipments?id=${shipmentId}`
      )
      if (!response.ok) throw new Error('Failed to load shipment')
      const items = response.result?.items ?? []
      const item = items.find((i) => i.id === shipmentId) ?? items[0]
      if (!item) return null

      // Normalize API response
      // Handle trackingJob which can be: { id: string }, string (just the ID), or null
      const trackingJobRaw = item.trackingJob ?? item.tracking_job ?? item.trackingJobId ?? item.tracking_job_id
      let trackingJobId: string | null = null
      if (trackingJobRaw) {
        if (typeof trackingJobRaw === 'string') {
          trackingJobId = trackingJobRaw
        } else if (typeof trackingJobRaw === 'object' && 'id' in trackingJobRaw) {
          trackingJobId = (trackingJobRaw as { id: string }).id
        }
      }

      // Parse denormalized route stops
      const routeStopsRaw = item.routeStops ?? item.route_stops
      const routeStops = Array.isArray(routeStopsRaw) ? routeStopsRaw.map((stop: Record<string, unknown>) => ({
        location: stop.location as string,
        unlocode: (stop.unlocode) as string | undefined,
        type: (stop.type ?? 'transshipment') as 'origin' | 'transshipment' | 'destination',
        vesselName: (stop.vesselName ?? stop.vessel_name) as string | undefined,
        ata: (stop.ata) as string | null,
        atd: (stop.atd) as string | null,
        eta: (stop.eta) as string | null,
        etd: (stop.etd) as string | null,
        // Facility/terminal details
        facilityCode: (stop.facilityCode ?? stop.facility_code) as string | null,
        facilityCodeListProvider: (stop.facilityCodeListProvider ?? stop.facility_code_list_provider) as 'BIC' | 'SMDG' | null,
        facilityTypeCode: (stop.facilityTypeCode ?? stop.facility_type_code) as string | null,
        facilityAddress: (stop.facilityAddress ?? stop.facility_address) as string | null,
        coords: stop.coords ? stop.coords as Coords : null,
      })) : null

      // Parse denormalized cargo events
      const cargoEventsRaw = item.cargoEvents ?? item.cargo_events
      const cargoEvents = Array.isArray(cargoEventsRaw) ? cargoEventsRaw.map((evt: Record<string, unknown>) => ({
        id: evt.id as string,
        eventType: (evt.eventType ?? evt.event_type ?? '') as string,
        eventCode: (evt.eventCode ?? evt.event_code ?? '') as string,
        eventClassifierCode: (evt.eventClassifierCode ?? evt.event_classifier_code) as 'ACT' | 'PLN' | 'EST' | null,
        eventDateTime: (evt.eventDateTime ?? evt.event_date_time) as string,
        description: (evt.description) as string | null,
        locationName: (evt.locationName ?? evt.location_name) as string | null,
        locationUnlocode: (evt.locationUnlocode ?? evt.location_unlocode) as string | null,
        vesselName: (evt.vesselName ?? evt.vessel_name) as string | null,
        vesselImo: (evt.vesselImo ?? evt.vessel_imo) as string | null,
        voyageNumber: (evt.voyageNumber ?? evt.voyage_number) as string | null,
        isTransshipmentMove: (evt.isTransshipmentMove ?? evt.is_transshipment_move) as boolean | null,
        // Facility/terminal details
        facilityCode: (evt.facilityCode ?? evt.facility_code) as string | null,
        facilityCodeListProvider: (evt.facilityCodeListProvider ?? evt.facility_code_list_provider) as 'BIC' | 'SMDG' | null,
        facilityTypeCode: (evt.facilityTypeCode ?? evt.facility_type_code) as string | null,
        facilityAddress: (evt.facilityAddress ?? evt.facility_address) as string | null,
        latitude: (evt.latitude) as number | null,
        longitude: (evt.longitude) as number | null,
      })) : null

      // Parse rich location data
      const originLocationRaw = item.originLocation ?? item.origin_location
      const destinationLocationRaw = item.destinationLocation ?? item.destination_location

      return {
        id: item.id as string,
        status: (item.status ?? 'PENDING') as string,
        carrierCode: (item.carrierCode ?? item.carrier_code) as string | null,
        containerNumber: (item.containerNumber ?? item.container_number) as string | null,
        bookingNumber: (item.bookingNumber ?? item.booking_number) as string | null,
        bolNumber: (item.bolNumber ?? item.bol_number) as string | null,
        etdTimestamps: (item.etdTimestamps ?? item.etd_timestamps) as TimestampEntry[] | null,
        etaTimestamps: (item.etaTimestamps ?? item.eta_timestamps) as TimestampEntry[] | null,
        atdTimestamps: (item.atdTimestamps ?? item.atd_timestamps) as TimestampEntry[] | null,
        ataTimestamps: (item.ataTimestamps ?? item.ata_timestamps) as TimestampEntry[] | null,
        originLocation: originLocationRaw as FacilityLocation | null,
        destinationLocation: destinationLocationRaw as FacilityLocation | null,
        vesselName: (item.vesselName ?? item.vessel_name) as string | null,
        vesselImo: (item.vesselImo ?? item.vessel_imo) as string | null,
        voyageNumber: (item.voyageNumber ?? item.voyage_number) as string | null,
        routeStops,
        cargoEvents,
        trackingJob: trackingJobId ? { id: trackingJobId } : null,
      } as ShipmentDetailsData
    },
    enabled: open && !!shipmentId,
  })

  // Use denormalized data directly from shipment - no separate events query needed!
  const routeStops = shipment?.routeStops ?? []
  const events = shipment?.cargoEvents ?? []

  const isLoading = isLoadingShipment

  // Handle keyboard shortcuts
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    },
    [onOpenChange]
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex flex-col p-0 w-full sm:max-w-xl md:max-w-2xl"
        overlayClassName="backdrop-blur-none"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex justify-between px-4 py-6 border-b">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-gray-900">
              {t('shipment_tracking.details.title', 'Shipment Details')}
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <Spinner className="h-6 w-6" />
              <span className="text-sm text-gray-500">
                {t('shipment_tracking.details.loading', 'Loading shipment details...')}
              </span>
            </div>
          ) : !shipment ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-sm text-gray-500">
                {t('shipment_tracking.details.notFound', 'Shipment not found')}
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Shipment Card */}
              <ShipmentCard shipment={shipment} />

              {/* Destination Status */}
              <DestinationStatusCard shipment={shipment} />

              {/* Route Details */}
              {routeStops.length > 0 && <RouteDetails stops={routeStops} />}

              {/* Map placeholder */}
              <div className="relative w-full h-48 border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Ship className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      {t('shipment_tracking.details.mapPlaceholder', 'Map coming soon')}
                    </p>
                  </div>
                </div>
                {/* Vessel position overlay */}
                {shipment.vesselName && (
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <Ship className="w-4 h-4 text-blue-400" />
                      <div>
                        <h2 className="font-semibold text-sm">{shipment.vesselName}</h2>
                        <p className="text-xs text-gray-500">
                          {t('shipment_tracking.details.currentPosition', 'Current position')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Journey Timeline */}
              {events.length > 0 && <JourneyTimeline events={events} />}

              {/* Booking Details */}
              <BookingDetails shipment={shipment} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default ShipmentDetailsDrawer
