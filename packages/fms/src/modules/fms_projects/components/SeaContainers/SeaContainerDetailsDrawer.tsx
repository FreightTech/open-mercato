'use client'

/**
 * Sea Container Details Drawer
 * 
 * Displays detailed information about a sea container in a slide-out panel.
 * Based on the shipment-tracking module's ShipmentDetailsDrawer.
 * 
 * Features:
 * - Fetches container data via API (list endpoint with ?id= filter)
 * - Shows vessel tracking map with real-time position
 * - Route details, journey timeline, and container info
 */

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  Warehouse,
  Truck,
  Box,
  FileText,
  Shield,
  RefreshCw,
  Navigation,
  Radio,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
} from '@open-mercato/ui/primitives/sheet'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { TimestampEntry } from './CombinedTimestampCell'
import type { ProjectSeaContainer } from '../ProjectWizard/hooks/useProjectWizard'
import { getCurrentVessel, type RouteStopEntry, type CargoEventEntry } from '../../lib/sea-containers/current-vessel'
import { VesselTrackingMap } from './VesselTrackingMap'

// ─── Types ───────────────────────────────────────────────────

interface FacilityLocation {
  name?: string | null
  unlocode?: string | null
  countryCode?: string | null
  facilityCode?: string | null
  facilityCodeListProvider?: 'BIC' | 'SMDG' | null
  facilityTypeCode?: string | null
  address?: string | null
  coords?: { latitude: number; longitude: number } | null
}

// Re-use the RouteStopEntry type from current-vessel but also support local display needs
interface RouteStop extends Omit<RouteStopEntry, 'location' | 'type'> {
  location: string
  type: 'origin' | 'transshipment' | 'destination'
}

// Re-use the CargoEventEntry type from current-vessel but ensure facilityTypeCode is available
interface CargoEvent extends Omit<CargoEventEntry, 'eventClassifierCode'> {
  eventClassifierCode: 'ACT' | 'PLN' | 'EST' | null
  // Ensure facilityTypeCode is available for icon selection (already in CargoEventEntry)
  facilityTypeCode?: string | null
}

// API response structure for list endpoint
interface SeaContainerApiResponse {
  items: Array<{
    id: string
    containerNumber?: string | null
    containerType?: string | null
    sealNumber?: string | null
    status: string
    carrierCode?: string | null
    bookingNumber?: string | null
    bolNumber?: string | null
    vesselName?: string | null
    vesselImo?: string | null
    voyageNumber?: string | null
    originPort?: string | null
    destinationPort?: string | null
    trackedShipmentId?: string | null
    lastSyncedAt?: string | null
    syncStatus?: string | null
    isHazardous?: boolean
    notes?: string | null
    ownershipType?: string | null
    // Timestamp arrays
    etdTimestamps?: TimestampEntry[] | null
    atdTimestamps?: TimestampEntry[] | null
    etaTimestamps?: TimestampEntry[] | null
    ataTimestamps?: TimestampEntry[] | null
    // Extended tracking data
    originLocation?: FacilityLocation | null
    destinationLocation?: FacilityLocation | null
    routeStops?: RouteStop[] | null
    cargoEvents?: CargoEvent[] | null
    eventCount?: number
    lastEventAt?: string | null
    // Additional fields
    customsClearanceStatus?: string | null
    customsClearanceLocation?: string | null
    vgmStatus?: string | null
    vgmWeight?: string | null
    vgmCutoffDate?: string | null
  }>
  total: number
}

