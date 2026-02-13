'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Eye, FolderOpen, Truck, Plane, Package, Route } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AddConsoleDialog } from '../../../components/AddConsoleDialog'
import { OfferDetailDrawer } from '../../../components/OfferDetailDrawer'
import { RfqDetailDrawer } from '../../../components/RfqDetailDrawer'

// Types for extended project detail API response
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

interface ProjectDetail {
  id: string
  projectNumber: string
  rfqId: string | null
  rfqName: string | null
  offerId: string | null
  offerName: string | null
  accountId: string | null
  status: string
  totalValue: string | null
  currencyCode: string
  createdAt: string
  updatedAt: string
  awbNumber: string | null
  offer: OfferData | null
  rfq: RfqData | null
  airCargo: AirCargoRow[]
  airRouting: AirRoutingRow[]
}

interface ConsoleRow {
  id: string
  name: string
  date: string
  status: string
  truckPresetId: string
  truck: { id: string; name: string } | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
}

const PROJECT_STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
}

const CONSOLE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planning: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  loaded: { bg: '#d1fae5', text: '#065f46' },
  completed: { bg: '#e5e7eb', text: '#374151' },
}

const OFFER_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#f3f4f6', text: '#374151' },
  sent: { bg: '#dbeafe', text: '#1e40af' },
  booked: { bg: '#dcfce7', text: '#166534' },
  rejected: { bg: '#fee2e2', text: '#991b1b' },
  expired: { bg: '#fef3c7', text: '#92400e' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
}

const ROUTING_TYPE_LABELS: Record<string, string> = {
  direct_flight: 'Direct',
  connection: 'Connection',
  truck_connection: 'Truck',
}

