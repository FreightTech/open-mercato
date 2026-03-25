'use client'

/**
 * FMS File Shipment Drawer
 *
 * Displays Route Details and Journey Timeline for a tracked container
 * linked to an FMS file unit via trackedShipmentId.
 *
 * Fetches from /api/shipment_tracking/shipments?id=...
 */

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import {
  Ship, MapPin, Anchor, Calendar, Package,
  ChevronDown, ChevronUp, Clock, ArrowRight,
  Warehouse, Truck, Box, Navigation, Radio,
  ExternalLink, RefreshCw, Shield, FileText,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
} from '@open-mercato/ui/primitives/sheet'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'
import { getCurrentVessel } from '../lib/current-vessel'
import { VesselTrackingMap } from './VesselTrackingMap'

// ─── Types ───────────────────────────────────────────────────

interface TimestampEntry {
  value: string
  offset: string | null
  source: string
  updatedAt: string
}

interface FacilityLocation {
  name?: string | null
  unlocode?: string | null
  countryCode?: string | null
  facilityCode?: string | null
  facilityCodeListProvider?: 'BIC' | 'SMDG' | null
  facilityTypeCode?: string | null
  address?: string | null
}

interface RouteStop {
  location: string
  unlocode?: string
  type: 'origin' | 'transshipment' | 'destination'
  vesselName?: string
  vesselImo?: string | null
  ata?: string | null
  atd?: string | null
  eta?: string | null
  etd?: string | null
  facilityCode?: string | null
  facilityCodeListProvider?: 'BIC' | 'SMDG' | null
  facilityTypeCode?: string | null
  facilityAddress?: string | null
}

interface CargoEvent {
  id: string
  eventType: string
  eventCode: string
  eventClassifierCode: 'ACT' | 'PLN' | 'EST' | null
  eventDateTime: string
  locationName?: string | null
  locationUnlocode?: string | null
  vesselName?: string | null
  facilityTypeCode?: string | null
  emptyIndicatorCode?: 'EMPTY' | 'LADEN' | null
}

interface ShipmentData {
  id: string
  status: string
  carrierCode?: string | null
  containerNumber?: string | null
  bookingNumber?: string | null
  isoEquipmentCode?: string | null
  bolNumber?: string | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  etdTimestamps?: TimestampEntry[] | null
  etaTimestamps?: TimestampEntry[] | null
  atdTimestamps?: TimestampEntry[] | null
  ataTimestamps?: TimestampEntry[] | null
  originLocation?: FacilityLocation | null
  destinationLocation?: FacilityLocation | null
  routeStops?: RouteStop[] | null
  cargoEvents?: CargoEvent[] | null
  seals?: { number: string }[] | null
}

export interface FmsFileShipmentDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shipmentId: string | null
}

// ─── Helpers ─────────────────────────────────────────────────