// Extended container data with all tracked fields
interface SeaContainerDetailsData extends ProjectSeaContainer {
  originLocation?: FacilityLocation | null
  destinationLocation?: FacilityLocation | null
  routeStops?: RouteStop[] | null
  cargoEvents?: CargoEvent[] | null
  eventCount?: number
  lastEventAt?: string | null
  // Additional fields from FmsSeaContainer entity
  customsClearanceStatus?: string | null
  customsClearanceLocation?: string | null
  vgmStatus?: string | null
  vgmWeight?: string | null
  vgmCutoffDate?: string | null
  // Note: ownershipType is already defined in ProjectSeaContainer as string | null
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

/**
 * Formats facility code with provider badge (e.g., "DCT (SMDG)")
 */
function formatFacilityCode(
  code: string | null | undefined,
  provider: string | null | undefined
): string | null {
  if (!code) return null
  if (provider) return `${code} (${provider})`
  return code
}

function getCarrierLogo(carrierCode: string | null | undefined): string | null {
  if (!carrierCode) return null
  const code = carrierCode.toLowerCase()
  const logos: Record<string, string> = {
    maersk: '/carriers/maersk.png',
    msc: '/carriers/msc.png',
    'cma-cgm': '/carriers/cma-cgm.png',
    'hapag-lloyd': '/carriers/hapag-lloyd.png',
    cosco: '/carriers/cosco.png',
    evergreen: '/carriers/evergreen.png',
    zim: '/carriers/zim.png',
  }
  return logos[code] || null
}

function getCarrierTrackingUrl(
  carrierCode: string | null | undefined,
  reference?: string | null
): string | null {
  if (!carrierCode) return null
  const code = carrierCode.toLowerCase()
  const ref = reference?.trim()

  if ((code === 'maersk') && ref) {
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

// Status labels - these are used with the translation function
const STATUS_KEYS: Record<string, string> = {
  PENDING: 'fms_projects.status.pending',
  BOOKED: 'fms_projects.status.booked',
  DEPARTED: 'fms_projects.status.departed',
  IN_TRANSIT: 'fms_projects.status.inTransit',
  PRE_ARRIVAL: 'fms_projects.status.preArrival',
  ARRIVED: 'fms_projects.status.arrived',
  DELIVERED: 'fms_projects.status.delivered',
  gate_in: 'fms_projects.status.gateIn',
  loaded: 'fms_projects.status.loaded',
  discharged: 'fms_projects.status.discharged',
  gate_out: 'fms_projects.status.gateOut',
  returned: 'fms_projects.status.returned',
}

// Fallback labels (used as second parameter to t())
const STATUS_FALLBACKS: Record<string, string> = {
  PENDING: 'Pending',
  BOOKED: 'Booked',
  DEPARTED: 'Departed',
  IN_TRANSIT: 'In Transit',
  PRE_ARRIVAL: 'Pre-Arrival',
  ARRIVED: 'Arrived',
  DELIVERED: 'Delivered',
  gate_in: 'Gate In',
  loaded: 'Loaded',
  discharged: 'Discharged',
  gate_out: 'Gate Out',
  returned: 'Returned',
}

/**
 * Determines facility location type based on facility code and vessel presence.
 *
 * Facility types (DCSA standard):
 * - POTE = Port Terminal (always port)
 * - INTE = Intermodal Terminal (port if vessel, inland if no vessel)
 * - DEPO = Depot (always inland)
 * - CLOC = Client Location (always inland)
 * - null/undefined = Unknown (use MapPin icon)
 *
 * Returns: 'port' | 'inland' | 'unknown'
 */
function getFacilityLocationType(
  facilityTypeCode: string | null | undefined,
  vesselName?: string | null
): 'port' | 'inland' | 'unknown' {
  // Port terminals are always at ports
  if (facilityTypeCode === 'POTE') {
    return 'port'
  }

  // Depots and client locations are always inland
  if (facilityTypeCode === 'DEPO' || facilityTypeCode === 'CLOC') {
    return 'inland'
  }

  // Intermodal terminals: port if vessel involved, inland otherwise
  if (facilityTypeCode === 'INTE') {
    return vesselName ? 'port' : 'inland'
  }

  // Unknown facility type - use MapPin
  return 'unknown'
}

/**
 * Get the appropriate icon for a route stop based on facility type, vessel, and stop type.
 *
 * Priority order:
 * 1. Explicit facility types (DEPO, CLOC, POTE, INTE) - respect the data
 * 2. Unknown facility type + origin/destination - assume port for sea container tracking
 * 3. Unknown facility type + transshipment - use MapPin
 *
 * This ensures:
 * - Depots/client locations show Warehouse even if they're origin/destination
 * - Ports with missing facilityTypeCode (like NHAVA SHEVA) show Anchor
 * - Intermodal terminals use vessel presence as the deciding factor
 */
function getRouteStopIcon(
  facilityTypeCode: string | null | undefined,
  vesselName?: string | null,
  stopType?: 'origin' | 'transshipment' | 'destination'
) {
  // Explicit depot/client locations are always inland (warehouse icon)
  // Respect the data when we know it's a depot or client location
  if (facilityTypeCode === 'DEPO' || facilityTypeCode === 'CLOC') {
    return Warehouse
  }

  // Port terminals are always ports
  if (facilityTypeCode === 'POTE') {
    return Anchor
  }

  // Intermodal terminals: use vessel presence as signal
  if (facilityTypeCode === 'INTE') {
    return vesselName ? Anchor : Warehouse
  }

  // Unknown facility type (null/undefined):
  // For sea container origin/destination, assume port when we have no other info
  // (this handles cases like NHAVA SHEVA where facilityTypeCode is missing)
  if (stopType === 'origin' || stopType === 'destination') {
    return Anchor
  }

  return MapPin // truly unknown transshipment or no stop type
}

/**
 * Get the appropriate icon for a tracking event based on event code, facility type, and vessel.
 *
 * Icon selection logic:
 * - Port arrivals: Anchor (vessel arriving at port)
 * - Port departures: Ship (vessel departing from port)
 * - Inland arrivals (depot/client/inland intermodal): Warehouse
 * - Inland departures (depot/client/inland intermodal): Truck
 * - Unknown facility arrivals/departures: MapPin (generic location)
 * - Load/Discharge: Package (cargo handling)
 * - Proximity events: Navigation (approaching)
 * - Waypoints: Radio (tracking point)
 */
function getEventIcon(
  eventCode: string,
  facilityTypeCode?: string | null,
  vesselName?: string | null
) {
  const locationType = getFacilityLocationType(facilityTypeCode, vesselName)

  // Gate events
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
    // Standard DCSA events - check facility type for arrivals/departures
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
    // POI/AIS events (always at ports/terminals)
    case 'PARR': // Port Arrival
    case 'TARR': // Terminal Arrival
      return Anchor
    case 'PPRD': // Port Departure
    case 'TPRD': // Terminal Departure
      return Ship
    case 'PPRA': // Port Proximity Arrival
    case 'TPRA': // Terminal Proximity Arrival
      return Navigation
    case 'WAYR': // Waypoint Reached
      return Radio
    default:
      return Package
  }
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
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-border">
          {children}
        </div>
      )}
    </div>
  )
}

interface ContainerCardProps {
  container: SeaContainerDetailsData
}