type DetailPageProps = {
  params?: { id?: string }
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

function formatNumber(value: string | number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function FrcProjectDetailPage({ params: propsParams }: DetailPageProps) {
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showAddConsole, setShowAddConsole] = useState(false)
  const [showOfferDrawer, setShowOfferDrawer] = useState(false)
  const [showRfqDrawer, setShowRfqDrawer] = useState(false)

  // Get projectId from props params (passed by catch-all route) or fallback to useParams
  const projectId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  // Fetch project details
  const { data: project, isLoading: isLoadingProject } = useQuery({
    queryKey: ['frc_project', projectId],
    queryFn: async () => {
      const call = await apiCall<ProjectDetail>(`/api/frc_projects/projects/${projectId}`)
      if (!call.ok) throw new Error('Failed to load project')
      return call.result
    },
    enabled: !!projectId,
  })

  // Fetch consoles for this project
  const { data: consolesData, isLoading: isLoadingConsoles, refetch: refetchConsoles } = useQuery({
    queryKey: ['frc_console', 'project', projectId],
    queryFn: async () => {
      const call = await apiCall<{ items: ConsoleRow[]; total: number }>(
        `/api/frc_console/console?projectId=${projectId}&limit=100`
      )
      if (!call.ok) throw new Error('Failed to load consoles')
      return call.result ?? { items: [], total: 0 }
    },
    enabled: !!projectId,
  })

  const handleViewConsole = useCallback((consoleId: string) => {
    router.push(`/backend/frc-console/${consoleId}`)
  }, [router])

  const handleAddConsoleSuccess = useCallback(() => {
    setShowAddConsole(false)
    refetchConsoles()
    queryClient.invalidateQueries({ queryKey: ['frc_console'] })
  }, [refetchConsoles, queryClient])

  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/backend/frc-projects')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{project.projectNumber}</h1>
            <Badge variant={PROJECT_STATUS_COLORS[project.status] ?? 'secondary'}>
              {project.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {project.rfqName && <span>Opportunity: {project.rfqName}</span>}
            {project.offerName && <span> | Offer: {project.offerName}</span>}
          </p>
        </div>
      </div>

      {/* Project Info Card */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Project Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Project Number</p>
              <p className="font-mono">{project.projectNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="capitalize">{project.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AWB Number</p>
              <p className="font-mono">{project.awbNumber || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Value</p>
              <p>{project.totalValue ? `${formatNumber(project.totalValue)} ${project.currencyCode}` : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p>{formatDate(project.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Offers Section */}
      {project.offer && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Offer</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[120px]">AWB</TableHead>
                    <TableHead className="w-[100px]">Departure</TableHead>
                    <TableHead className="w-[120px]">Total Rate</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setShowOfferDrawer(true)}
                  >
                    <TableCell className="font-medium">{project.offer.name}</TableCell>
                    <TableCell>
                      <span
                        className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                        style={{
                          backgroundColor: OFFER_STATUS_COLORS[project.offer.status]?.bg ?? '#f3f4f6',
                          color: OFFER_STATUS_COLORS[project.offer.status]?.text ?? '#374151',
                        }}
                      >
                        {project.offer.status}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{project.offer.awbNumber || '-'}</TableCell>
                    <TableCell>{formatDate(project.offer.departureDate)}</TableCell>
                    <TableCell>
                      {project.offer.totalRate
                        ? `${formatNumber(project.offer.totalRate)} ${project.offer.currencyCode}`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowOfferDrawer(true)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Air Cargo Section */}
      {project.airCargo.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Air Cargo ({project.airCargo.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Name</TableHead>
                    <TableHead className="w-[60px]">Pieces</TableHead>
                    <TableHead className="w-[120px]">Dimensions (cm)</TableHead>
                    <TableHead className="w-[80px]">Volume m³</TableHead>
                    <TableHead className="w-[100px]">Actual kg</TableHead>
                    <TableHead className="w-[100px]">Chg. kg</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.airCargo.map((cargo) => (
                    <TableRow
                      key={cargo.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setShowRfqDrawer(true)}
                    >
                      <TableCell className="font-medium truncate max-w-[150px]" title={cargo.name}>
                        {cargo.name}
                      </TableCell>
                      <TableCell>{cargo.numberOfPieces}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatDimensions(cargo.lengthCm, cargo.widthCm, cargo.heightCm)}
                      </TableCell>
                      <TableCell>{formatNumber(cargo.volumeM3)}</TableCell>
                      <TableCell>{formatNumber(cargo.actualWeightKg)}</TableCell>
                      <TableCell>{formatNumber(cargo.chargeableWeightKg)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowRfqDrawer(true)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Air Routing Section */}
      {project.airRouting.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Air Routing ({project.airRouting.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Name</TableHead>
                    <TableHead className="w-[80px]">Type</TableHead>
                    <TableHead className="w-[80px]">Flight #</TableHead>
                    <TableHead className="w-[60px]">From</TableHead>
                    <TableHead className="w-[60px]">To</TableHead>
                    <TableHead className="w-[120px]">Departure</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.airRouting.map((routing) => (
                    <TableRow
                      key={routing.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setShowOfferDrawer(true)}
                    >
                      <TableCell className="font-medium truncate max-w-[150px]" title={routing.name}>
                        {routing.name}
                      </TableCell>
                      <TableCell>{ROUTING_TYPE_LABELS[routing.type] || routing.type}</TableCell>
                      <TableCell className="font-mono text-sm">{routing.flightNumber || '-'}</TableCell>
                      <TableCell className="font-mono">{routing.originAirport?.code || '-'}</TableCell>
                      <TableCell className="font-mono">{routing.destinationAirport?.code || '-'}</TableCell>
                      <TableCell>
                        {formatDate(routing.departureDate)}
                        {routing.departureTime && ` ${routing.departureTime}`}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowOfferDrawer(true)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Consoles Section */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">
                Truck Loading Consoles ({consolesData?.items.length ?? 0})
              </CardTitle>
            </div>
            <Button size="sm" onClick={() => setShowAddConsole(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Console
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoadingConsoles ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : consolesData?.items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No consoles for this project. Click &quot;Add Console&quot; to create one.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead className="w-[120px]">Truck</TableHead>
                    <TableHead className="w-[150px]">Route</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consolesData?.items.map((console_) => (
                    <TableRow
                      key={console_.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewConsole(console_.id)}
                    >
                      <TableCell className="font-medium">{console_.name}</TableCell>
                      <TableCell>{formatDate(console_.date)}</TableCell>
                      <TableCell>{console_.truck?.name ?? '-'}</TableCell>
                      <TableCell>
                        {console_.originAirport?.code ?? '?'} - {console_.destinationAirport?.code ?? '?'}
                      </TableCell>
                      <TableCell>
                        <span
                          className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                          style={{
                            backgroundColor: CONSOLE_STATUS_COLORS[console_.status]?.bg ?? '#f3f4f6',
                            color: CONSOLE_STATUS_COLORS[console_.status]?.text ?? '#374151',
                          }}
                        >
                          {console_.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewConsole(console_.id)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Console Dialog */}
      <AddConsoleDialog
        projectId={projectId ?? ''}
        open={showAddConsole}
        onOpenChange={setShowAddConsole}
        onSuccess={handleAddConsoleSuccess}
      />

      {/* Offer Detail Drawer */}
      <OfferDetailDrawer
        offer={project.offer}
        airRouting={project.airRouting}
        open={showOfferDrawer}
        onOpenChange={setShowOfferDrawer}
      />

      {/* RFQ Detail Drawer */}
      <RfqDetailDrawer
        rfq={project.rfq}
        airCargo={project.airCargo}
        open={showRfqDrawer}
        onOpenChange={setShowRfqDrawer}
      />
    </div>
  )
}