function getPrimaryTimestamp(timestamps: TimestampEntry[] | null | undefined): string | null {
  if (!timestamps || timestamps.length === 0) return null
  return timestamps.reduce((best, e) => e.updatedAt > best.updatedAt ? e : best).value
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

function calculateTransitDays(
  atd: string | null | undefined,
  ata: string | null | undefined,
  eta: string | null | undefined
): number | null {
  const startDate = atd ? new Date(atd) : null
  const endDate = ata ? new Date(ata) : (eta ? new Date(eta) : null)
  if (!startDate || !endDate) return null
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null
  return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
}

function calculateDelayFromHistory(timestamps: TimestampEntry[] | null | undefined): number | null {
  if (!timestamps || timestamps.length < 2) return null
  const sorted = [...timestamps].sort((a, b) =>
    new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  )
  const oldest = new Date(sorted[0].value)
  const newest = new Date(sorted[sorted.length - 1].value)
  if (Number.isNaN(oldest.getTime()) || Number.isNaN(newest.getTime())) return null
  const diffDays = Math.round((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays !== 0 ? diffDays : null
}

function calculateDelayFromPlanned(planned: string | null | undefined, actual: string | null | undefined): number | null {
  if (!planned || !actual) return null
  const diff = new Date(actual).getTime() - new Date(planned).getTime()
  const days = Math.round(diff / (1000 * 60 * 60 * 24))
  return days !== 0 ? days : null
}

function formatFacilityCode(code: string | null | undefined, provider: string | null | undefined): string | null {
  if (!code) return null
  return provider ? `${code} (${provider})` : code
}

function getCarrierLogo(carrierCode: string | null | undefined): string | null {
  if (!carrierCode) return null
  const logos: Record<string, string> = {
    maersk: '/carriers/maersk.png',
    msc: '/carriers/msc.png',
    'cma-cgm': '/carriers/cma-cgm.png',
    'hapag-lloyd': '/carriers/hapag-lloyd.png',
    cosco: '/carriers/cosco.png',
    evergreen: '/carriers/evergreen.png',
    zim: '/carriers/zim.png',
  }
  return logos[carrierCode.toLowerCase()] || null
}

function getCarrierTrackingUrl(carrierCode: string | null | undefined, reference?: string | null): string | null {
  if (!carrierCode) return null
  const code = carrierCode.toLowerCase()
  const ref = reference?.trim()
  if (code === 'maersk' && ref) {
    return `https://www.maersk.com/tracking/${encodeURIComponent(ref)}`
  }
  const urls: Record<string, string> = {
    maersk: 'https://www.maersk.com/tracking',
    msc: 'https://www.msc.com/track-a-shipment',
    'cma-cgm': 'https://www.cma-cgm.com/ebusiness/tracking',
    'hapag-lloyd': 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html',
    cosco: 'https://elines.coscoshipping.com/ebusiness/cargoTracking',
    evergreen: 'https://www.evergreen-line.com/trkc/',
    zim: 'https://www.zim.com/tools/track-a-shipment',
  }
  return urls[code] || null
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'ARRIVED' || status === 'DELIVERED') return 'default'
  if (status === 'IN_TRANSIT' || status === 'DEPARTED') return 'secondary'
  return 'outline'
}

/**
 * Determines facility location type based on facility code and vessel presence.
 * Returns: 'port' | 'inland' | 'unknown'
 */
function getFacilityLocationType(
  facilityTypeCode: string | null | undefined,
  vesselName?: string | null
): 'port' | 'inland' | 'unknown' {
  if (facilityTypeCode === 'POTE') return 'port'
  if (facilityTypeCode === 'DEPO' || facilityTypeCode === 'CLOC') return 'inland'
  if (facilityTypeCode === 'INTE') return vesselName ? 'port' : 'inland'
  return 'unknown'
}

function getStopColors(type: 'origin' | 'transshipment' | 'destination') {
  switch (type) {
    case 'origin':
      return {
        bg: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700',
        badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      }
    case 'destination':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700',
        badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      }
    default:
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700',
        badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      }
  }
}

function getRouteStopIcon(facilityTypeCode: string | null | undefined, vesselName?: string | null, stopType?: 'origin' | 'transshipment' | 'destination') {
  if (facilityTypeCode === 'DEPO' || facilityTypeCode === 'CLOC') return Warehouse
  if (facilityTypeCode === 'POTE') return Anchor
  if (facilityTypeCode === 'INTE') return vesselName ? Anchor : Warehouse
  if (stopType === 'origin' || stopType === 'destination') return Anchor
  return MapPin
}

