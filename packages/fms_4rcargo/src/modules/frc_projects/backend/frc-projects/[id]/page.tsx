'use client'

import * as React from 'react'
import { useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileText, Building2, Package, Plane, Route, Truck, Plus, Box, FileQuestion } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

// Import CollapsibleSection from frc_offers module
import { CollapsibleSection } from '../../../../frc_offers/components/CollapsibleSection'

// Import components
import { ProjectHeaderCard, type ProjectHeaderData } from '../../../components/ProjectHeaderCard'
import { ProjectDetailsEditTable, type ProjectDetailsData } from '../../../components/ProjectDetailsEditTable'
import { ProjectCustomerSection } from '../../../components/ProjectCustomerSection'
import {
  ProjectCargoAssignmentTable,
  type ProjectCargoAssignmentTableHandle,
} from '../../../components/ProjectCargoAssignmentTable'
import { ProjectConsolesSection } from '../../../components/ProjectConsolesSection'
import {
  ProjectTruckVisualizationSection,
  type ConsoleForVisualization,
} from '../../../components/ProjectTruckVisualizationSection'
import { ProjectOfferTable, type OfferData } from '../../../components/ProjectOfferTable'
import { ProjectOpportunityTable, type OpportunityData } from '../../../components/ProjectOpportunityTable'
import {
  ProjectRoutingLegsTable,
  type AirRoutingRow,
  type ConsoleData,
} from '../../../components/ProjectRoutingLegsTable'

// Drawers for offer and RFQ details
import { OfferDetailDrawer } from '../../../components/OfferDetailDrawer'
import { RfqDetailDrawer } from '../../../components/RfqDetailDrawer'

// Console Wizard
import { ConsoleWizardDrawer } from '../../../../frc_console/components/ConsoleWizard/ConsoleWizardDrawer'

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
  originAirportId: string | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirportId: string | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  shipmentReadyDate: string | null
  requiredDeliveryDate: string | null
  awbNumbers: string[]
  notes: string | null
  offer: OfferData | null
  rfq: RfqData | null
  airCargo: AirCargoRow[]
  airRouting: AirRoutingRow[]
}

type DetailPageProps = {
  params?: { id?: string }
}

