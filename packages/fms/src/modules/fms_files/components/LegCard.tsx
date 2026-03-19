'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight, Ship, Truck, Train, Plane } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import type { MockLeg } from '../data/mock'
import { getLatestTimestampValue, formatTimestamp } from '../data/mock'

const LEG_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TRUCK: Truck,
  SHIP: Ship,
  RAIL: Train,
  AIR: Plane,
}

const LEG_TYPE_COLORS: Record<string, string> = {
  TRUCK: 'bg-orange-500/20 text-orange-400',
  SHIP: 'bg-blue-500/20 text-blue-400',
  RAIL: 'bg-purple-500/20 text-purple-400',
  AIR: 'bg-cyan-500/20 text-cyan-400',
}

// TimestampRow placeholder — actual rendering is inline below
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TimestampRow(_props: { label: string; entries: unknown }) {
  return null
}

export function LegCard({ leg, compact }: { leg: MockLeg; compact?: boolean }) {
  const [isExpanded, setIsExpanded] = React.useState(true)
  const Icon = LEG_TYPE_ICONS[leg.type] ?? Truck
  const colorClass = LEG_TYPE_COLORS[leg.type] ?? LEG_TYPE_COLORS.TRUCK

  const ptd = formatTimestamp(getLatestTimestampValue(leg.ptdTimestamps))
  const etd = formatTimestamp(getLatestTimestampValue(leg.etdTimestamps))
  const atd = formatTimestamp(getLatestTimestampValue(leg.atdTimestamps))
  const pta = formatTimestamp(getLatestTimestampValue(leg.ptaTimestamps))
  const eta = formatTimestamp(getLatestTimestampValue(leg.etaTimestamps))
  const ata = formatTimestamp(getLatestTimestampValue(leg.ataTimestamps))

  const etaUpdateCount = leg.etaTimestamps?.length ?? 0

  const containerCount = leg.legContainers.length
  const packageCount = leg.legPackages.length
  const hasContainers = containerCount > 0
  const hasPackages = packageCount > 0

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className={`flex items-center justify-center w-8 h-8 rounded ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {leg.originName}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="text-sm font-medium text-foreground">
              {leg.destinationName}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{leg.type}</Badge>
            {leg.carrierName && (
              <span className="text-xs text-muted-foreground">{leg.carrierName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasContainers && (
            <Badge variant="secondary" className="text-xs">{containerCount} cnt</Badge>
          )}
          {hasPackages && (
            <Badge variant="secondary" className="text-xs">{packageCount} pkg</Badge>
          )}
          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">Departure</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-muted-foreground">PTD:</span> <span className="text-foreground">{ptd}</span></div>
                <div><span className="text-muted-foreground">ETD:</span> <span className="text-foreground">{etd}</span></div>
                <div><span className="text-muted-foreground">ATD:</span> <span className="text-foreground font-medium">{atd}</span></div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">Arrival</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-muted-foreground">PTA:</span> <span className="text-foreground">{pta}</span></div>
                <div>
                  <span className="text-muted-foreground">ETA:</span>{' '}
                  <span className="text-foreground">{eta}</span>
                  {etaUpdateCount > 1 && (
                    <span className="ml-1 text-[10px] text-amber-500 cursor-help" title={`Updated ${etaUpdateCount}x`}>
                      ({etaUpdateCount}x)
                    </span>
                  )}
                </div>
                <div><span className="text-muted-foreground">ATA:</span> <span className="text-foreground font-medium">{ata}</span></div>
              </div>
            </div>
          </div>

          {/* Carrier / Booking / B/L */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            {leg.carrierName && (
              <div><span className="text-muted-foreground">Carrier:</span> <span className="text-foreground">{leg.carrierName}</span></div>
            )}
            {leg.bookingNumber && (
              <div><span className="text-muted-foreground">Booking:</span> <span className="text-foreground font-mono">{leg.bookingNumber}</span></div>
            )}
            {leg.blNumber && (
              <div><span className="text-muted-foreground">Master B/L:</span> <span className="text-foreground font-mono">{leg.blNumber}</span></div>
            )}
          </div>

          {/* SHIP-specific */}
          {leg.vesselName && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <div><span className="text-muted-foreground">Vessel:</span> <span className="text-foreground">{leg.vesselName}</span></div>
              {leg.vesselImo && (
                <div><span className="text-muted-foreground">IMO:</span> <span className="text-foreground font-mono">{leg.vesselImo}</span></div>
              )}
              {leg.voyageNumber && (
                <div><span className="text-muted-foreground">Voyage:</span> <span className="text-foreground font-mono">{leg.voyageNumber}</span></div>
              )}
            </div>
          )}

          {/* Container table (FCL) */}
          {hasContainers && !compact && (
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider mb-1">
                Containers ({containerCount})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Container #</th>
                      <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Type</th>
                      {leg.type === 'TRUCK' && (
                        <>
                          <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Truck Plate</th>
                          <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Driver</th>
                        </>
                      )}
                      {leg.type === 'SHIP' && (
                        <>
                          <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Seal #</th>
                          <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">B/L</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {leg.legContainers.slice(0, 5).map((lc) => (
                      <tr key={lc.containerId} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 font-mono text-foreground">{lc.containerNumber ?? '(TBD)'}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{lc.containerType}</td>
                        {leg.type === 'TRUCK' && (
                          <>
                            <td className="py-1.5 pr-3 text-foreground">{lc.truckPlate ?? '-'}</td>
                            <td className="py-1.5 pr-3 text-foreground">{lc.driverFullName ?? '-'}</td>
                          </>
                        )}
                        {leg.type === 'SHIP' && (
                          <>
                            <td className="py-1.5 pr-3 font-mono text-foreground">{lc.sealNumber ?? '-'}</td>
                            <td className="py-1.5 pr-3 font-mono text-foreground">{lc.blNumber ?? '-'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                    {containerCount > 5 && (
                      <tr>
                        <td colSpan={4} className="py-1.5 text-muted-foreground">
                          ... +{containerCount - 5} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Package table (LCL) */}
          {hasPackages && !compact && (
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider mb-1">
                Packages ({packageCount})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Commodity</th>
                      {leg.type === 'SHIP' && (
                        <>
                          <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Consol. Container</th>
                          <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">House B/L</th>
                        </>
                      )}
                      {leg.type === 'TRUCK' && (
                        <>
                          <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Driver</th>
                          <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Phone</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {leg.legPackages.map((lp) => (
                      <tr key={lp.packageId} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 text-foreground">{lp.commodityDescription}</td>
                        {leg.type === 'SHIP' && (
                          <>
                            <td className="py-1.5 pr-3 font-mono text-foreground">{lp.consolidationContainerNumber ?? '-'}</td>
                            <td className="py-1.5 pr-3 font-mono text-foreground">{lp.hblNumber ?? '-'}</td>
                          </>
                        )}
                        {leg.type === 'TRUCK' && (
                          <>
                            <td className="py-1.5 pr-3 text-foreground">{lp.driverFullName ?? '-'}</td>
                            <td className="py-1.5 pr-3 text-foreground">{lp.driverPhone ?? '-'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
