'use client'

/**
 * FmsShipLegDrawer — Detail view for a SHIP leg.
 *
 * Receives all data directly from the TransportView row — no secondary fetch needed.
 */

import * as React from 'react'
import { Ship, MapPin, Clock, FileText, Anchor, Hash, AlertTriangle } from 'lucide-react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Badge } from '@open-mercato/ui/primitives/badge'

// ─── Types ────────────────────────────────────────────────────

export interface ShipRowData {
  containerNumber?: string | null
  containerType?: string | null
  commodityDescription?: string | null
  grossWeight?: string | null
  weightUnit?: string | null
  packageCount?: number | null
  isHazardous?: boolean | null
  originName?: string | null
  destinationName?: string | null
  carrierName?: string | null
  bookingNumber?: string | null
  legBlNumber?: string | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  gateInCutoff?: string | null
  documentationCutoff?: string | null
  vgmCutoff?: string | null
  dangerousGoodsCutoff?: string | null
  demFreeTime?: number | null
  detFreeTime?: number | null
  sealNumber?: string | null
  blNumber?: string | null
  etd?: string | null
  eta?: string | null
  atd?: string | null
  ata?: string | null
  notes?: string | null
}

export interface FmsShipLegDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rowData: ShipRowData | null
}

// ─── Helpers ──────────────────────────────────────────────────

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

// ─── Sub-sections ─────────────────────────────────────────────

function VesselCard({ row }: { row: ShipRowData }) {
  if (!row.vesselName && !row.vesselImo && !row.voyageNumber) return null
  return (
    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <Ship className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        Vessel
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {row.vesselName && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Vessel Name</div>
            <div className="text-sm font-semibold text-foreground">{row.vesselName}</div>
          </div>
        )}
        {row.voyageNumber && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Voyage</div>
            <div className="font-mono text-sm font-semibold text-foreground">{row.voyageNumber}</div>
          </div>
        )}
        {row.vesselImo && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">IMO</div>
            <div className="font-mono text-sm text-foreground">{row.vesselImo}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function BookingCard({ row }: { row: ShipRowData }) {
  if (!row.bookingNumber && !row.legBlNumber) return null
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4" />
        Documents
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {row.bookingNumber && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Booking #</div>
            <div className="font-mono text-sm text-foreground">{row.bookingNumber}</div>
          </div>
        )}
        {row.legBlNumber && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Master B/L</div>
            <div className="font-mono text-sm text-foreground">{row.legBlNumber}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function CutoffCard({ row }: { row: ShipRowData }) {
  const hasCutoffs = row.gateInCutoff || row.documentationCutoff || row.vgmCutoff || row.dangerousGoodsCutoff
  if (!hasCutoffs) return null
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4" />
        Cut-offs
      </h3>
      <div className="space-y-2">
        {row.gateInCutoff && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">Gate-in</span>
            <span className="text-xs font-mono text-foreground">{formatTs(row.gateInCutoff)}</span>
          </div>
        )}
        {row.documentationCutoff && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">Documentation</span>
            <span className="text-xs font-mono text-foreground">{formatTs(row.documentationCutoff)}</span>
          </div>
        )}
        {row.vgmCutoff && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">VGM</span>
            <span className="text-xs font-mono text-foreground">{formatTs(row.vgmCutoff)}</span>
          </div>
        )}
        {row.dangerousGoodsCutoff && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Dangerous Goods
            </span>
            <span className="text-xs font-mono text-foreground">{formatTs(row.dangerousGoodsCutoff)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function FreeTimeCard({ row }: { row: ShipRowData }) {
  if (row.demFreeTime == null && row.detFreeTime == null) return null
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <Hash className="w-4 h-4" />
        Free Time
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {row.demFreeTime != null && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">DEM (Demurrage)</div>
            <div className="text-sm font-semibold text-foreground">{row.demFreeTime} <span className="font-normal text-muted-foreground">days</span></div>
          </div>
        )}
        {row.detFreeTime != null && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">DET (Detention)</div>
            <div className="text-sm font-semibold text-foreground">{row.detFreeTime} <span className="font-normal text-muted-foreground">days</span></div>
          </div>
        )}
      </div>
    </div>
  )
}

function CargoCard({ row }: { row: ShipRowData }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <Anchor className="w-4 h-4" />
        Cargo
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {row.containerNumber && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Container #</div>
            <div className="font-mono text-sm font-semibold text-foreground">{row.containerNumber}</div>
          </div>
        )}
        {row.containerType && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Type</div>
            <div className="text-sm text-foreground">{row.containerType}</div>
          </div>
        )}
        {row.sealNumber && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Seal #</div>
            <div className="font-mono text-sm text-foreground">{row.sealNumber}</div>
          </div>
        )}
        {row.blNumber && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">House B/L</div>
            <div className="font-mono text-sm text-foreground">{row.blNumber}</div>
          </div>
        )}
        {row.grossWeight && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Gross Weight</div>
            <div className="text-sm text-foreground">{row.grossWeight} {row.weightUnit ?? 'kg'}</div>
          </div>
        )}
        {row.isHazardous && (
          <div className="col-span-2">
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Hazardous
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Drawer ──────────────────────────────────────────────

export function FmsShipLegDrawer({ open, onOpenChange, rowData }: FmsShipLegDrawerProps) {
  if (!rowData) return null

  const origin = parseName(rowData.originName)
  const destination = parseName(rowData.destinationName)
  const carrier = parseName(rowData.carrierName)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <div className="space-y-4 pb-6">
          {/* Header */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Ship className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold text-foreground text-lg">Sea Leg</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="font-medium text-foreground">{origin}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium text-foreground">{destination}</span>
            </div>
            {carrier !== '-' && (
              <div className="mt-1 text-xs text-muted-foreground">
                Carrier: <span className="text-foreground">{carrier}</span>
              </div>
            )}
          </div>

          <VesselCard row={rowData} />
          <BookingCard row={rowData} />
          <CutoffCard row={rowData} />
          <FreeTimeCard row={rowData} />
          <CargoCard row={rowData} />

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
      </SheetContent>
    </Sheet>
  )
}
