'use client'

/**
 * FmsAirLegDrawer — Detail view for an AIR leg assignment.
 *
 * Receives all data directly from the TransportView row — no secondary fetch needed.
 */

import * as React from 'react'
import { Plane, MapPin, Package, Clock, ArrowRight, FileText, AlertTriangle } from 'lucide-react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'

// ─── Types ───────────────────────────────────────────────────

interface TimestampEntry {
  value: string
  source?: string
  updatedAt?: string
}

export interface AirRowData {
  containerNumber?: string | null
  containerType?: string | null
  commodityDescription?: string | null
  grossWeight?: string | null
  weightUnit?: string | null
  packageCount?: number | null
  isHazardous?: boolean | null
  // encoded as JSON {id, name} or plain string
  originName?: string | null
  destinationName?: string | null
  carrierName?: string | null
  flightNumber?: string | null
  aircraftType?: string | null
  bookingNumber?: string | null
  legBlNumber?: string | null  // Master AWB (leg-level)
  blNumber?: string | null     // House AWB (unit-leg-level)
  sealNumber?: string | null
  ptd?: string | null
  etd?: string | null
  atd?: string | null
  pta?: string | null
  eta?: string | null
  ata?: string | null
  // SCD history for drift calculation
  etdTimestamps?: TimestampEntry[] | null
  etaTimestamps?: TimestampEntry[] | null
  notes?: string | null
}

export interface FmsAirLegDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rowData: AirRowData | null
}

// ─── Helpers ─────────────────────────────────────────────────

function parseName(encoded: string | null | undefined): string {
  if (!encoded) return '-'
  try {
    const parsed = JSON.parse(encoded)
    return parsed.name || '-'
  } catch {
    return encoded || '-'
  }
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatDateOnly(ts: string | null | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}

function delayDays(planned: string | null | undefined, actual: string | null | undefined): number | null {
  if (!planned || !actual) return null
  const diff = Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 86_400_000)
  return diff !== 0 ? diff : null
}

function scdDrift(timestamps: TimestampEntry[] | null | undefined): number | null {
  if (!timestamps || timestamps.length < 2) return null
  const sorted = [...timestamps].sort((a, b) =>
    new Date(a.updatedAt ?? a.value).getTime() - new Date(b.updatedAt ?? b.value).getTime()
  )
  const diff = Math.round(
    (new Date(sorted.at(-1)!.value).getTime() - new Date(sorted[0].value).getTime()) / 86_400_000
  )
  return diff !== 0 ? diff : null
}

function DelayBadge({ days, prefix = '' }: { days: number | null; prefix?: string }) {
  if (days === null) return null
  return (
    <span className={`${prefix}text-[10px] font-medium px-1.5 py-0.5 rounded ${
      days > 0
        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    }`}>
      {days > 0 ? `+${days}d` : `${days}d`}
    </span>
  )
}

// ─── Sub-sections ─────────────────────────────────────────────