function getEventIcon(eventCode: string, facilityTypeCode?: string | null, vesselName?: string | null) {
  const locationType = getFacilityLocationType(facilityTypeCode, vesselName)

  if (eventCode === 'GTIN') {
    if (locationType === 'port') return Anchor
    if (locationType === 'inland') return Warehouse
    return MapPin
  }
  if (eventCode === 'GTOT') {
    if (locationType === 'port') return Ship
    if (locationType === 'inland') return Truck
    return MapPin
  }

  switch (eventCode) {
    case 'ARRI':
      if (locationType === 'port') return Anchor
      if (locationType === 'inland') return Warehouse
      return MapPin
    case 'DEPA':
      if (locationType === 'port') return Ship
      if (locationType === 'inland') return Truck
      return MapPin
    case 'LOAD':
    case 'DISC':
      return Package
    case 'PARR':
    case 'TARR':
      return Anchor
    case 'PPRD':
    case 'TPRD':
      return Ship
    case 'PPRA':
    case 'TPRA':
      return Navigation
    case 'WAYR':
      return Radio
    default:
      return Package
  }
}

const EVENT_CODE_LABELS: Record<string, string> = {
  GTOT: 'Gate Out',
  GTIN: 'Gate In',
  LOAD: 'Loaded',
  DISC: 'Discharged',
  DEPA: 'Departed',
  ARRI: 'Arrived',
  AVPU: 'Available for Pickup',
  CUSR: 'Customs Released',
  STUF: 'Stuffed',
  STRP: 'Stripped',
  PARR: 'Port Arrival',
  TARR: 'Terminal Arrival',
  PPRD: 'Port Departure',
  TPRD: 'Terminal Departure',
  PPRA: 'Port Proximity',
  TPRA: 'Terminal Proximity',
  WAYR: 'Waypoint',
}

function getEventLabel(code: string): string {
  return EVENT_CODE_LABELS[code] ?? code.toLowerCase()
}

function getSegmentLineColor(status: 'completed' | 'in-progress' | 'pending') {
  switch (status) {
    case 'completed': return 'bg-green-500 dark:bg-green-400'
    case 'in-progress': return 'bg-blue-500 dark:bg-blue-400'
    default: return 'bg-border'
  }
}

// ─── CollapsibleSection ───────────────────────────────────────

type LucideIcon = typeof Ship

interface CollapsibleSectionProps {
  title: string
  icon: LucideIcon
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, icon: Icon, count, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        type="button"
        className="w-full p-3 flex items-center justify-between text-left hover:bg-muted transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2">
          <Icon className="w-4 h-4" />
          <span className="font-medium text-foreground">{title}</span>
          {count !== undefined && (
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full text-xs font-medium">
              {count}
            </span>
          )}
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {isOpen && <div className="border-t border-border">{children}</div>}
    </div>
  )
}

// ─── ContainerCard ────────────────────────────────────────────

