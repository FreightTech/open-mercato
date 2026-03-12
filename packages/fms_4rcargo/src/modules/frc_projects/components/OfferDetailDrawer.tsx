'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Plane } from 'lucide-react'
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

interface AirRoutingRow {
  id: string
  name: string
  type: string
  flightNumber: string | null
  originAirport: { id: string; code: string } | null
  destinationAirport: { id: string; code: string } | null
  departureDate: string | null
  departureTime: string | null
  arrivalDate: string | null
  arrivalTime: string | null
}

interface OfferData {
  id: string
  name: string
  status: string
  awbNumber: string | null
  departureDate: string | null
  connectionMethod: string | null
  connectionRateTotal: string | null
  airfreightRateTotal: string | null
  totalRate: string | null
  currencyCode: string
}

interface OfferDetailDrawerProps {
  offer: OfferData | null
  airRouting: AirRoutingRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'secondary',
  booked: 'default',
  rejected: 'destructive',
  expired: 'destructive',
  cancelled: 'destructive',
}

const ROUTING_TYPE_LABELS: Record<string, string> = {
  direct_flight: 'Direct Flight',
  connection: 'Connection',
  truck_connection: 'Truck Connection',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

function formatCurrency(value: string | null, currency: string): string {
  if (!value) return '-'
  const num = parseFloat(value)
  if (isNaN(num)) return value
  return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

export function OfferDetailDrawer({ offer, airRouting, open, onOpenChange }: OfferDetailDrawerProps) {
  const router = useRouter()

  if (!offer) return null

  const handleViewOffer = () => {
    router.push(`/backend/frc-offers?id=${offer.id}`)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto" ariaTitle="Offer Details">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <Plane className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <SheetTitle className="text-lg">{offer.name}</SheetTitle>
              <div className="mt-1">
                <Badge variant={STATUS_COLORS[offer.status] ?? 'secondary'}>
                  {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">AWB Number</p>
              <p className="font-mono text-sm">{offer.awbNumber || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Departure Date</p>
              <p className="text-sm">{formatDate(offer.departureDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Connection Method</p>
              <p className="text-sm">{offer.connectionMethod || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Currency</p>
              <p className="text-sm">{offer.currencyCode}</p>
            </div>
          </div>

          {/* Rates Section */}
          <div>
            <h4 className="text-sm font-medium mb-2">Rates</h4>
            <div className="bg-muted/50 rounded-md p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Connection</span>
                <span>{formatCurrency(offer.connectionRateTotal, offer.currencyCode)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Airfreight</span>
                <span>{formatCurrency(offer.airfreightRateTotal, offer.currencyCode)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t pt-2">
                <span>Total</span>
                <span>{formatCurrency(offer.totalRate, offer.currencyCode)}</span>
              </div>
            </div>
          </div>

          {/* Air Routing Section */}
          <div>
            <h4 className="text-sm font-medium mb-2">Air Routing ({airRouting.length})</h4>
            {airRouting.length === 0 ? (
              <p className="text-sm text-muted-foreground">No routing defined</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Type</TableHead>
                      <TableHead className="w-[70px]">Flight</TableHead>
                      <TableHead className="w-[60px]">From</TableHead>
                      <TableHead className="w-[60px]">To</TableHead>
                      <TableHead className="w-[90px]">Departure</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {airRouting.map((routing) => (
                      <TableRow key={routing.id}>
                        <TableCell className="text-xs">
                          {ROUTING_TYPE_LABELS[routing.type] || routing.type}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {routing.flightNumber || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {routing.originAirport?.code || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {routing.destinationAirport?.code || '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(routing.departureDate)}
                          {routing.departureTime && ` ${routing.departureTime}`}
                        </TableCell>
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
          <Button variant="outline" onClick={handleViewOffer} className="w-full">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Offer
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
