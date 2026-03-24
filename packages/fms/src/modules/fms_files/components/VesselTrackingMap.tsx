'use client'

/**
 * VesselTrackingMap - Interactive map showing vessel position and trace.
 *
 * Features:
 * - Real-time vessel position with heading-rotated ship icon
 * - Trace polyline limited to viewport bounds (debounced fetch)
 * - Vessel info overlay with status and destination
 * - Auto-refresh vessel position every 30 seconds
 */

import * as React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF } from '@react-google-maps/api'
import { Ship, Navigation, Anchor, MapPin, Clock, Building2, Ruler, Info } from 'lucide-react'
import { useVesselTracking } from '../hooks/useVesselTracking'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { VesselTrackingStatus } from '../lib/current-vessel'
import type { VesselInfo } from '../lib/vessel-api'

// ─── Types ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleMapInstance = any

export interface VesselTrackingMapProps {
  /** Vessel IMO number */
  vesselImo: string | null | undefined
  /** Vessel name (fallback if API doesn't return name) */
  vesselName?: string | null
  /** Map height (CSS value, default: '250px') */
  height?: string
  /** Auto-refresh vessel position (default: true) */
  autoRefresh?: boolean
  /** Vessel refresh interval in ms (default: 30000) */
  refreshInterval?: number
  /** Show vessel info overlay (default: true) */
  showInfoOverlay?: boolean
  /** Container tracking status - affects display messaging */
  containerStatus?: VesselTrackingStatus
  /** Port where container currently is (for at_port/not_departed status) */
  currentPort?: string
  /** Whether this is a planned vessel (not yet carrying the container) */
  isPlannedVessel?: boolean
  /** Current leg info (for in_transit status) */
  currentLeg?: {
    fromPort: string
    toPort: string
  }
  /** Start date for trace (ISO 8601) - limits trace to current leg */
  traceFrom?: string
}

// ─── Map Configuration ───────────────────────────────────────

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
}

// Map options - typed as Record to avoid google namespace dependency at compile time
const mapOptions: Record<string, unknown> = {
  zoomControl: true,
  mapTypeControl: false,
  scaleControl: false,
  streetViewControl: false,
  rotateControl: false,
  fullscreenControl: false,
  disableDefaultUI: false,
  gestureHandling: 'cooperative',
  styles: [
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#bfdbfe' }], // Light blue for water
    },
    {
      featureType: 'landscape',
      elementType: 'geometry',
      stylers: [{ color: '#f5f3ff' }], // Light purple for land
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#e0e7ff' }], // Light indigo for roads
    },
  ],
}

// Default center: Baltic Sea
const defaultCenter = { lat: 54.5, lng: 18.5 }

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Calculate vessel dimensions from AIS dimension fields.
 * a = bow to reference, b = reference to stern -> length = a + b
 * c = port to reference, d = reference to starboard -> width = c + d
 */
function calculateVesselDimensions(vessel: VesselInfo | null | undefined): {
  length: number
  width: number
  hasValidDimensions: boolean
} {
  const dims = vessel?.dimensions
  if (!dims) {
    return { length: 0, width: 0, hasValidDimensions: false }
  }
  const length = (dims.a ?? 0) + (dims.b ?? 0)
  const width = (dims.c ?? 0) + (dims.d ?? 0)
  // Only consider valid if both length and width are positive
  const hasValidDimensions = length > 0 && width > 0
  return { length, width, hasValidDimensions }
}

/**
 * Format relative time for last update (e.g., "2 min ago", "1 hour ago").
 */
function formatRelativeTime(dateString: string | null | undefined, t: ReturnType<typeof useT>): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) {
    return t('fms_projects.map.justNow', 'Just now')
  }
  if (diffMinutes < 60) {
    return t('fms_projects.map.minutesAgo', '{{count}} min ago', { count: diffMinutes })
  }
  if (diffHours < 24) {
    return t('fms_projects.map.hoursAgo', '{{count}}h ago', { count: diffHours })
  }
  return t('fms_projects.map.daysAgo', '{{count}}d ago', { count: diffDays })
}

// ─── Vessel Info Card ────────────────────────────────────────