function FlightCard({ row }: { row: AirRowData }) {
  const carrier = parseName(row.carrierName)
  return (
    <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <Plane className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        Flight
      </h3>
      <div className="space-y-2">
        {row.flightNumber && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-foreground tracking-wider">{row.flightNumber}</span>
          </div>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          {row.aircraftType && (
            <span>Aircraft: <span className="text-foreground font-medium">{row.aircraftType}</span></span>
          )}
          {carrier !== '-' && (
            <span>Carrier: <span className="text-foreground font-medium">{carrier}</span></span>
          )}
          {row.bookingNumber && (
            <span>Booking: <span className="font-mono text-foreground font-medium">{row.bookingNumber}</span></span>
          )}
        </div>
      </div>
    </div>
  )
}

function AwbCard({ row }: { row: AirRowData }) {
  if (!row.legBlNumber && !row.blNumber) return null
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4" />
        Air Waybill
      </h3>
      <div className="space-y-2">
        {row.legBlNumber && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Master AWB (MAWB)</span>
            <span className="font-mono font-semibold text-foreground">{row.legBlNumber}</span>
          </div>
        )}
        {row.blNumber && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">House AWB (HAWB)</span>
            <span className="font-mono font-semibold text-foreground">{row.blNumber}</span>
          </div>
        )}
        {row.sealNumber && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Seal</span>
            <span className="font-mono text-foreground">{row.sealNumber}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function RoutingCard({ row }: { row: AirRowData }) {
  const origin = parseName(row.originName)
  const destination = parseName(row.destinationName)

  const etaDrift = scdDrift(row.etaTimestamps)
  const etdDrift = scdDrift(row.etdTimestamps)

  const atd = row.atd
  const etd = row.etd
  const ptd = row.ptd
  const ata = row.ata
  const eta = row.eta
  const pta = row.pta

  const departureDelay = delayDays(ptd ?? etd, atd)
  const arrivalDelay = delayDays(pta ?? eta, ata)

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
        <MapPin className="w-4 h-4" />
        Routing
      </h3>

      {/* Route */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
        <div className="flex-1 text-center sm:text-right">
          <div className="font-semibold text-foreground">{origin}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {atd ? `ATD: ${formatTs(atd)}` : etd ? `ETD: ${formatTs(etd)}` : ptd ? `PTD: ${formatTs(ptd)}` : 'No departure time'}
          </div>
          {departureDelay !== null && (
            <div className="mt-0.5"><DelayBadge days={departureDelay} /></div>
          )}
        </div>
        <Plane className="w-5 h-5 text-muted-foreground flex-shrink-0 mx-auto" />
        <div className="flex-1 text-center sm:text-left">
          <div className="font-semibold text-foreground">{destination}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {ata ? `ATA: ${formatTs(ata)}` : eta ? `ETA: ${formatTs(eta)}` : pta ? `PTA: ${formatTs(pta)}` : 'No arrival time'}
          </div>
          {arrivalDelay !== null && (
            <div className="mt-0.5"><DelayBadge days={arrivalDelay} /></div>
          )}
        </div>
      </div>

      {/* Full 6-timestamp table */}
      <div className="border-t border-border pt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Departure</div>
          <div className="space-y-1.5">
            {[
              { label: 'PTD', value: ptd },
              { label: 'ETD', value: etd, planned: ptd },
              { label: 'ATD', value: atd, planned: etd ?? ptd },
            ].map(({ label, value, planned }) => (
              <div key={label} className={`flex items-center justify-between text-xs rounded px-2 py-1 ${value ? 'bg-muted' : 'opacity-40'}`}>
                <span className="text-muted-foreground w-8">{label}</span>
                <span className="font-medium text-foreground">
                  {value ? formatTs(value) : '—'}
                  {label === 'ATD' && value && planned && (
                    <DelayBadge days={delayDays(planned, value)} prefix="ml-1.5" />
                  )}
                </span>
              </div>
            ))}
            {etdDrift !== null && (
              <div className="text-[10px] text-muted-foreground px-2">
                ETD shifted: <DelayBadge days={etdDrift} />
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Arrival</div>
          <div className="space-y-1.5">
            {[
              { label: 'PTA', value: pta },
              { label: 'ETA', value: eta, planned: pta },
              { label: 'ATA', value: ata, planned: eta ?? pta },
            ].map(({ label, value, planned }) => (
              <div key={label} className={`flex items-center justify-between text-xs rounded px-2 py-1 ${value ? 'bg-muted' : 'opacity-40'}`}>
                <span className="text-muted-foreground w-8">{label}</span>
                <span className="font-medium text-foreground">
                  {value ? formatTs(value) : '—'}
                  {label === 'ATA' && value && planned && (
                    <DelayBadge days={delayDays(planned, value)} prefix="ml-1.5" />
                  )}
                </span>
              </div>
            ))}
            {etaDrift !== null && (
              <div className="text-[10px] text-muted-foreground px-2">
                ETA shifted: <DelayBadge days={etaDrift} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CargoCard({ row, isFCL }: { row: AirRowData; isFCL: boolean }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <Package className="w-4 h-4" />
        Cargo
      </h3>
      <div className="space-y-1">
        {isFCL && row.containerNumber && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">ULD / Container</span>
            <span className="font-mono font-semibold">{row.containerNumber}</span>
          </div>
        )}
        {!isFCL && row.commodityDescription && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Commodity</span>
            <span className="font-medium">{row.commodityDescription}</span>
          </div>
        )}
        {!isFCL && row.packageCount && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pieces</span>
            <span>{row.packageCount}</span>
          </div>
        )}
        {row.grossWeight && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Gross Weight</span>
            <span>{row.grossWeight} {row.weightUnit ?? 'kg'}</span>
          </div>
        )}
        {row.isHazardous && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            DGR (Dangerous Goods)
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function FmsAirLegDrawer({ open, onOpenChange, rowData }: FmsAirLegDrawerProps) {
  const isFCL = !!rowData?.containerNumber

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex flex-col p-0 w-full sm:max-w-lg"
        overlayClassName="backdrop-blur-none"
      >
        {/* Header */}
        <div className="flex justify-between px-4 py-6 border-b border-border">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded">
                <Plane className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">Air Leg</h1>
            </div>
            {rowData?.flightNumber && (
              <p className="text-sm font-mono text-muted-foreground ml-9">{rowData.flightNumber}</p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!rowData ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data</div>
          ) : (
            <div className="space-y-4">
              <FlightCard row={rowData} />
              <AwbCard row={rowData} />
              <RoutingCard row={rowData} />
              <CargoCard row={rowData} isFCL={isFCL} />
              {rowData.notes && (
                <div className="bg-card border border-border rounded-lg p-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    Notes
                  </h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rowData.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