function ContainerCard({ shipment }: { shipment: ShipmentData }) {
  const carrierLogo = getCarrierLogo(shipment.carrierCode)
  const trackingReference = shipment.bolNumber || shipment.bookingNumber || shipment.containerNumber
  const trackingUrl = getCarrierTrackingUrl(shipment.carrierCode, trackingReference)

  const atdActual = getPrimaryTimestamp(shipment.atdTimestamps)
  const ataActual = getPrimaryTimestamp(shipment.ataTimestamps)
  const etd = getPrimaryTimestamp(shipment.etdTimestamps)
  const eta = getPrimaryTimestamp(shipment.etaTimestamps)
  const atd = atdActual || etd
  const ata = ataActual || eta

  const transitDays = calculateTransitDays(atdActual || etd, ataActual, eta)
  const arrivalDelay = calculateDelayFromPlanned(eta, ataActual)

  const originFacilityCode = formatFacilityCode(
    shipment.originLocation?.facilityCode,
    shipment.originLocation?.facilityCodeListProvider,
  )
  const destinationFacilityCode = formatFacilityCode(
    shipment.destinationLocation?.facilityCode,
    shipment.destinationLocation?.facilityCodeListProvider,
  )

  const originName = shipment.originLocation?.name || shipment.originLocation?.unlocode || '-'
  const destName = shipment.destinationLocation?.name || shipment.destinationLocation?.unlocode || '-'

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="space-y-3">
        {/* Header: container number + status + carrier logo */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground font-mono tracking-wider">
              {shipment.containerNumber || 'No Container #'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={getStatusBadgeVariant(shipment.status)}>
                {shipment.status.replace(/_/g, ' ')}
              </Badge>
              {shipment.isoEquipmentCode && (
                <span className="text-sm text-muted-foreground font-mono">{shipment.isoEquipmentCode}</span>
              )}
            </div>
          </div>
          {carrierLogo && (
            <div className="w-12 h-12 flex items-center justify-center">
              <Image src={carrierLogo} alt={shipment.carrierCode || 'Carrier'} width={40} height={40} className="object-contain" />
            </div>
          )}
        </div>

        {/* Route: two-column responsive layout */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
          <div className="flex-1 min-w-0 text-center sm:text-right">
            <div className="font-medium text-foreground"><b>{originName}</b></div>
            <div className="text-xs">
              {originFacilityCode && (
                <span className="text-blue-600 dark:text-blue-400 font-mono">[{originFacilityCode}]</span>
              )}
              {atd && <span className="text-muted-foreground ml-1">({formatDateOnly(atd)})</span>}
            </div>
          </div>
          <div className="flex justify-center sm:self-center">
            <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 rotate-90 sm:rotate-0" />
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="font-medium text-foreground"><b>{destName}</b></div>
            <div className="text-xs">
              {destinationFacilityCode && (
                <span className="text-blue-600 dark:text-blue-400 font-mono">[{destinationFacilityCode}]</span>
              )}
              {ata && <span className="text-muted-foreground ml-1">({formatDateOnly(ata)})</span>}
            </div>
          </div>
        </div>

        {/* Vessel */}
        {shipment.vesselName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Ship className="w-4 h-4" />
            <span className="font-medium">{shipment.vesselName}</span>
            {shipment.vesselImo && <><span className="text-muted-foreground/70">•</span><span className="font-mono text-xs">IMO: {shipment.vesselImo}</span></>}
            {shipment.voyageNumber && <><span className="text-muted-foreground/70">•</span><span className="font-mono text-xs">Voy: {shipment.voyageNumber}</span></>}
          </div>
        )}

        {/* Transit time + delay */}
        <div className="flex items-center gap-4 text-sm">
          {transitDays !== null && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Transit time: {transitDays} days</span>
            </div>
          )}
          {arrivalDelay !== null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              arrivalDelay > 0
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            }`}>
              {arrivalDelay > 0
                ? `+${arrivalDelay} days late`
                : `${Math.abs(arrivalDelay)} days early`}
            </span>
          )}
        </div>

        {/* Verify on carrier website */}
        {trackingUrl && (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <span>Verify on carrier website</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─── DestinationStatusCard ────────────────────────────────────

function DestinationStatusCard({ shipment }: { shipment: ShipmentData }) {
  const ata = getPrimaryTimestamp(shipment.ataTimestamps)
  const eta = getPrimaryTimestamp(shipment.etaTimestamps)
  const hasArrived = ata !== null

  const etaDrift = calculateDelayFromHistory(shipment.etaTimestamps)

  let statusLabel = 'En Route'
  let statusColor = 'bg-yellow-600'
  if (shipment.status === 'ARRIVED' || hasArrived) {
    statusLabel = 'In Port'
    statusColor = 'bg-blue-600'
  } else if (shipment.status === 'DELIVERED') {
    statusLabel = 'Delivered'
    statusColor = 'bg-green-600'
  }

  const destLoc = shipment.destinationLocation
  const destinationName = destLoc?.name || destLoc?.unlocode || '-'
  const facilityCode = formatFacilityCode(destLoc?.facilityCode, destLoc?.facilityCodeListProvider)

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Destination Status
        </h3>
        <div className="flex items-center gap-2">
          {etaDrift !== null && !hasArrived && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              etaDrift > 0
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            }`}>
              {etaDrift > 0 ? `+${etaDrift} days late` : `${Math.abs(etaDrift)} days early`}
            </span>
          )}
          <span className={`${statusColor} text-white px-3 py-1 rounded-full text-xs font-medium`}>
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Anchor className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-foreground">{destinationName}</span>
          {facilityCode && (
            <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">[{facilityCode}]</span>
          )}
        </div>
        {destLoc?.address && (
          <div className="text-xs text-muted-foreground ml-6 truncate" title={destLoc.address}>
            {destLoc.address}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>
            {hasArrived ? `ATA: ${formatShortDate(ata)}` : eta ? `ETA: ${formatShortDate(eta)}` : '-'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── RouteDetails ─────────────────────────────────────────────

function RouteDetails({ stops }: { stops: RouteStop[] }) {
  if (stops.length === 0) return null

  const getSegmentStatus = (cur: RouteStop, next?: RouteStop): 'completed' | 'in-progress' | 'pending' => {
    if (!cur.atd) return 'pending'
    if (next?.ata) return 'completed'
    return 'in-progress'
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        Route Details
      </h3>
      <div className="relative">
        <div className="space-y-0">
          {stops.map((stop, index) => {
            const colors = getStopColors(stop.type)
            const badgeText = stop.type === 'destination' ? 'Destination' : stop.type === 'transshipment' ? 'Transshipment' : 'Origin'
            const departureDelay = calculateDelayFromPlanned(stop.etd, stop.atd)
            const arrivalDelay = calculateDelayFromPlanned(stop.eta, stop.ata)
            const facilityDisplay = formatFacilityCode(stop.facilityCode, stop.facilityCodeListProvider)
            const isLastStop = index === stops.length - 1
            const nextStop = !isLastStop ? stops[index + 1] : undefined
            const segmentStatus = getSegmentStatus(stop, nextStop)
            const StopIcon = getRouteStopIcon(stop.facilityTypeCode, stop.vesselName, stop.type)

            return (
              <div key={`${stop.unlocode || stop.location}-${index}`} className="relative flex items-start gap-3 py-2">
                {!isLastStop && (
                  <div className={`absolute left-[15px] top-[36px] bottom-[-20px] w-0.5 ${getSegmentLineColor(segmentStatus)}`} />
                )}
                <div className={`relative z-10 mt-1 p-2 rounded-full ${colors.bg}`}>
                  <StopIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-semibold text-foreground">{stop.location}</div>
                      <div className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${colors.badge}`}>{badgeText}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      {stop.unlocode && <span className="font-mono">{stop.unlocode}</span>}
                      {facilityDisplay && (
                        <>
                          {stop.unlocode && <span>•</span>}
                          <span className="font-mono text-blue-600 dark:text-blue-400">{facilityDisplay}</span>
                        </>
                      )}
                    </div>
                    {stop.facilityAddress && (
                      <div className="text-xs text-muted-foreground mb-1 max-w-[200px] truncate">{stop.facilityAddress}</div>
                    )}
                    {stop.vesselName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Ship className="w-3 h-3" />
                        <span>{stop.vesselName}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm space-y-2 flex-shrink-0">
                    {(stop.atd || stop.etd) && (
                      <div>
                        <div className="text-muted-foreground text-xs">{stop.atd ? 'ATD:' : 'ETD:'}</div>
                        <div className="font-medium text-foreground">{formatShortDate(stop.atd || stop.etd)}</div>
                        {departureDelay !== null && (
                          <div className={`text-xs ${departureDelay > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {departureDelay > 0 ? '+' : ''}{departureDelay} days
                          </div>
                        )}
                      </div>
                    )}
                    {(stop.ata || stop.eta) && (
                      <div>
                        <div className="text-muted-foreground text-xs">{stop.ata ? 'ATA:' : 'ETA:'}</div>
                        <div className="font-medium text-foreground">{formatShortDate(stop.ata || stop.eta)}</div>
                        {arrivalDelay !== null && (
                          <div className={`text-xs ${arrivalDelay > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {arrivalDelay > 0 ? '+' : ''}{arrivalDelay} days
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

// ─── JourneyTimeline ──────────────────────────────────────────

function JourneyTimeline({ events }: { events: CargoEvent[] }) {
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => {
      const diff = new Date(a.eventDateTime).getTime() - new Date(b.eventDateTime).getTime()
      return diff !== 0 ? diff : a.id.localeCompare(b.id)
    }),
    [events],
  )

  const getSegmentStatus = (cur: CargoEvent, next?: CargoEvent): 'completed' | 'in-progress' | 'pending' => {
    if (cur.eventClassifierCode !== 'ACT') return 'pending'
    if (next?.eventClassifierCode === 'ACT') return 'completed'
    return 'in-progress'
  }

  return (
    <CollapsibleSection title="Journey Timeline" icon={Calendar} count={events.length} defaultOpen={false}>
      <div className="p-3">
        <div className="relative">
          <div className="space-y-4">
            {sortedEvents.map((event, index) => {
              const Icon = getEventIcon(event.eventCode, event.facilityTypeCode, event.vesselName)
              const isActual = event.eventClassifierCode === 'ACT'
              const borderColor = isActual ? 'border-green-300 dark:border-green-700' : 'border-blue-300 dark:border-blue-700'
              const bgColor = isActual
                ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300'
                : 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300'
              const badgeColor = isActual
                ? 'bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-300'
                : 'bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-300'
              const isLast = index === sortedEvents.length - 1
              const next = !isLast ? sortedEvents[index + 1] : undefined
              const segmentStatus = getSegmentStatus(event, next)

              return (
                <div key={event.id} className="relative flex items-start gap-4">
                  {!isLast && (
                    <div className={`absolute left-[19px] top-[40px] bottom-[-36px] w-0.5 ${getSegmentLineColor(segmentStatus)}`} />
                  )}
                  <div className={`relative z-10 p-2 rounded-full border-2 bg-card ${borderColor}`}>
                    <Icon className={`w-5 h-5 ${isActual ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} />
                  </div>
                  <div className={`flex-1 border rounded-lg p-3 ${bgColor}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold">{getEventLabel(event.eventCode)}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}>
                            {event.eventClassifierCode ?? 'N/A'}
                          </span>
                          {event.emptyIndicatorCode && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              event.emptyIndicatorCode === 'LADEN'
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                                : 'bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
                            }`}>
                              {event.emptyIndicatorCode === 'LADEN' ? 'Loaded' : 'Empty'}
                            </span>
                          )}
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

// ─── ContainerDetails ─────────────────────────────────────────

function ContainerDetails({ shipment }: { shipment: ShipmentData }) {
  return (
    <CollapsibleSection title="Container Details" icon={Box} defaultOpen={true}>
      <div className="p-3">
        <div className="bg-muted rounded-lg p-4 space-y-1">
          {[
            ['Container Number', shipment.containerNumber, true],
            ['Size', shipment.isoEquipmentCode, false],
            ['Booking Number', shipment.bookingNumber, true],
            ['B/L Number', shipment.bolNumber, true],
            ['Carrier', shipment.carrierCode, false],
            ['Voyage', shipment.voyageNumber, true],
          ].map(([label, value, mono]) => value && (
            <div key={label as string} className="flex justify-between items-center min-h-[32px]">
              <span className="text-sm text-muted-foreground">{label as string}</span>
              <span className={`text-sm font-semibold text-foreground ${mono ? 'font-mono' : ''}`}>{value as string}</span>
            </div>
          ))}
          {shipment.seals && shipment.seals.length > 0 && (
            <div className="flex justify-between items-center min-h-[32px]">
              <span className="text-sm text-muted-foreground">Seals</span>
              <span className="font-mono text-sm text-foreground">{shipment.seals.map((s) => s.number).join(', ')}</span>
            </div>
          )}
          <div className="flex justify-between items-center min-h-[32px]">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={getStatusBadgeVariant(shipment.status)}>{shipment.status.replace(/_/g, ' ')}</Badge>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function FmsFileShipmentDrawer({ open, onOpenChange, shipmentId }: FmsFileShipmentDrawerProps) {
  const { data: shipment, isLoading } = useQuery({
    queryKey: ['fms-file-shipment-drawer', shipmentId],
    queryFn: async () => {
      if (!shipmentId) return null
      const response = await apiCall<{ items: Record<string, unknown>[] }>(
        `/api/shipment_tracking/shipments?id=${encodeURIComponent(shipmentId)}`
      )
      if (!response.ok) return null
      const items = response.result?.items ?? []
      const item = items.find((i) => i.id === shipmentId) ?? items[0]
      if (!item) return null

      const routeStopsRaw = item.routeStops ?? item.route_stops
      const routeStops = Array.isArray(routeStopsRaw)
        ? (routeStopsRaw as Record<string, unknown>[]).map((stop) => ({
            location: stop.location as string,
            unlocode: stop.unlocode as string | undefined,
            type: (stop.type ?? 'transshipment') as 'origin' | 'transshipment' | 'destination',
            vesselName: (stop.vesselName ?? stop.vessel_name) as string | undefined,
            vesselImo: (stop.vesselImo ?? stop.vessel_imo) as string | null,
            ata: stop.ata as string | null,
            atd: stop.atd as string | null,
            eta: stop.eta as string | null,
            etd: stop.etd as string | null,
            facilityCode: (stop.facilityCode ?? stop.facility_code) as string | null,
            facilityCodeListProvider: (stop.facilityCodeListProvider ?? stop.facility_code_list_provider) as 'BIC' | 'SMDG' | null,
            facilityTypeCode: (stop.facilityTypeCode ?? stop.facility_type_code) as string | null,
            facilityAddress: (stop.facilityAddress ?? stop.facility_address) as string | null,
          }))
        : null

      const cargoEventsRaw = item.cargoEvents ?? item.cargo_events
      const cargoEvents = Array.isArray(cargoEventsRaw)
        ? (cargoEventsRaw as Record<string, unknown>[]).map((evt) => ({
            id: evt.id as string,
            eventType: (evt.eventType ?? evt.event_type ?? '') as string,
            eventCode: (evt.eventCode ?? evt.event_code ?? '') as string,
            eventClassifierCode: (evt.eventClassifierCode ?? evt.event_classifier_code) as 'ACT' | 'PLN' | 'EST' | null,
            eventDateTime: (evt.eventDateTime ?? evt.event_date_time) as string,
            locationName: (evt.locationName ?? evt.location_name) as string | null,
            locationUnlocode: (evt.locationUnlocode ?? evt.location_unlocode) as string | null,
            vesselName: (evt.vesselName ?? evt.vessel_name) as string | null,
            facilityTypeCode: (evt.facilityTypeCode ?? evt.facility_type_code) as string | null,
            emptyIndicatorCode: (evt.emptyIndicatorCode ?? evt.empty_indicator_code) as 'EMPTY' | 'LADEN' | null,
          }))
        : null

      return {
        id: item.id as string,
        status: (item.status ?? 'PENDING') as string,
        carrierCode: (item.carrierCode ?? item.carrier_code) as string | null,
        containerNumber: (item.containerNumber ?? item.container_number) as string | null,
        bookingNumber: (item.bookingNumber ?? item.booking_number) as string | null,
        isoEquipmentCode: (item.isoEquipmentCode ?? item.iso_equipment_code) as string | null,
        bolNumber: (item.bolNumber ?? item.bol_number) as string | null,
        vesselName: (item.vesselName ?? item.vessel_name) as string | null,
        vesselImo: (item.vesselImo ?? item.vessel_imo) as string | null,
        voyageNumber: (item.voyageNumber ?? item.voyage_number) as string | null,
        etdTimestamps: (item.etdTimestamps ?? item.etd_timestamps) as TimestampEntry[] | null,
        etaTimestamps: (item.etaTimestamps ?? item.eta_timestamps) as TimestampEntry[] | null,
        atdTimestamps: (item.atdTimestamps ?? item.atd_timestamps) as TimestampEntry[] | null,
        ataTimestamps: (item.ataTimestamps ?? item.ata_timestamps) as TimestampEntry[] | null,
        originLocation: (item.originLocation ?? item.origin_location) as FacilityLocation | null,
        destinationLocation: (item.destinationLocation ?? item.destination_location) as FacilityLocation | null,
        routeStops,
        cargoEvents,
        seals: (item.seals ?? null) as { number: string }[] | null,
      } satisfies ShipmentData
    },
    enabled: open && !!shipmentId,
  })

  const currentVessel = useMemo(
    () => getCurrentVessel(
      shipment?.routeStops ?? null,
      shipment?.cargoEvents ?? null,
      { vesselName: shipment?.vesselName, vesselImo: shipment?.vesselImo },
    ),
    [shipment?.routeStops, shipment?.cargoEvents, shipment?.vesselName, shipment?.vesselImo],
  )

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onOpenChange(false)
  }, [onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex flex-col p-0 w-full sm:max-w-xl md:max-w-2xl"
        overlayClassName="backdrop-blur-none"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex justify-between px-4 py-6 border-b border-border">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-foreground">Container Details</h1>
            {shipment?.containerNumber && (
              <p className="text-sm font-mono text-muted-foreground">{shipment.containerNumber}</p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <Spinner className="h-6 w-6" />
              <span className="text-sm text-muted-foreground">Loading container details…</span>
            </div>
          ) : !shipment ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-sm text-muted-foreground">No tracking data found</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Container Card */}
              <ContainerCard shipment={shipment} />

              {/* Destination Status */}
              <DestinationStatusCard shipment={shipment} />

              {/* Route Details */}
              {(shipment.routeStops?.length ?? 0) > 0 && (
                <RouteDetails stops={shipment.routeStops!} />
              )}

              {/* Vessel Tracking Map */}
              {currentVessel.status === 'delivered' ? (
                <div className="relative w-full h-32 border border-green-200 dark:border-green-800 rounded-lg overflow-hidden bg-green-50 dark:bg-green-950/30">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Package className="w-8 h-8 text-green-500 dark:text-green-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">Container delivered</p>
                      {currentVessel.currentPort && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">{currentVessel.currentPort}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : currentVessel.vesselImo ? (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <VesselTrackingMap
                    vesselImo={currentVessel.vesselImo}
                    vesselName={currentVessel.vesselName}
                    height="280px"
                    autoRefresh={true}
                    showInfoOverlay={true}
                    containerStatus={currentVessel.status}
                    currentPort={currentVessel.currentPort}
                    isPlannedVessel={currentVessel.isPlannedVessel}
                    currentLeg={currentVessel.currentLeg}
                    traceFrom={currentVessel.traceFrom}
                  />
                </div>
              ) : currentVessel.vesselName ? (
                <div className="relative w-full h-48 border border-border rounded-lg overflow-hidden bg-muted">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Ship className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No vessel data available</p>
                    </div>
                  </div>
                  <div className="absolute top-3 left-3 bg-card/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 border border-border">
                    <div className="flex items-center gap-2">
                      <Ship className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                      <div>
                        <p className="font-semibold text-sm text-foreground">{currentVessel.vesselName}</p>
                        <p className="text-xs text-muted-foreground">IMO number not available</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Container Details */}
              <ContainerDetails shipment={shipment} />

              {/* Journey Timeline */}
              {(shipment.cargoEvents?.length ?? 0) > 0 && (
                <JourneyTimeline events={shipment.cargoEvents!} />
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