interface VesselInfoCardProps {
  vessel: VesselInfo | null | undefined
  displayName: string
  isPlannedVessel: boolean
  containerStatus?: VesselTrackingStatus
  currentPort?: string
  currentLeg?: { fromPort: string; toPort: string }
  t: ReturnType<typeof useT>
}

function VesselInfoCard({
  vessel,
  displayName,
  isPlannedVessel,
  containerStatus,
  currentPort,
  currentLeg,
  t,
}: VesselInfoCardProps) {
  const { length, width, hasValidDimensions } = calculateVesselDimensions(vessel)
  const lastUpdate = formatRelativeTime(vessel?.updatedAt, t)

  // Determine vessel status display
  const getVesselStatusDisplay = () => {
    if (vessel?.status === 'IN_PORT') {
      return {
        icon: <Anchor className="w-3 h-3 text-green-600 dark:text-green-400" />,
        text: vessel.currentPort?.name || t('fms_projects.map.inPort', 'In Port'),
        color: 'text-green-600 dark:text-green-400',
      }
    }
    if (vessel?.status === 'AT_SEA') {
      const destination = vessel.lastDestinationPort?.name || vessel.lastDestination
      return {
        icon: <Navigation className="w-3 h-3 text-blue-600 dark:text-blue-400" />,
        text: destination
          ? t('fms_projects.map.atSeaTo', 'At Sea -> {{destination}}', { destination })
          : t('fms_projects.map.atSea', 'At Sea'),
        color: 'text-blue-600 dark:text-blue-400',
      }
    }
    return {
      icon: <Info className="w-3 h-3 text-muted-foreground" />,
      text: t('fms_projects.map.unknown', 'Unknown'),
      color: 'text-muted-foreground',
    }
  }

  const statusDisplay = getVesselStatusDisplay()

  return (
    <div className="bg-card border border-border rounded-l-lg border-r-0 px-3 py-2.5 h-full overflow-y-auto">
      {/* Header: Vessel name + planned badge */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Ship className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
          <h2 className="font-semibold text-sm truncate text-foreground">{displayName}</h2>
        </div>
        {isPlannedVessel && (
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded flex-shrink-0">
            {t('fms_projects.map.planned', 'Planned')}
          </span>
        )}
      </div>

      {/* IMO number */}
      {vessel?.imo && (
        <div className="text-xs text-muted-foreground font-mono mb-2">
          IMO {vessel.imo}
        </div>
      )}

      {/* Vessel details section */}
      <div className="border-t border-border pt-2 space-y-1.5">
        {/* Status row */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground/70 w-14 flex-shrink-0 truncate" title={t('fms_projects.map.status', 'Status')}>
            {t('fms_projects.map.status', 'Status')}
          </span>
          <div className={`flex items-center gap-1 ${statusDisplay.color} truncate`}>
            {statusDisplay.icon}
            <span className="truncate">{statusDisplay.text}</span>
          </div>
        </div>

        {/* Ship type row */}
        {vessel?.shipType && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground/70 w-14 flex-shrink-0 truncate" title={t('fms_projects.map.type', 'Type')}>
              {t('fms_projects.map.type', 'Type')}
            </span>
            <span className="text-foreground truncate" title={vessel.shipType}>{vessel.shipType}</span>
          </div>
        )}

        {/* Size row */}
        {hasValidDimensions && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground/70 w-14 flex-shrink-0 truncate" title={t('fms_projects.map.size', 'Size')}>
              {t('fms_projects.map.size', 'Size')}
            </span>
            <div className="flex items-center gap-1 text-foreground">
              <Ruler className="w-3 h-3 text-muted-foreground" />
              <span>{length}m x {width}m</span>
            </div>
          </div>
        )}

        {/* Operator row */}
        {vessel?.operatorName && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground/70 w-14 flex-shrink-0 truncate" title={t('fms_projects.map.operator', 'Operator')}>
              {t('fms_projects.map.operator', 'Operator')}
            </span>
            <div className="flex items-center gap-1 text-foreground truncate" title={vessel.operatorName}>
              <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{vessel.operatorName}</span>
            </div>
          </div>
        )}

        {/* Last update row */}
        {lastUpdate && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground/70 w-14 flex-shrink-0 truncate" title={t('fms_projects.map.updated', 'Updated')}>
              {t('fms_projects.map.updated', 'Updated')}
            </span>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span>{lastUpdate}</span>
            </div>
          </div>
        )}
      </div>

      {/* Container status section (when container tracking is active) */}
      {containerStatus && containerStatus !== 'delivered' && (
        <div className="border-t border-border mt-2 pt-2">
          {containerStatus === 'in_transit' && currentLeg ? (
            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <MapPin className="w-3 h-3" />
              <span className="truncate">
                {t('fms_projects.map.inTransitTo', 'In transit to {{destination}}', {
                  destination: currentLeg.toPort,
                })}
              </span>
            </div>
          ) : containerStatus === 'at_port' && currentPort ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <MapPin className="w-3 h-3" />
                <span className="truncate">
                  {t('fms_projects.map.containerAtPort', 'Container at {{port}}', {
                    port: currentPort,
                  })}
                </span>
              </div>
              {isPlannedVessel && (
                <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <Clock className="w-3 h-3" />
                  <span className="truncate">
                    {t('fms_projects.map.awaitingVessel', 'Awaiting this vessel')}
                  </span>
                </div>
              )}
            </div>
          ) : containerStatus === 'not_departed' ? (
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="w-3 h-3" />
              <span className="truncate">
                {t('fms_projects.map.awaitingDeparture', 'Awaiting departure')}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export function VesselTrackingMap({
  vesselImo,
  vesselName,
  height = '250px',
  autoRefresh = true,
  refreshInterval = 30_000,
  showInfoOverlay = true,
  containerStatus,
  currentPort,
  isPlannedVessel = false,
  currentLeg,
  traceFrom,
}: VesselTrackingMapProps) {
  const t = useT()

  // Load Google Maps API
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  })

  // Map instance reference
  const [map, setMap] = useState<GoogleMapInstance | null>(null)

  // Vessel tracking with debounced bounds
  const {
    vessel,
    isVesselLoading,
    vesselError,
    trace,
    isTraceLoading,
    isDebouncing,
    setBounds,
  } = useVesselTracking(vesselImo, {
    autoRefresh,
    vesselRefreshInterval: refreshInterval,
    boundsDebounceDelay: 500,
    traceLimit: 5000,
    traceFrom,
  })

  // Handle map load
  const onMapLoad = useCallback((mapInstance: GoogleMapInstance) => {
    setMap(mapInstance)
  }, [])

  // Handle map idle (fires after load and after pan/zoom completes)
  const handleMapIdle = useCallback(() => {
    if (!map) return
    const bounds = map.getBounds()
    if (!bounds) return

    const ne = bounds.getNorthEast()
    const sw = bounds.getSouthWest()

    // Add fixed margin (~30-35km) to fetch trace points outside visible viewport
    // This ensures smooth curves at map edges instead of straight lines
    const MARGIN_DEGREES = 0.3

    setBounds({
      north: Math.min(90, ne.lat() + MARGIN_DEGREES),
      south: Math.max(-90, sw.lat() - MARGIN_DEGREES),
      east: Math.min(180, ne.lng() + MARGIN_DEGREES),
      west: Math.max(-180, sw.lng() - MARGIN_DEGREES),
    })
  }, [map, setBounds])

  // Create container ship icon with heading rotation
  // Ship silhouette viewed from above: pointed bow (top), wide stern (bottom), bridge at rear
  const shipIcon = useMemo(() => {
    if (!isLoaded || typeof window === 'undefined') return undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google
    if (!google) return undefined

    const heading = vessel?.lastHeading ?? 0

    // Container ship silhouette (top-down view, pointing up/north)
    // Elongated shape with slightly pointed bow - typical container ship proportions
    // Features: tapered bow (not too sharp), narrow hull, bridge at stern
    const containerShipPath = `
      M 12 2
      L 8 7
      L 8 30
      Q 8 32, 10 32
      L 10 34
      L 14 34
      L 14 32
      Q 16 32, 16 30
      L 16 7
      L 12 2
      Z
      M 10 32
      L 10 36
      L 14 36
      L 14 32
      Z
    `

    return {
      path: containerShipPath,
      fillColor: '#0f172a',      // Dark slate hull
      fillOpacity: 0.95,
      strokeColor: '#ffffff',
      strokeWeight: 1.5,
      scale: 1.0,
      rotation: heading,
      anchor: new google.maps.Point(12, 18),  // Center point for rotation
    }
  }, [isLoaded, vessel?.lastHeading])

  // Center map on vessel position
  const center = useMemo(() => {
    if (vessel?.lastPosition) {
      return { lat: vessel.lastPosition.lat, lng: vessel.lastPosition.lng }
    }
    return defaultCenter
  }, [vessel?.lastPosition])

  // Filter trace points to only position updates for cleaner polyline
  const tracePath = useMemo(() => {
    if (!trace?.trace) return []
    return trace.trace
      .filter((p) => p.lat && p.lng && p.eventType === 'POSITION_UPDATE')
      .map((p) => ({ lat: p.lat, lng: p.lng }))
  }, [trace?.trace])

  // ─── Loading State ─────────────────────────────────────────

  if (loadError) {
    return (
      <div className="flex w-full" style={{ height }}>
        <div className="w-full flex items-center justify-center bg-muted rounded-lg border border-border">
          <div className="text-center">
            <Ship className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('fms_projects.map.loadError', 'Failed to load map')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!isLoaded || (isVesselLoading && !vessel)) {
    return (
      <div className="flex w-full" style={{ height }}>
        <div className="w-full flex items-center justify-center bg-muted rounded-lg border border-border">
          <div className="flex flex-col items-center gap-2">
            <Spinner className="h-6 w-6" />
            <span className="text-sm text-muted-foreground">
              {t('fms_projects.map.loading', 'Loading map...')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ─── No Vessel Data ────────────────────────────────────────

  if (!vessel && !isVesselLoading) {
    return (
      <div className="flex w-full" style={{ height }}>
        <div className="w-full flex items-center justify-center bg-muted rounded-lg border border-border">
          <div className="text-center">
            <Ship className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {vesselError
                ? t('fms_projects.map.vesselError', 'Failed to load vessel data')
                : t('fms_projects.map.vesselNotFound', 'Vessel not found')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Map Render ────────────────────────────────────────────

  const displayName = vesselName || vessel?.name || 'Unknown Vessel'

  return (
    <div className="flex w-full" style={{ height }}>
      {/* Vessel Info Card - 1/3 width */}
      {showInfoOverlay && (
        <div className="w-1/3 flex-shrink-0">
          <VesselInfoCard
            vessel={vessel}
            displayName={displayName}
            isPlannedVessel={isPlannedVessel}
            containerStatus={containerStatus}
            currentPort={currentPort}
            currentLeg={currentLeg}
            t={t}
          />
        </div>
      )}

      {/* Map - 2/3 width (or full if no info overlay) */}
      <div className={`relative border border-border overflow-hidden ${showInfoOverlay ? 'w-2/3 rounded-r-lg' : 'w-full rounded-lg'}`}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={8}
          onLoad={onMapLoad}
          onIdle={handleMapIdle}
          options={mapOptions}
        >
          {/* Vessel Marker */}
          {vessel?.lastPosition && (
            <MarkerF
              position={{ lat: vessel.lastPosition.lat, lng: vessel.lastPosition.lng }}
              icon={shipIcon}
              title={displayName}
            />
          )}

          {/* Trace Polyline */}
          {tracePath.length > 1 && (
            <PolylineF
              path={tracePath}
              options={{
                strokeColor: '#8b5cf6', // Purple
                strokeOpacity: 0.6,
                strokeWeight: 2,
                geodesic: true,
              }}
            />
          )}
        </GoogleMap>

        {/* Loading Indicator for Trace */}
        {(isTraceLoading || isDebouncing) && (
          <div className="absolute top-3 right-3 bg-card/95 backdrop-blur-sm rounded-lg shadow-sm px-2 py-1 border border-border">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">
                {t('fms_projects.map.loadingTrace', 'Loading...')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VesselTrackingMap
