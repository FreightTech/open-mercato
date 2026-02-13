'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'

interface AirCargoRow {
  id: string
  name: string
  numberOfPieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  actualWeightKg: string
  chargeableWeightKg: string
}

interface RfqData {
  id: string
  name: string
  salesStage: string
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  shipmentReadyDate: string | null
  requiredAtDestinationDate: string | null
  product: string | null
  commodity: string | null
  totalPieces: number
  totalVolume: string
  totalActualWeight: string
  totalChargeableWeight: string
}

interface RfqDetailDrawerProps {
  rfq: RfqData | null
  airCargo: AirCargoRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SALES_STAGE_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  received: 'outline',
  offer_sent: 'secondary',
  offer_accepted: 'default',
  closed_lost: 'destructive',
}

const SALES_STAGE_LABELS: Record<string, string> = {
  received: 'Received',
  offer_sent: 'Offer Sent',
  offer_accepted: 'Accepted',
  closed_lost: 'Closed/Lost',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

function formatDimensions(length: string | null, width: string | null, height: string | null): string {
  if (!length && !width && !height) return '-'
  const l = length || '?'
  const w = width || '?'
  const h = height || '?'
  return `${l}x${w}x${h}`
}

function formatNumber(value: string | number, decimals: number = 2): string {
  if (value === null || value === undefined) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function RfqDetailDrawer({ rfq, airCargo, open, onOpenChange }: RfqDetailDrawerProps) {
  const router = useRouter()

  if (!rfq) return null

  const handleViewRfq = () => {
    router.push('/backend/frc-rfqs')
    onOpenChange(false)
  }

  const routeDisplay = [
    rfq.originAirport?.code,
    rfq.destinationAirport?.code,
  ].filter(Boolean).join(' → ') || '-'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto" ariaTitle="Opportunity Details">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <SheetTitle className="text-lg">{rfq.name}</SheetTitle>
              <div className="mt-1">
                <Badge variant={SALES_STAGE_COLORS[rfq.salesStage] ?? 'secondary'}>
                  {SALES_STAGE_LABELS[rfq.salesStage] || rfq.salesStage}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Route</p>
              <p className="font-mono text-sm">{routeDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Product</p>
              <p className="text-sm">{rfq.product || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ready Date</p>
              <p className="text-sm">{formatDate(rfq.shipmentReadyDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Required Date</p>
              <p className="text-sm">{formatDate(rfq.requiredAtDestinationDate)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Commodity</p>
              <p className="text-sm">{rfq.commodity || '-'}</p>
            </div>
          </div>

          {/* Totals Section */}
          <div>
            <h4 className="text-sm font-medium mb-2">Totals</h4>
            <div className="bg-muted/50 rounded-md p-3 grid grid-cols-2 gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pieces</span>
                <span>{rfq.totalPieces}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Volume</span>
                <span>{formatNumber(rfq.totalVolume)} m³</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Actual Weight</span>
                <span>{formatNumber(rfq.totalActualWeight)} kg</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Chg. Weight</span>
                <span>{formatNumber(rfq.totalChargeableWeight)} kg</span>
              </div>
            </div>
          </div>

          {/* Air Cargo Section */}
          <div>
            <h4 className="text-sm font-medium mb-2">Air Cargo ({airCargo.length})</h4>
            {airCargo.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cargo items defined</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Name</TableHead>
                      <TableHead className="w-[50px]">Pcs</TableHead>
                      <TableHead className="w-[100px]">Dims (cm)</TableHead>
                      <TableHead className="w-[70px]">Vol m³</TableHead>
                      <TableHead className="w-[70px]">Wt kg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {airCargo.map((cargo) => (
                      <TableRow key={cargo.id}>
                        <TableCell className="text-xs truncate max-w-[100px]" title={cargo.name}>
                          {cargo.name}
                        </TableCell>
                        <TableCell className="text-xs">{cargo.numberOfPieces}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDimensions(cargo.lengthCm, cargo.widthCm, cargo.heightCm)}
                        </TableCell>
                        <TableCell className="text-xs">{formatNumber(cargo.volumeM3)}</TableCell>
                        <TableCell className="text-xs">{formatNumber(cargo.actualWeightKg)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t pt-4">
          <Button variant="outline" onClick={handleViewRfq} className="w-full">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Opportunities
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