export default function FrcProjectDetailPage({ params: propsParams }: DetailPageProps) {
  const t = useT()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  // State for drawers
  const [showOfferDrawer, setShowOfferDrawer] = useState(false)
  const [showRfqDrawer, setShowRfqDrawer] = useState(false)
  const [showConsoleWizard, setShowConsoleWizard] = useState(false)
  const [consoleWizardRoutingId, setConsoleWizardRoutingId] = useState<string | null>(null)

  // Table refs
  const detailsTableRef = useRef<HTMLDivElement>(null)
  const cargoTableRef = useRef<ProjectCargoAssignmentTableHandle>(null)
  const offerTableRef = useRef<HTMLDivElement>(null)
  const routingTableRef = useRef<HTMLDivElement>(null)

  // Get projectId from props params (passed by catch-all route) or fallback to useParams
  const projectId =
    propsParams?.id ??
    routerParams?.id ??
    (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  // Fetch project details
  const {
    data: project,
    isLoading: isLoadingProject,
    refetch: refetchProject,
  } = useQuery({
    queryKey: ['frc_project', projectId],
    queryFn: async () => {
      const call = await apiCall<ProjectDetail>(`/api/frc_projects/projects/${projectId}`)
      if (!call.ok) throw new Error('Failed to load project')
      return call.result
    },
    enabled: !!projectId,
  })

  // Fetch consoles for this project (full data for visualization and routing)
  interface ConsoleListItem extends ConsoleData {
    date: string
    truckId: string | null
    truckName: string | null
    truckPresetId: string | null
    originAirportId: string | null
    originAirportCode: string | null
    destinationAirportId: string | null
    destinationAirportCode: string | null
  }

  const { data: consolesData, refetch: refetchConsoles } = useQuery({
    queryKey: ['frc_project_consoles', projectId],
    queryFn: async () => {
      const call = await apiCall<{ items: ConsoleListItem[] }>(
        `/api/frc_console/console?projectId=${projectId}&limit=100`
      )
      if (!call.ok) return []
      return call.result?.items ?? []
    },
    enabled: !!projectId,
  })

  const consoles = consolesData ?? []

  // Transform consoles for visualization
  const consolesForVisualization: ConsoleForVisualization[] = useMemo(() => {
    return consoles.map((c) => ({
      id: c.id,
      name: c.name,
      date: c.date,
      truckPresetId: c.truckPresetId,
      truck: c.truckId ? { id: c.truckId, name: c.truckName ?? '' } : null,
      originAirport: c.originAirportId ? { id: c.originAirportId, code: c.originAirportCode ?? '' } : null,
      destinationAirport: c.destinationAirportId
        ? { id: c.destinationAirportId, code: c.destinationAirportCode ?? '' }
        : null,
    }))
  }, [consoles])

  // Handler for project field save
  const handleFieldSave = useCallback(
    async (field: string, value: unknown) => {
      if (!projectId) return

      const response = await apiCall(`/api/frc_projects/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })

      if (!response.ok) {
        const errorResult = response.result as { error?: string } | undefined
        throw new Error(errorResult?.error || 'Failed to update')
      }

      flash(t('frc_projects.detail.updated', 'Project updated'), 'success')
      queryClient.invalidateQueries({ queryKey: ['frc_project', projectId] })
    },
    [projectId, queryClient, t]
  )

  // Handler for customer change
  const handleCustomerChange = useCallback(
    async (accountId: string | null) => {
      await handleFieldSave('accountId', accountId)
    },
    [handleFieldSave]
  )

  // Handler for project delete
  const handleDelete = useCallback(async () => {
    if (!projectId) return

    const response = await apiCall(`/api/frc_projects/projects/${projectId}`, {
      method: 'DELETE',
    })

    if (response.ok) {
      flash(t('frc_projects.detail.deleted', 'Project deleted'), 'success')
      queryClient.invalidateQueries({ queryKey: ['frc_project'] })
      router.push('/backend/frc-projects')
    } else {
      const errorResult = response.result as { error?: string } | undefined
      flash(errorResult?.error || t('frc_projects.detail.deleteError', 'Failed to delete'), 'error')
    }
  }, [projectId, queryClient, router, t])

  // Handler for project activate/deactivate toggle
  const handleActiveToggle = useCallback(async () => {
    if (!project) return

    const newStatus = project.status === 'active' ? 'cancelled' : 'active'

    const response = await apiCall(`/api/frc_projects/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    if (!response.ok) {
      const errorResult = response.result as { error?: string } | undefined
      flash(errorResult?.error || t('frc_projects.detail.statusUpdateFailed', 'Failed to update status'), 'error')
      return
    }

    flash(
      newStatus === 'active'
        ? t('frc_projects.detail.activated', 'Project activated')
        : t('frc_projects.detail.deactivated', 'Project deactivated'),
      'success'
    )
    queryClient.invalidateQueries({ queryKey: ['frc_project', projectId] })
  }, [project, projectId, queryClient, t])

  // Handler for routing leg update
  const handleRoutingUpdate = useCallback(
    async (legId: string, field: string, value: unknown) => {
      if (!project?.offerId) return

      const response = await apiCall(`/api/frc_offers/offers/${project.offerId}/routing/${legId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })

      if (!response.ok) {
        const errorResult = response.result as { error?: string } | undefined
        throw new Error(errorResult?.error || 'Failed to update routing')
      }

      queryClient.invalidateQueries({ queryKey: ['frc_project', projectId] })
    },
    [project?.offerId, projectId, queryClient]
  )

  // Handler for console assignment to routing leg
  const handleConsoleAssign = useCallback(
    async (consoleId: string, routingLegId: string | null) => {
      const response = await apiCall(`/api/frc_console/console/${consoleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airRoutingId: routingLegId }),
      })

      if (!response.ok) {
        const errorResult = response.result as { error?: string } | undefined
        flash(errorResult?.error || 'Failed to assign console', 'error')
        return
      }

      flash(
        routingLegId
          ? t('frc_projects.detail.routing.consoleAssigned', 'Console assigned to routing leg')
          : t('frc_projects.detail.routing.consoleUnassigned', 'Console unassigned'),
        'success'
      )
      refetchConsoles()
    },
    [t, refetchConsoles]
  )

  // Handler for creating new console from routing leg
  const handleCreateConsoleForLeg = useCallback((routingLegId: string) => {
    setConsoleWizardRoutingId(routingLegId)
    setShowConsoleWizard(true)
  }, [])

  // Handler for console created
  const handleConsoleCreated = useCallback(async () => {
    setShowConsoleWizard(false)
    setConsoleWizardRoutingId(null)
    refetchConsoles()
  }, [refetchConsoles])

  // Loading state
  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  // Not found state
  if (!project) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">{t('frc_projects.detail.notFound', 'Project not found')}</p>
      </div>
    )
  }

  // Prepare data for components
  const headerData: ProjectHeaderData = {
    id: project.id,
    projectNumber: project.projectNumber,
    status: project.status,
    rfqName: project.rfqName,
    offerName: project.offerName,
    originAirport: project.originAirport,
    destinationAirport: project.destinationAirport,
    createdAt: project.createdAt,
  }

  const detailsData: ProjectDetailsData = {
    id: project.id,
    totalValue: project.totalValue,
    currencyCode: project.currencyCode,
    originAirportId: project.originAirportId,
    originAirport: project.originAirport,
    destinationAirportId: project.destinationAirportId,
    destinationAirport: project.destinationAirport,
    shipmentReadyDate: project.shipmentReadyDate,
    requiredDeliveryDate: project.requiredDeliveryDate,
    awbNumbers: project.awbNumbers ?? [],
    notes: project.notes,
  }

  return (
    <div className="p-4 space-y-6 max-w-7xl mx-auto">
      {/* Back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/backend/frc-projects')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('frc_projects.detail.back', 'Back')}
        </Button>
      </div>

      {/* Header Card */}
      <ProjectHeaderCard project={headerData} onDelete={handleDelete} onDeactivate={handleActiveToggle} />

      {/* Project Details Section */}
      <CollapsibleSection
        title={t('frc_projects.detail.sections.details', 'Project Details')}
        icon={FileText}
        defaultOpen={true}
      >
        <ProjectDetailsEditTable
          projectId={project.id}
          data={detailsData}
          onFieldSave={handleFieldSave}
          tableRef={detailsTableRef}
        />
      </CollapsibleSection>

      {/* Customer Section */}
      <CollapsibleSection
        title={t('frc_projects.detail.sections.customer', 'Customer')}
        icon={Building2}
        defaultOpen={true}
      >
        <ProjectCustomerSection
          projectId={project.id}
          accountId={project.accountId}
          onCustomerChange={handleCustomerChange}
        />
      </CollapsibleSection>

      {/* Cargo Assignment Section */}
      <CollapsibleSection
        title={t('frc_projects.detail.sections.cargoAssignment', 'Cargo Assignment')}
        icon={Package}
        defaultOpen={true}
        actions={
          project.rfqId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cargoTableRef.current?.addRow()}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              {t('frc_projects.detail.cargo.addCargo', 'Add Cargo')}
            </Button>
          ) : undefined
        }
      >
        <ProjectCargoAssignmentTable ref={cargoTableRef} projectId={project.id} rfqId={project.rfqId} />
      </CollapsibleSection>

      {/* Opportunity Section */}
      {project.rfq && (
        <CollapsibleSection
          title={t('frc_projects.detail.sections.opportunity', 'Opportunity')}
          icon={FileQuestion}
          defaultOpen={true}
        >
          <ProjectOpportunityTable opportunity={project.rfq} />
        </CollapsibleSection>
      )}

      {/* Offer Section */}
      {project.offer && (
        <CollapsibleSection
          title={t('frc_projects.detail.sections.offer', 'Offer')}
          icon={Plane}
          defaultOpen={true}
        >
          <ProjectOfferTable
            offer={project.offer}
            tableRef={offerTableRef}
          />
        </CollapsibleSection>
      )}

      {/* Routing Legs Section */}
      {project.airRouting.length > 0 && project.offerId && (
        <CollapsibleSection
          title={t('frc_projects.detail.sections.routingLegs', 'Routing Legs')}
          icon={Route}
          count={project.airRouting.length}
          defaultOpen={true}
        >
          <ProjectRoutingLegsTable
            projectId={project.id}
            offerId={project.offerId}
            routingLegs={project.airRouting}
            consoles={consoles}
            onRoutingUpdate={handleRoutingUpdate}
            onConsoleAssign={handleConsoleAssign}
            onCreateConsole={handleCreateConsoleForLeg}
            onViewOffer={() => setShowOfferDrawer(true)}
            tableRef={routingTableRef}
          />
        </CollapsibleSection>
      )}

      {/* Truck Loading Consoles Section */}
      <CollapsibleSection
        title={t('frc_projects.detail.sections.consoles', 'Truck Loading Consoles')}
        icon={Truck}
        defaultOpen={true}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConsoleWizard(true)}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            {t('frc_projects.detail.consoles.create', 'Create Console')}
          </Button>
        }
      >
        <ProjectConsolesSection projectId={project.id} onCreateConsole={() => refetchConsoles()} />
      </CollapsibleSection>

      {/* Truck Visualization Section */}
      {consolesForVisualization.length > 0 && (
        <CollapsibleSection
          title={t('frc_projects.detail.sections.truckVisualization', 'Truck Visualization')}
          icon={Box}
          count={consolesForVisualization.filter((c) => c.truckPresetId).length}
          defaultOpen={false}
        >
          <ProjectTruckVisualizationSection
            projectId={project.id}
            consoles={consolesForVisualization}
          />
        </CollapsibleSection>
      )}

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

      {/* Console Wizard Drawer */}
      <ConsoleWizardDrawer
        open={showConsoleWizard}
        onClose={() => {
          setShowConsoleWizard(false)
          setConsoleWizardRoutingId(null)
        }}
        onCreated={handleConsoleCreated}
        defaultProjectId={project.id}
        defaultAirRoutingId={consoleWizardRoutingId ?? undefined}
      />
    </div>
  )
}
