'use client'

/**
 * FmsTruckLegDrawer — Detail view for a TRUCK leg assignment.
 *
 * Receives all data directly from the TransportView row — no secondary fetch needed.
 */

import * as React from 'react'
import { Truck, MapPin, User, Phone, IdCard, Package, Clock, ArrowRight, FileText, AlertTriangle } from 'lucide-react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Badge } from '@open-mercato/ui/primitives/badge'

// ─── Types ───────────────────────────────────────────────────

export interface TruckRowData {
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
  bookingNumber?: string | null
  truckPlate?: string | null
  trailerPlate?: string | null
  driverFullName?: string | null
  driverIdNumber?: string | null
  driverPhone?: string | null
  ptd?: string | null
  etd?: string | null
  atd?: string | null
  pta?: string | null
  eta?: string | null
  ata?: string | null
  dropoffLocationName?: string | null
  dropoffTime?: string | null
  notes?: string | null
}

export interface FmsTruckLegDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rowData: TruckRowData | null
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

function delayDays(planned: string | null | undefined, actual: string | null | undefined): number | null {
  if (!planned || !actual) return null
  const diff = Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 86_400_000)
  return diff !== 0 ? diff : null
}

function DelayBadge({ days }: { days: number | null }) {
  if (days === null) return null
  return (
    <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
      days > 0
        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    }`}>
      {days > 0 ? `+${days}d` : `${days}d`}
    </span>
  )
}

// ─── Sub-sections ─────────────────────────────────────────────

function VehicleCard({ row }: { row: TruckRowData }) {
  if (!row.truckPlate && !row.trailerPlate) return null
  return (
    <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <Truck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
        Vehicle
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {row.truckPlate && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Truck Plate</div>
            <div className="font-mono text-sm font-semibold text-foreground bg-card border border-border rounded px-2 py-1 inline-block">
              {row.truckPlate}
            </div>
          </div>
        )}
        {row.trailerPlate && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Trailer Plate</div>
            <div className="font-mono text-sm font-semibold text-foreground bg-card border border-border rounded px-2 py-1 inline-block">
              {row.trailerPlate}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DriverCard({ row }: { row: TruckRowData }) {
  if (!row.driverFullName && !row.driverPhone && !row.driverIdNumber) return null
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <User className="w-4 h-4" />
        Driver
      </h3>
      <div className="space-y-2">
        {row.driverFullName && (
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-foreground">{row.driverFullName}</span>
          </div>
        )}
        {row.driverPhone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <a href={`tel:${row.driverPhone}`} className="text-blue-600 dark:text-blue-400 text-sm hover:underline">
              {row.driverPhone}
            </a>
          </div>
        )}
        {row.driverIdNumber && (
          <div className="flex items-center gap-2">
            <IdCard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-mono text-sm text-foreground">{row.driverIdNumber}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function JourneyCard({ row }: { row: TruckRowData }) {
  const origin = parseName(row.originName)
  const destination = parseName(row.destinationName)
  const carrier = parseName(row.carrierName)

  const departureDelay = delayDays(row.ptd ?? row.etd, row.atd)
  const arrivalDelay = delayDays(row.pta ?? row.eta, row.ata)

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4" />
        Journey
      </h3>

      {/* Route */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
        <div className="flex-1 text-center sm:text-right">
          <div className="font-semibold text-foreground">{origin}</div>
          {row.atd && <div className="text-xs text-muted-foreground">ATD: {formatTs(row.atd)}</div>}
          {!row.atd && row.etd && <div className="text-xs text-muted-foreground">ETD: {formatTs(row.etd)}</div>}
          {!row.atd && !row.etd && row.ptd && <div className="text-xs text-muted-foreground">PTD: {formatTs(row.ptd)}</div>}
        </div>
        <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 rotate-90 sm:rotate-0 mx-auto" />
        <div className="flex-1 text-center sm:text-left">
          <div className="font-semibold text-foreground">{destination}</div>
          {row.ata && <div className="text-xs text-muted-foreground">ATA: {formatTs(row.ata)}</div>}
          {!row.ata && row.eta && <div className="text-xs text-muted-foreground">ETA: {formatTs(row.eta)}</div>}
          {!row.ata && !row.eta && row.pta && <div className="text-xs text-muted-foreground">PTA: {formatTs(row.pta)}</div>}
        </div>
      </div>

      {/* Drop-off info */}
      {(row.dropoffLocationName || row.dropoffTime) && (
        <div className="flex items-start gap-2 mb-4 bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900 rounded-md px-3 py-2">
          <MapPin className="w-3.5 h-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            {row.dropoffLocationName && (
              <div className="text-foreground font-medium">Drop-off: {parseName(row.dropoffLocationName)}</div>
            )}
            {row.dropoffTime && (
              <div className="text-muted-foreground text-xs">Time: {formatTs(row.dropoffTime)}</div>
            )}
          </div>
        </div>
      )}

      {carrier !== '-' && (
        <div className="text-sm text-muted-foreground mb-2">Carrier: <span className="font-medium text-foreground">{carrier}</span></div>
      )}
      {row.bookingNumber && (
        <div className="text-sm text-muted-foreground">Booking: <span className="font-mono font-medium text-foreground">{row.bookingNumber}</span></div>
      )}

      {/* Timestamp timeline */}
      <div className="mt-4 border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Departure side */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Departure</div>
            <div className="space-y-1.5">
              {[
                { label: 'PTD', value: row.ptd },
                { label: 'ETD', value: row.etd, planned: row.ptd },
                { label: 'ATD', value: row.atd, planned: row.etd ?? row.ptd },
              ].map(({ label, value, planned }) => (
                <div key={label} className={`flex items-center justify-between text-xs rounded px-2 py-1 ${value ? 'bg-muted' : 'opacity-40'}`}>
                  <span className="text-muted-foreground w-8">{label}</span>
                  <span className={`font-medium ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {value ? formatTs(value) : '—'}
                    {label === 'ATD' && value && <DelayBadge days={delayDays(planned, value)} />}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* Arrival side */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Arrival</div>
            <div className="space-y-1.5">
              {[
                { label: 'PTA', value: row.pta },
                { label: 'ETA', value: row.eta, planned: row.pta },
                { label: 'ATA', value: row.ata, planned: row.eta ?? row.pta },
              ].map(({ label, value, planned }) => (
                <div key={label} className={`flex items-center justify-between text-xs rounded px-2 py-1 ${value ? 'bg-muted' : 'opacity-40'}`}>
                  <span className="text-muted-foreground w-8">{label}</span>
                  <span className={`font-medium ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {value ? formatTs(value) : '—'}
                    {label === 'ATA' && value && <DelayBadge days={delayDays(planned, value)} />}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {(departureDelay !== null || arrivalDelay !== null) && (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            {departureDelay !== null && (
              <span>Departure: <DelayBadge days={departureDelay} /></span>
            )}
            {arrivalDelay !== null && (
              <span>Arrival: <DelayBadge days={arrivalDelay} /></span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CargoCard({ row, isFCL }: { row: TruckRowData; isFCL: boolean }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <Package className="w-4 h-4" />
        Cargo
      </h3>
      <div className="space-y-1">
        {isFCL && row.containerNumber && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Container</span>
            <span className="font-mono font-semibold">{row.containerNumber}</span>
          </div>
        )}
        {isFCL && row.containerType && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Type</span>
            <span className="font-mono">{row.containerType}</span>
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
            <span className="text-muted-foreground">Packages</span>
            <span>{row.packageCount}</span>
          </div>
        )}
        {row.grossWeight && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Weight</span>
            <span>{row.grossWeight} {row.weightUnit ?? 'kg'}</span>
          </div>
        )}
        {row.isHazardous && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Hazardous goods
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function FmsTruckLegDrawer({ open, onOpenChange, rowData }: FmsTruckLegDrawerProps) {
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
              <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded">
                <Truck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">Truck Leg</h1>
            </div>
            {rowData?.truckPlate && (
              <p className="text-sm font-mono text-muted-foreground ml-9">{rowData.truckPlate}</p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!rowData ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data</div>
          ) : (
            <div className="space-y-4">
              <VehicleCard row={rowData} />
              <DriverCard row={rowData} />
              <JourneyCard row={rowData} />
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