function ContainerCard({ container }: ContainerCardProps) {
  const t = useT()
  const carrierLogo = getCarrierLogo(container.carrierCode)
  const trackingReference = container.bolNumber || container.bookingNumber || container.containerNumber
  const trackingUrl = getCarrierTrackingUrl(container.carrierCode, trackingReference)
  
  const atdActual = getPrimaryTimestamp(container.atdTimestamps)
  const ataActual = getPrimaryTimestamp(container.ataTimestamps)
  const etd = getPrimaryTimestamp(container.etdTimestamps)
  const eta = getPrimaryTimestamp(container.etaTimestamps)
  const atd = atdActual || etd
  const ata = ataActual || eta

  const transitDays = calculateTransitDays(atdActual || etd, ataActual, eta)

  // Facility codes
  const originFacilityCode = formatFacilityCode(
    container.originLocation?.facilityCode,
    container.originLocation?.facilityCodeListProvider
  )
  const destinationFacilityCode = formatFacilityCode(
    container.destinationLocation?.facilityCode,
    container.destinationLocation?.facilityCodeListProvider
  )

  // Calculate arrival delay (planned vs actual)
  const arrivalDelay = calculateDelayFromPlanned(eta, ataActual)

  const originName = container.originLocation?.name || container.originPort || '-'
  const destinationName = container.destinationLocation?.name || container.destinationPort || '-'

  return (
    <div className="bg-card border border-border rounded-lg p-4 relative">
      <div className="space-y-3">
        {/* Header with container number */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground font-mono tracking-wider">
              {container.containerNumber || t('fms_projects.containerDetails.noContainerNumber', 'No Container #')}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={getStatusBadgeVariant(container.status)}>
                {t(STATUS_KEYS[container.status] || container.status, STATUS_FALLBACKS[container.status] || container.status)}
              </Badge>
              {container.containerType && (
                <span className="text-sm text-muted-foreground font-mono">
                  {container.containerType}
                </span>
              )}
            </div>
          </div>
          {/* Carrier logo */}
          {carrierLogo && (
            <div className="w-12 h-12 flex items-center justify-center">
              <Image
                src={carrierLogo}
                alt={container.carrierCode || 'Carrier'}
                width={40}
                height={40}
                className="object-contain"
              />
            </div>
          )}
        </div>

        {/* Route: Origin -> Destination - Two-line layout */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
          {/* Origin column - aligned to the right (towards arrow) */}
          <div className="flex-1 min-w-0 text-center sm:text-right">
            <div className="font-medium text-foreground">
              <b>{originName}</b>
            </div>
            <div className="text-xs">
              {originFacilityCode && (
                <span className="text-blue-600 dark:text-blue-400 font-mono">[{originFacilityCode}]</span>
              )}
              {atd && <span className="text-muted-foreground ml-1">({formatDateOnly(atd)})</span>}
            </div>
          </div>
          
          {/* Arrow - centered vertically on desktop, rotated 90° on mobile */}
          <div className="flex justify-center sm:self-center">
            <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 rotate-90 sm:rotate-0" />
          </div>
          
          {/* Destination column - aligned to the left (towards arrow) */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="font-medium text-foreground">
              <b>{destinationName}</b>
            </div>
            <div className="text-xs">
              {destinationFacilityCode && (
                <span className="text-blue-600 dark:text-blue-400 font-mono">[{destinationFacilityCode}]</span>
              )}
              {ata && <span className="text-muted-foreground ml-1">({formatDateOnly(ata)})</span>}
            </div>
          </div>
        </div>

        {/* Vessel info */}
        {container.vesselName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Ship className="w-4 h-4" />
            <span className="font-medium">{container.vesselName}</span>
            {container.vesselImo && (
              <>
                <span className="text-muted-foreground/70">•</span>
                <span className="font-mono text-xs">IMO: {container.vesselImo}</span>
              </>
            )}
            {container.voyageNumber && (
              <>
                <span className="text-muted-foreground/70">•</span>
                <span className="font-mono text-xs">{t('fms_projects.containerDetails.voyage', 'Voy')}: {container.voyageNumber}</span>
              </>
            )}
          </div>
        )}

        {/* Transit time and delay */}
        <div className="flex items-center gap-4 text-sm">
          {transitDays !== null && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{t('fms_projects.containerDetails.transitTime', 'Transit time')}: {transitDays} {t('fms_projects.containerDetails.days', 'days')}</span>
            </div>
          )}
          {arrivalDelay !== null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              arrivalDelay > 0 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            }`}>
              {arrivalDelay > 0 
                ? `+${arrivalDelay} ${t('fms_projects.containerDetails.daysLate', 'days late')}`
                : `${Math.abs(arrivalDelay)} ${t('fms_projects.containerDetails.daysEarly', 'days early')}`
              }
            </span>
          )}
        </div>

        {/* Tracking sync info */}
        {container.trackedShipmentId && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <RefreshCw className="w-4 h-4" />
            <span>
              {t('fms_projects.containerDetails.trackingSynced', 'Tracking synced')}
              {container.lastSyncedAt && (
                <span className="text-muted-foreground ml-1">
                  ({formatShortDate(container.lastSyncedAt)})
                </span>
              )}
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
            <span>{t('fms_projects.containerDetails.verifyOnCarrier', 'Verify on carrier website')}</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  )
}

interface DestinationStatusCardProps {
  container: SeaContainerDetailsData
}

function DestinationStatusCard({ container }: DestinationStatusCardProps) {
  const t = useT()
  const ata = getPrimaryTimestamp(container.ataTimestamps)
  const eta = getPrimaryTimestamp(container.etaTimestamps)
  const hasArrived = ata !== null

  // Calculate ETA drift from history (how much has ETA moved over time)
  const etaDrift = calculateDelayFromHistory(container.etaTimestamps)

  let statusLabel = t('fms_projects.destinationStatus.enRoute', 'En Route')
  let statusColor = 'bg-yellow-600'
  if (container.status === 'ARRIVED' || hasArrived) {
    statusLabel = t('fms_projects.destinationStatus.inPort', 'In Port')
    statusColor = 'bg-blue-600'
  } else if (container.status === 'DELIVERED') {
    statusLabel = t('fms_projects.destinationStatus.delivered', 'Delivered')
    statusColor = 'bg-green-600'
  }

  const destLoc = container.destinationLocation
  const destinationName = destLoc?.name || container.destinationPort || '-'
  const facilityCode = formatFacilityCode(destLoc?.facilityCode, destLoc?.facilityCodeListProvider)

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          {t('fms_projects.destinationStatus.title', 'Destination Status')}
        </h3>
        <div className="flex items-center gap-2">
          {/* ETA drift badge */}
          {etaDrift !== null && !hasArrived && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              etaDrift > 0 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            }`}>
              {etaDrift > 0 
                ? `+${etaDrift} ${t('fms_projects.containerDetails.daysLate', 'days late')}`
                : `${Math.abs(etaDrift)} ${t('fms_projects.containerDetails.daysEarly', 'days early')}`
              }
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
        {/* Terminal address */}
        {destLoc?.address && (
          <div className="text-xs text-muted-foreground ml-6 truncate" title={destLoc.address}>
            {destLoc.address}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
    case 'transshipment':
    default:
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700',
        badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      }
  }
}

function RouteDetails({ stops }: RouteDetailsProps) {
  const t = useT()

  if (stops.length === 0) {
    return null
  }

  const getSegmentStatus = (currentStop: RouteStop, nextStop: RouteStop | undefined): 'completed' | 'in-progress' | 'pending' => {
    if (!currentStop.atd) return 'pending'
    if (nextStop?.ata) return 'completed'
    return 'in-progress'
  }

  const getSegmentLineColor = (status: 'completed' | 'in-progress' | 'pending') => {
    switch (status) {
      case 'completed':
        return 'bg-green-500 dark:bg-green-400'
      case 'in-progress':
        return 'bg-blue-500 dark:bg-blue-400'
      default:
        return 'bg-border'
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        {t('fms_projects.routeDetails.title', 'Route Details')}
      </h3>
      <div className="relative">
        <div className="space-y-0">
          {stops.map((stop, index) => {
            const colors = getStopColors(stop.type)
            const badgeText = stop.type === 'destination'
              ? t('fms_projects.routeDetails.destination', 'Destination')
              : stop.type === 'transshipment'
              ? t('fms_projects.routeDetails.transshipment', 'Transshipment')
              : t('fms_projects.routeDetails.origin', 'Origin')

            const isLastStop = index === stops.length - 1
            const nextStop = !isLastStop ? stops[index + 1] : undefined
            const segmentStatus = getSegmentStatus(stop, nextStop)

            // Get contextual icon based on facility type and stop type
            const StopIcon = getRouteStopIcon(stop.facilityTypeCode, stop.vesselName, stop.type)

            // Format facility code with provider
            const facilityDisplay = formatFacilityCode(stop.facilityCode, stop.facilityCodeListProvider)

            // Calculate delays
            const departureDelay = calculateDelayFromPlanned(stop.etd, stop.atd)
            const arrivalDelay = calculateDelayFromPlanned(stop.eta, stop.ata)

            return (
              <div key={`${stop.unlocode || stop.location}-${index}`} className="relative flex items-start gap-3 py-2">
                {!isLastStop && (
                  <div
                    className={`absolute left-[15px] top-[36px] bottom-[-20px] w-0.5 ${getSegmentLineColor(segmentStatus)}`}
                  />
                )}
                <div className={`relative z-10 mt-1 p-2 rounded-full ${colors.bg}`}>
                  <StopIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-semibold text-foreground">{stop.location}</div>
                      <div className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${colors.badge}`}>
                        {badgeText}
                      </div>
                    </div>
                    {/* UN/LOCODE and facility code */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      {stop.unlocode && <span className="font-mono">{stop.unlocode}</span>}
                      {facilityDisplay && (
                        <>
                          {stop.unlocode && <span>•</span>}
                          <span className="font-mono text-blue-600 dark:text-blue-400" title={t('fms_projects.routeDetails.terminalCode', 'Terminal Code')}>
                            {facilityDisplay}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Facility address */}
                    {stop.facilityAddress && (
                      <div className="text-xs text-muted-foreground mb-1 max-w-[200px] truncate" title={stop.facilityAddress}>
                        {stop.facilityAddress}
                      </div>
                    )}
                    {/* Coordinates */}
                    {stop.coords && (
                      <div className="text-xs text-muted-foreground/70 mb-1 font-mono">
                        {stop.coords.latitude.toFixed(4)}, {stop.coords.longitude.toFixed(4)}
                      </div>
                    )}
                    {stop.vesselName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Ship className="w-3 h-3" />
                        <span>{stop.vesselName}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm space-y-2 flex-shrink-0">
                    {/* Departure timestamps */}
                    {(stop.atd || stop.etd) && (
                      <div>
                        <div className="text-muted-foreground text-xs">{stop.atd ? 'ATD:' : 'ETD:'}</div>
                        <div className="font-medium text-foreground">{formatShortDate(stop.atd || stop.etd)}</div>
                        {departureDelay !== null && (
                          <div className={`text-xs ${departureDelay > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {departureDelay > 0 ? '+' : ''}{departureDelay} {t('fms_projects.containerDetails.days', 'days')}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Arrival timestamps */}
                    {(stop.ata || stop.eta) && (
                      <div>
                        <div className="text-muted-foreground text-xs">{stop.ata ? 'ATA:' : 'ETA:'}</div>
                        <div className="font-medium text-foreground">{formatShortDate(stop.ata || stop.eta)}</div>
                        {arrivalDelay !== null && (
                          <div className={`text-xs ${arrivalDelay > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {arrivalDelay > 0 ? '+' : ''}{arrivalDelay} {t('fms_projects.containerDetails.days', 'days')}
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

interface ContainerDetailsProps {
  container: SeaContainerDetailsData
  onUpdate?: (field: string, value: unknown) => void
}

function InlineEditField({
  label,
  value,
  field,
  onSave,
  mono,
  placeholder,
}: {
  label: string
  value: string | null | undefined
  field: string
  onSave?: (field: string, value: string) => void
  mono?: boolean
  placeholder?: string
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value || '')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleStartEdit = React.useCallback(() => {
    if (!onSave) return
    setDraft(value || '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [onSave, value])

  const handleSave = React.useCallback(() => {
    setEditing(false)
    if (draft !== (value || '')) {
      onSave?.(field, draft)
    }
  }, [draft, value, field, onSave])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') setEditing(false)
  }, [handleSave])

  return (
    <div className="flex justify-between items-center group min-h-[32px]">
      <span className="text-sm text-muted-foreground">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={`text-sm font-semibold text-foreground bg-background border border-border rounded px-2 py-0.5 text-right w-48 outline-none focus:ring-1 focus:ring-primary ${mono ? 'font-mono' : ''}`}
          placeholder={placeholder}
        />
      ) : (
        <span
          onClick={handleStartEdit}
          className={`text-sm font-semibold text-foreground ${mono ? 'font-mono' : ''} ${onSave ? 'cursor-pointer hover:bg-accent/50 rounded px-2 py-0.5 -mr-2 transition-colors' : ''}`}
        >
          {value || <span className="text-muted-foreground/50">{placeholder || 'N/A'}</span>}
        </span>
      )}
    </div>
  )
}

function InlineSelectField({
  label,
  value,
  field,
  options,
  onSave,
}: {
  label: string
  value: string | null | undefined
  field: string
  options: { value: string; label: string }[]
  onSave?: (field: string, value: string) => void
}) {
  return (
    <div className="flex justify-between items-center min-h-[32px]">
      <span className="text-sm text-muted-foreground">{label}</span>
      {onSave ? (
        <select
          value={value || ''}
          onChange={(e) => onSave(field, e.target.value)}
          className="text-sm font-semibold text-foreground bg-background border border-border rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <span className="text-sm font-semibold text-foreground">
          {options.find((o) => o.value === value)?.label || value || 'N/A'}
        </span>
      )}
    </div>
  )
}

function ContainerDetails({ container, onUpdate }: ContainerDetailsProps) {
  const t = useT()

  const handleSave = React.useCallback((field: string, value: unknown) => {
    onUpdate?.(field, value)
  }, [onUpdate])

  const ownershipOptions = [
    { value: 'coc', label: t('fms_projects.containerDetails.ownershipCoc', 'COC (Carrier Owned)') },
    { value: 'soc', label: t('fms_projects.containerDetails.ownershipSoc', 'SOC (Shipper Owned)') },
  ]

  return (
    <CollapsibleSection
      title={t('fms_projects.containerDetails.title', 'Container Details')}
      icon={Box}
      defaultOpen={true}
    >
      <div className="p-3">
        <div className="bg-muted rounded-lg p-4 space-y-1">
          <InlineEditField
            label={t('fms_projects.containerDetails.containerNumber', 'Container Number')}
            value={container.containerNumber}
            field="containerNumber"
            onSave={onUpdate ? handleSave : undefined}
            mono
          />
          <InlineSelectField
            label={t('fms_projects.containerDetails.containerType', 'Container Type')}
            value={container.containerType}
            field="containerType"
            options={['20GP','40GP','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR'].map(v => ({ value: v, label: v }))}
            onSave={onUpdate ? handleSave : undefined}
          />
          <InlineEditField
            label={t('fms_projects.containerDetails.sealNumber', 'Seal Number')}
            value={container.sealNumber}
            field="sealNumber"
            onSave={onUpdate ? handleSave : undefined}
            mono
          />
          <InlineSelectField
            label={t('fms_projects.containerDetails.ownership', 'Ownership')}
            value={container.ownershipType}
            field="ownershipType"
            options={ownershipOptions}
            onSave={onUpdate ? handleSave : undefined}
          />
          <InlineEditField
            label={t('fms_projects.containerDetails.bookingNumber', 'Booking Number')}
            value={container.bookingNumber}
            field="bookingNumber"
            onSave={onUpdate ? handleSave : undefined}
            mono
          />
          <InlineEditField
            label={t('fms_projects.containerDetails.blNumber', 'B/L Number')}
            value={container.bolNumber}
            field="bolNumber"
            onSave={onUpdate ? handleSave : undefined}
            mono
          />
          <InlineEditField
            label={t('fms_projects.containerDetails.carrier', 'Carrier')}
            value={container.carrierCode}
            field="carrierCode"
            onSave={onUpdate ? handleSave : undefined}
          />
          <div className="flex justify-between items-center min-h-[32px]">
            <span className="text-sm text-muted-foreground">{t('fms_projects.containerDetails.status', 'Status')}</span>
            <Badge variant={getStatusBadgeVariant(container.status)}>
              {t(STATUS_KEYS[container.status] || container.status, STATUS_FALLBACKS[container.status] || container.status)}
            </Badge>
          </div>
          {container.isHazardous && (
            <div className="flex justify-between items-center min-h-[32px]">
              <span className="text-sm text-muted-foreground">{t('fms_projects.containerDetails.hazardous', 'Hazardous')}</span>
              <Badge variant="destructive">{t('fms_projects.containerDetails.hazardousYes', 'Yes - DGR')}</Badge>
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  )
}

interface CustomsVgmDetailsProps {
  container: SeaContainerDetailsData
}

function CustomsVgmDetails({ container }: CustomsVgmDetailsProps) {
  const t = useT()
  const hasCustomsData = container.customsClearanceStatus
  const hasVgmData = container.vgmStatus || container.vgmWeight

  if (!hasCustomsData && !hasVgmData) {
    return null
  }

  const getCustomsStatusLabel = (status: string | null | undefined) => {
    if (status === 'cleared') return t('fms_projects.customs.cleared', 'Cleared')
    if (status === 'in_progress') return t('fms_projects.customs.inProgress', 'In Progress')
    return t('fms_projects.customs.pending', 'Pending')
  }

  const getVgmStatusLabel = (status: string | null | undefined) => {
    if (status === 'verified') return t('fms_projects.vgm.verified', 'Verified')
    if (status === 'submitted') return t('fms_projects.vgm.submitted', 'Submitted')
    return t('fms_projects.vgm.pending', 'Pending')
  }

  return (
    <CollapsibleSection
      title={t('fms_projects.customs.title', 'Customs & VGM')}
      icon={Shield}
      defaultOpen={false}
    >
      <div className="p-3 space-y-4">
        {/* Customs */}
        {hasCustomsData && (
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-medium text-foreground mb-2">{t('fms_projects.customs.customsClearance', 'Customs Clearance')}</h4>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('fms_projects.customs.status', 'Status')}</span>
              <Badge variant={container.customsClearanceStatus === 'cleared' ? 'default' : 'outline'}>
                {getCustomsStatusLabel(container.customsClearanceStatus)}
              </Badge>
            </div>
            {container.customsClearanceLocation && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('fms_projects.customs.location', 'Location')}</span>
                <span className="text-sm font-semibold text-foreground">
                  {container.customsClearanceLocation}
                </span>
              </div>
            )}
          </div>
        )}

        {/* VGM */}
        {hasVgmData && (
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-medium text-foreground mb-2">{t('fms_projects.vgm.title', 'VGM (Verified Gross Mass)')}</h4>
            {container.vgmStatus && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('fms_projects.vgm.status', 'Status')}</span>
                <Badge variant={container.vgmStatus === 'verified' ? 'default' : 'outline'}>
                  {getVgmStatusLabel(container.vgmStatus)}
                </Badge>
              </div>
            )}
            {container.vgmWeight && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('fms_projects.vgm.weight', 'Weight')}</span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {container.vgmWeight} kg
                </span>
              </div>
            )}
            {container.vgmCutoffDate && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('fms_projects.vgm.cutoffDate', 'Cutoff Date')}</span>
                <span className="text-sm font-semibold text-foreground">
                  {formatDateOnly(container.vgmCutoffDate)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

interface JourneyTimelineProps {
  events: CargoEvent[]
}

function JourneyTimeline({ events }: JourneyTimelineProps) {
  const t = useT()
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
      title={t('fms_projects.journey.title', 'Journey Timeline')}
      icon={Calendar}
      count={events.length}
      defaultOpen={false}
    >
      <div className="p-3">
        <div className="relative">
          <div className="space-y-4">
            {sortedEvents.map((event, index) => {
              // Get contextual icon based on event code, facility type, and vessel
              const Icon = getEventIcon(event.eventCode, event.facilityTypeCode, event.vesselName)
              const isActual = event.eventClassifierCode === 'ACT'
              const borderColor = isActual ? 'border-green-300 dark:border-green-700' : 'border-blue-300 dark:border-blue-700'
              const bgColor = isActual
                ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300'
                : 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300'
              const badgeColor = isActual
                ? 'bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-300'
                : 'bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-300'

              const isLastEvent = index === sortedEvents.length - 1

              return (
                <div key={event.id} className="relative flex items-start gap-4">
                  {!isLastEvent && (
                    <div className="absolute left-[19px] top-[40px] bottom-[-16px] w-0.5 bg-border" />
                  )}
                  <div className={`relative z-10 p-2 rounded-full border-2 bg-card ${borderColor}`}>
                    <Icon className={`w-5 h-5 ${isActual ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} />
                  </div>
                  <div className={`flex-1 border rounded-lg p-3 ${bgColor}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{event.eventCode}</span>
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

// ─── Main Component ──────────────────────────────────────────

export interface SeaContainerDetailsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Container ID to fetch - uses list endpoint with ?id= filter */
  containerId: string | null
  /** Project ID for the API path */
  projectId: string
  /** Callback to update a field on the container */
  onUpdate?: (containerId: string, field: string, value: unknown) => void
}

export function SeaContainerDetailsDrawer({
  open,
  onOpenChange,
  containerId,
  projectId,
  onUpdate,
}: SeaContainerDetailsDrawerProps) {
  const t = useT()
  const queryClient = useQueryClient()

  // Wrap onUpdate to also invalidate the drawer's query cache
  const handleFieldUpdate = React.useCallback((cId: string, field: string, value: unknown) => {
    onUpdate?.(cId, field, value)
    // Invalidate after a short delay to let the API update complete
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['sea-container-details', projectId, cId] })
    }, 300)
  }, [onUpdate, queryClient, projectId])

  // Fetch container data via list endpoint with ?id= filter
  // Following the same pattern as ShipmentDetailsDrawer in shipment-tracking module
  const { data: containerData, isLoading, error } = useQuery({
    queryKey: ['sea-container-details', projectId, containerId],
    queryFn: async () => {
      if (!containerId) return null
      const response = await apiCall<{ items: Record<string, unknown>[] }>(
        `/api/fms_projects/projects/${projectId}/sea-containers?id=${encodeURIComponent(containerId)}`
      )
      if (!response.ok) throw new Error('Failed to fetch container details')
      
      const items = response.result?.items ?? []
      const item = items.find((i) => i.id === containerId) ?? items[0]
      if (!item) return null

      // Parse denormalized route stops (JSONB field may be camelCase or snake_case)
      const routeStopsRaw = item.routeStops ?? item.route_stops
      const routeStops = Array.isArray(routeStopsRaw) ? routeStopsRaw.map((stop: Record<string, unknown>) => ({
        location: stop.location as string,
        unlocode: (stop.unlocode) as string | undefined,
        type: (stop.type ?? 'transshipment') as 'origin' | 'transshipment' | 'destination',
        vesselName: (stop.vesselName ?? stop.vessel_name) as string | undefined,
        vesselImo: (stop.vesselImo ?? stop.vessel_imo) as string | null,
        ata: (stop.ata) as string | null,
        atd: (stop.atd) as string | null,
        eta: (stop.eta) as string | null,
        etd: (stop.etd) as string | null,
        facilityCode: (stop.facilityCode ?? stop.facility_code) as string | null,
        facilityCodeListProvider: (stop.facilityCodeListProvider ?? stop.facility_code_list_provider) as 'BIC' | 'SMDG' | null,
        facilityTypeCode: (stop.facilityTypeCode ?? stop.facility_type_code) as string | null,
        facilityAddress: (stop.facilityAddress ?? stop.facility_address) as string | null,
        coords: stop.coords ? stop.coords as { latitude: number; longitude: number } : null,
      })) : null

      // Parse denormalized cargo events (JSONB field)
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
        // Facility type for contextual icon selection
        facilityTypeCode: (evt.facilityTypeCode ?? evt.facility_type_code) as string | null,
      })) : null

      // Parse rich location data (JSONB)
      const originLocationRaw = item.originLocation ?? item.origin_location
      const destinationLocationRaw = item.destinationLocation ?? item.destination_location

      return {
        id: item.id as string,
        status: (item.status ?? 'PENDING') as string,
        carrierCode: (item.carrierCode ?? item.carrier_code) as string | null,
        containerNumber: (item.containerNumber ?? item.container_number) as string | null,
        containerType: (item.containerType ?? item.container_type) as string | null,
        sealNumber: (item.sealNumber ?? item.seal_number) as string | null,
        bookingNumber: (item.bookingNumber ?? item.booking_number) as string | null,
        bolNumber: (item.bolNumber ?? item.bol_number) as string | null,
        vesselName: (item.vesselName ?? item.vessel_name) as string | null,
        vesselImo: (item.vesselImo ?? item.vessel_imo) as string | null,
        voyageNumber: (item.voyageNumber ?? item.voyage_number) as string | null,
        originPort: (item.originPort ?? item.origin_port ?? (originLocationRaw as FacilityLocation | null)?.name) as string | null,
        destinationPort: (item.destinationPort ?? item.destination_port ?? (destinationLocationRaw as FacilityLocation | null)?.name) as string | null,
        trackedShipmentId: (item.trackedShipmentId ?? item.tracked_shipment_id) as string | null,
        lastSyncedAt: (item.lastSyncedAt ?? item.last_synced_at) as string | null,
        syncStatus: (item.syncStatus ?? item.sync_status) as string | null,
        isHazardous: (item.isHazardous ?? item.is_hazardous ?? false) as boolean,
        notes: (item.notes) as string | null,
        ownershipType: (item.ownershipType ?? item.ownership_type) as string | null,
        // Timestamp arrays
        etdTimestamps: (item.etdTimestamps ?? item.etd_timestamps) as TimestampEntry[] | null,
        atdTimestamps: (item.atdTimestamps ?? item.atd_timestamps) as TimestampEntry[] | null,
        etaTimestamps: (item.etaTimestamps ?? item.eta_timestamps) as TimestampEntry[] | null,
        ataTimestamps: (item.ataTimestamps ?? item.ata_timestamps) as TimestampEntry[] | null,
        // Extended tracking data
        originLocation: originLocationRaw as FacilityLocation | null,
        destinationLocation: destinationLocationRaw as FacilityLocation | null,
        routeStops,
        cargoEvents,
        eventCount: (item.eventCount ?? item.event_count) as number | undefined,
        lastEventAt: (item.lastEventAt ?? item.last_event_at) as string | null,
        // Additional fields
        customsClearanceStatus: (item.customsClearanceStatus ?? item.customs_clearance_status) as string | null,
        customsClearanceLocation: (item.customsClearanceLocation ?? item.customs_clearance_location) as string | null,
        vgmStatus: (item.vgmStatus ?? item.vgm_status) as string | null,
        vgmWeight: (item.vgmWeight ?? item.vgm_weight) as string | null,
        vgmCutoffDate: (item.vgmCutoffDate ?? item.vgm_cutoff_date) as string | null,
      } as SeaContainerApiResponse['items'][0]
    },
    enabled: open && !!containerId && !!projectId,
    staleTime: 30_000, // 30 seconds
  })

  // Helper to get primary timestamp from array
  const getPrimaryFromArray = (timestamps: TimestampEntry[] | null | undefined): string | null => {
    if (!timestamps || timestamps.length === 0) return null
    const latest = timestamps.reduce((best, entry) =>
      entry.updatedAt > best.updatedAt ? entry : best
    )
    return latest.value
  }

  // Build full container data with proper types
  const fullContainer: SeaContainerDetailsData | null = useMemo(() => {
    if (!containerData) return null
    
    // Derive flattened timestamp values from arrays
    const etdTimestamps = containerData.etdTimestamps ?? null
    const etaTimestamps = containerData.etaTimestamps ?? null
    const atdTimestamps = containerData.atdTimestamps ?? null
    const ataTimestamps = containerData.ataTimestamps ?? null
    
    return {
      // Required ProjectSeaContainer fields
      id: containerData.id,
      projectId: projectId,
      containerNumber: containerData.containerNumber ?? null,
      containerType: containerData.containerType ?? '40HC',
      sealNumber: containerData.sealNumber ?? null,
      status: containerData.status || 'PENDING',
      carrierCode: containerData.carrierCode ?? null,
      bookingNumber: containerData.bookingNumber ?? null,
      bolNumber: containerData.bolNumber ?? null,
      vesselName: containerData.vesselName ?? null,
      vesselImo: containerData.vesselImo ?? null,
      voyageNumber: containerData.voyageNumber ?? null,
      originPort: containerData.originPort ?? null,
      destinationPort: containerData.destinationPort ?? null,
      trackedShipmentId: containerData.trackedShipmentId ?? null,
      lastSyncedAt: containerData.lastSyncedAt ?? null,
      syncStatus: containerData.syncStatus ?? null,
      isHazardous: containerData.isHazardous ?? false,
      isActive: true, // Default to active
      notes: containerData.notes ?? null,
      ownershipType: containerData.ownershipType ?? null,
      // Timestamp arrays
      etdTimestamps,
      atdTimestamps,
      etaTimestamps,
      ataTimestamps,
      // Flattened timestamps (derived from arrays)
      etd: getPrimaryFromArray(etdTimestamps),
      eta: getPrimaryFromArray(etaTimestamps),
      atd: getPrimaryFromArray(atdTimestamps),
      ata: getPrimaryFromArray(ataTimestamps),
      // Extended data
      originLocation: containerData.originLocation ?? null,
      destinationLocation: containerData.destinationLocation ?? null,
      routeStops: containerData.routeStops ?? null,
      cargoEvents: containerData.cargoEvents ?? null,
      eventCount: containerData.eventCount,
      lastEventAt: containerData.lastEventAt ?? null,
      customsClearanceStatus: containerData.customsClearanceStatus ?? null,
      customsClearanceLocation: containerData.customsClearanceLocation ?? null,
      vgmStatus: containerData.vgmStatus ?? null,
      vgmWeight: containerData.vgmWeight ?? null,
      vgmCutoffDate: containerData.vgmCutoffDate ?? null,
    }
  }, [containerData, projectId])

  const routeStops = fullContainer?.routeStops ?? []
  const events = fullContainer?.cargoEvents ?? []

  // Determine current vessel for tracking map
  const currentVesselInfo = useMemo(() => {
    if (!fullContainer) return null
    
    // Convert RouteStop[] to RouteStopEntry[] for getCurrentVessel
    const routeStopEntries: RouteStopEntry[] = routeStops.map(stop => ({
      location: stop.location,
      unlocode: stop.unlocode,
      type: stop.type,
      vesselName: stop.vesselName,
      vesselImo: stop.vesselImo,
      ata: stop.ata,
      atd: stop.atd,
      eta: stop.eta,
      etd: stop.etd,
      facilityCode: stop.facilityCode,
      facilityCodeListProvider: stop.facilityCodeListProvider,
      facilityTypeCode: stop.facilityTypeCode,
      facilityAddress: stop.facilityAddress,
      coords: stop.coords,
    }))
    
    // Convert CargoEvent[] to CargoEventEntry[] for getCurrentVessel
    const cargoEventEntries: CargoEventEntry[] = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      eventCode: event.eventCode,
      eventClassifierCode: event.eventClassifierCode,
      eventDateTime: event.eventDateTime,
      description: event.description,
      locationName: event.locationName,
      locationUnlocode: event.locationUnlocode,
      vesselName: event.vesselName,
      vesselImo: event.vesselImo,
    }))
    
    return getCurrentVessel(
      routeStopEntries,
      cargoEventEntries,
      {
        vesselName: fullContainer.vesselName,
        vesselImo: fullContainer.vesselImo,
      }
    )
  }, [fullContainer, routeStops, events])

  // Vessel tracking map state determination
  const isDelivered = currentVesselInfo?.status === 'delivered'
  const hasVesselImo = Boolean(currentVesselInfo?.vesselImo)
  const hasVesselName = Boolean(currentVesselInfo?.vesselName)

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
        <div className="flex justify-between px-4 py-6 border-b border-border">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-foreground">
              Container Details
            </h1>
            {fullContainer?.containerNumber && (
              <span className="font-mono text-sm text-muted-foreground tracking-wider">
                {fullContainer.containerNumber}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <Spinner className="h-6 w-6" />
              <span className="text-sm text-muted-foreground">
                Loading container details...
              </span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-sm text-destructive">
                Failed to load container details
              </span>
            </div>
          ) : !fullContainer ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-sm text-muted-foreground">
                No container selected
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Container Card */}
              <ContainerCard container={fullContainer} />

              {/* Destination Status */}
              <DestinationStatusCard container={fullContainer} />

              {/* Route Details */}
              {routeStops.length > 0 && <RouteDetails stops={routeStops} />}

              {/* Vessel Tracking Map with three states: delivered, has IMO, no IMO */}
              {currentVesselInfo && isDelivered ? (
                // Container delivered - show delivered message instead of map
                <div className="relative w-full h-32 border border-green-200 dark:border-green-800 rounded-lg overflow-hidden bg-green-50 dark:bg-green-950/30">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Package className="w-8 h-8 text-green-500 dark:text-green-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">
                        {t('fms_projects.map.delivered', 'Container delivered')}
                      </p>
                      {currentVesselInfo.currentPort && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          {currentVesselInfo.currentPort}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : currentVesselInfo && hasVesselImo ? (
                // Show map with current or planned vessel
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <VesselTrackingMap
                    vesselImo={currentVesselInfo.vesselImo}
                    vesselName={currentVesselInfo.vesselName}
                    height="280px"
                    autoRefresh={true}
                    showInfoOverlay={true}
                    containerStatus={currentVesselInfo.status}
                    currentPort={currentVesselInfo.currentPort}
                    isPlannedVessel={currentVesselInfo.isPlannedVessel}
                    currentLeg={currentVesselInfo.currentLeg}
                    traceFrom={currentVesselInfo.traceFrom}
                  />
                </div>
              ) : hasVesselName ? (
                // No vessel IMO available but have vessel name
                <div className="relative w-full h-48 border border-border rounded-lg overflow-hidden bg-muted">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Ship className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {t('fms_projects.map.noVesselData', 'No vessel data available')}
                      </p>
                    </div>
                  </div>
                  {/* Vessel name overlay when no IMO */}
                  {currentVesselInfo?.vesselName && (
                    <div className="absolute top-3 left-3 bg-card/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 border border-border">
                      <div className="flex items-center gap-2">
                        <Ship className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                        <div>
                          <h2 className="font-semibold text-sm text-foreground">{currentVesselInfo.vesselName}</h2>
                          <p className="text-xs text-muted-foreground">
                            {t('fms_projects.map.noImoNumber', 'IMO number not available')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Container Details */}
              <ContainerDetails
                container={fullContainer}
                onUpdate={handleFieldUpdate && containerId ? (field, value) => handleFieldUpdate(containerId, field, value) : undefined}
              />

              {/* Customs & VGM */}
              <CustomsVgmDetails container={fullContainer} />

              {/* Journey Timeline */}
              {events.length > 0 && <JourneyTimeline events={events} />}

              {/* Notes */}
              {fullContainer.notes && (
                <CollapsibleSection
                  title={t('fms_projects.notes.title', 'Notes')}
                  icon={FileText}
                  defaultOpen={false}
                >
                  <div className="p-3">
                    <div className="bg-muted rounded-lg p-4">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {fullContainer.notes}
                      </p>
                    </div>
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default SeaContainerDetailsDrawer
