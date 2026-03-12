/**
 * FMS Projects Module - Detail View
 * Project detail page with redesigned DynamicTable-based layout
 */

'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useProjectWizard, type TransportModeType } from '../../../components/ProjectWizard/hooks/useProjectWizard'
import { ProjectFileDetailsTable } from '../../../components/ProjectWizard/ProjectFileDetailsTable'
import { ProjectRouteShippingTable } from '../../../components/ProjectWizard/ProjectRouteShippingTable'
import { ProjectFinancialsTable } from '../../../components/ProjectWizard/ProjectFinancialsTable'
import { ProjectShipmentStatusTable } from '../../../components/ProjectWizard/ProjectShipmentStatusTable'
import { ProjectPartiesTable } from '../../../components/ProjectWizard/ProjectPartiesTable'
import { ProjectCargoDescriptionSection } from '../../../components/ProjectWizard/ProjectCargoDescriptionSection'
import { ProjectBLInstructionsSection } from '../../../components/ProjectWizard/ProjectBLInstructionsSection'
import { SeaContainersTable } from '../../../components/SeaContainers'
import { ProjectRoadUnitsTable } from '../../../components/ProjectWizard/ProjectRoadUnitsTable'
import { ProjectCargoTable } from '../../../components/ProjectWizard/ProjectCargoTable'
import { ProjectDocumentsTable, type ProjectDocument } from '../../../components/ProjectWizard/ProjectDocumentsTable'
import { ProjectActivitySection } from '../../../components/ProjectWizard/ProjectActivitySection'
import { type BookingConfirmationExtraction } from '../../../components/ProjectWizard/types'
import { DocumentDetailPanel } from '../../../../fms_documents/components/DocumentDetailPanel'
import { UploadDocumentModal } from '../../../components/ProjectWizard/UploadDocumentModal'
import { ImportTrackingModal } from '../../../components/ProjectWizard/ImportTrackingModal'
import { ProductsCostsDrawer } from '../../../components/ProductsCostsDrawer'
import { OfferDetailDrawer } from '../../../../fms_offers/components/OfferDetailDrawer'

// Project line type for financials calculation
interface ProjectLine {
  id: string
  soldAmount: string
  actualCost?: string | null
  currencyCode?: string | null
}

type ProjectDetailPageProps = {
  params?: { id?: string }
}

export default function ProjectDetailPage({ params: propsParams }: ProjectDetailPageProps) {
  const routerParams = useParams<{ id?: string; slug?: string[] }>()

  // Get projectId from props params (passed by catch-all route) or fallback to useParams
  const projectId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  const [roadUnitsExpanded, setRoadUnitsExpanded] = useState(true)
  const [cargoExpanded, setCargoExpanded] = useState(true)

  // Transport modes multi-select state
  const [selectedTransportModes, setSelectedTransportModes] = useState<TransportModeType[]>([])
  const [transportModesInitialized, setTransportModesInitialized] = useState(false)

  // Table refs for cross-table arrow navigation
  const headerTableRef = useRef<HTMLDivElement>(null)
  const routeShippingTableRef = useRef<HTMLDivElement>(null)
  const financialsTableRef = useRef<HTMLDivElement>(null)
  const shipmentStatusTableRef = useRef<HTMLDivElement>(null)
  const partiesTableRef = useRef<HTMLDivElement>(null)
  const seaContainersTableRef = useRef<HTMLDivElement>(null)
  const roadUnitsTableRef = useRef<HTMLDivElement>(null)
  const cargoTableRef = useRef<HTMLDivElement>(null)
  const linesTableRef = useRef<HTMLDivElement>(null)
  const documentsTableRef = useRef<HTMLDivElement>(null)

  // Document modals state
  const [selectedDocument, setSelectedDocument] = useState<ProjectDocument | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

  // Offer drawer state
  const [showOfferDrawer, setShowOfferDrawer] = useState(false)

  // Products & Costs drawer state
  const [showProductsCostsDrawer, setShowProductsCostsDrawer] = useState(false)

  // Import tracking modal state
  const [showImportTrackingModal, setShowImportTrackingModal] = useState(false)

  // Apply to file loading state
  const [isApplyingToFile, setIsApplyingToFile] = useState(false)

  // Refresh tracking loading state
  const [isRefreshingTracking, setIsRefreshingTracking] = useState(false)

  // Query client for manual invalidation
  const queryClient = useQueryClient()

  // Handle successful import - refresh sea containers
  const handleImportSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['fms_project_sea_containers', projectId] })
  }, [queryClient, projectId])

  // Carrier name patterns for code detection (same as in useProjectWizard)
  const CARRIER_PATTERNS: Array<[RegExp, string]> = useMemo(() => [
    [/maersk/i, 'maersk'],
    [/msc|mediterranean\s*shipping/i, 'msc'],
    [/cma[\s\-]?cgm/i, 'cma-cgm'],
    [/hapag[\s\-]?lloyd/i, 'hapag-lloyd'],
    [/evergreen/i, 'evergreen'],
    [/cosco/i, 'cosco'],
    [/zim/i, 'zim'],
    [/yang[\s\-]?ming/i, 'yang-ming'],
    [/hyundai/i, 'hyundai'],
    [/one|ocean\s*network/i, 'one'],
  ], [])

  // Use the project wizard hook
  const {
    project,
    isLoadingProject,
    updateProject,
    legs,
    isLoadingLegs,
    addLeg,
    updateLeg,
    removeLeg,
    seaContainers,
    isLoadingSeaContainers,
    addSeaContainer,
    updateSeaContainer,
    removeSeaContainer,
    roadUnits,
    isLoadingRoadUnits,
    addRoadUnit,
    updateRoadUnit,
    removeRoadUnit,
    cargo,
    isLoadingCargo,
    addCargo,
    updateCargo,
    removeCargo,
    documents,
    isLoadingDocuments,
    uploadDocument,
    updateDocument,
    removeDocument,
    extractDocument,
    downloadDocument,
    extractingDocumentId,
    applyBookingConfirmation,
    saveStatus,
  } = useProjectWizard({
    projectId: projectId || '',
    onError: (msg) => flash(msg, 'error'),
  })

  // Handle "Apply to File" click from DocumentDetailPanel - directly applies the data
  // The DocumentDetailPanel sends flat field names (e.g., carrierName, vesselName),
  // but applyBookingConfirmation expects nested structure (e.g., carrier.name, vessel.name).
  // Transform the data to the expected format.
  const handleApplyToFile = useCallback(async (extractedData: Record<string, unknown>) => {
    if (!applyBookingConfirmation) return

    setIsApplyingToFile(true)
    try {
      // Transform flat fields to nested structure expected by applyBookingConfirmation
      const transformedData: Record<string, unknown> = {
        // Booking/BL numbers (direct copy)
        booking_number: extractedData.bookingNumber ?? extractedData.booking_number,
        bl_number: extractedData.blNumber ?? extractedData.bl_number,
        
        // Carrier info (nested)
        carrier: {
          name: extractedData.carrierName ?? extractedData.carrier_name ?? (extractedData.carrier as any)?.name,
          scac_code: extractedData.carrierScac ?? extractedData.carrier_scac ?? (extractedData.carrier as any)?.scac_code,
        },
        
        // Vessel info (nested)
        vessel: {
          name: extractedData.vesselName ?? extractedData.vessel_name ?? (extractedData.vessel as any)?.name,
          voyage_number: extractedData.voyageNumber ?? extractedData.voyage_number ?? (extractedData.vessel as any)?.voyage_number,
        },
        
        // Routing info (nested)
        routing: {
          port_of_loading: extractedData.originAddress ?? extractedData.origin_address ?? (extractedData.routing as any)?.port_of_loading,
          port_of_discharge: extractedData.destinationAddress ?? extractedData.destination_address ?? (extractedData.routing as any)?.port_of_discharge,
        },
        
        // Dates (nested)
        dates: {
          etd: extractedData.etd ?? (extractedData.dates as any)?.etd,
          eta: extractedData.eta ?? (extractedData.dates as any)?.eta,
          cutoff_vgm: extractedData.vgmCutoffDate ?? extractedData.vgm_cutoff_date ?? (extractedData.dates as any)?.cutoff_vgm,
          cutoff_si: extractedData.docCutoffDate ?? extractedData.doc_cutoff_date ?? (extractedData.dates as any)?.cutoff_si,
          cutoff_cy: extractedData.gateCloseDate ?? extractedData.gate_close_date ?? (extractedData.dates as any)?.cutoff_cy,
        },
        
        // Cargo description (direct or nested)
        cargo: {
          description: extractedData.commodityDescription ?? extractedData.commodity_description ?? (extractedData.cargo as any)?.description,
        },
        cargo_description: extractedData.commodityDescription ?? extractedData.commodity_description,
        
        // Containers (pass through - could be in either format)
        containers: extractedData.containers,
        container_details: extractedData.container_details,
      }
      
      const result = await applyBookingConfirmation(transformedData as BookingConfirmationExtraction)

      // Build result message
      const parts: string[] = []
      if (result.projectUpdated) parts.push('Updated project fields')
      if (result.containersCreated > 0) parts.push(`Created ${result.containersCreated} container${result.containersCreated !== 1 ? 's' : ''}`)
      if (result.trackingStarted) parts.push('Started shipment tracking')

      if (result.success) {
        flash(parts.join(', ') || 'Booking confirmation applied', 'success')
      } else if (parts.length > 0) {
        // Partial success
        flash(`${parts.join(', ')}. Some errors occurred: ${result.errors.join('; ')}`, 'warning')
      } else {
        flash(`Failed to apply booking: ${result.errors.join('; ')}`, 'error')
      }

      setSelectedDocument(null) // Close document panel
    } catch (err) {
      flash(`Error applying booking: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setIsApplyingToFile(false)
    }
  }, [applyBookingConfirmation])

  // Handle refresh tracking - regenerates tracking data for existing containers
  const handleRefreshTracking = useCallback(async () => {
    // Get carrier code from project's carrier name
    const carrierName = project?.carrierName
    let carrierCode: string | null = null
    
    if (carrierName) {
      for (const [pattern, code] of CARRIER_PATTERNS) {
        if (pattern.test(carrierName)) {
          carrierCode = code
          break
        }
      }
    }

    // Get booking number from project or first sea container
    const bookingNumber = project?.bookingNumber || seaContainers?.[0]?.bookingNumber

    if (!carrierCode) {
      flash('No carrier found. Please import tracking with carrier details first.', 'error')
      return
    }

    if (!bookingNumber) {
      flash('No booking number found. Please add a booking number first.', 'error')
      return
    }

    setIsRefreshingTracking(true)
    try {
      const response = await apiCall<{
        success: boolean
        trackingJobId?: string
        containersCreated?: number
        containersUpdated?: number
        error?: string
      }>(`/api/fms_projects/projects/${projectId}/import-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrierCode,
          referenceType: 'booking',
          referenceValue: bookingNumber,
        }),
      })

      if (response.ok && response.result?.success) {
        const parts: string[] = []
        if (response.result.containersCreated && response.result.containersCreated > 0) {
          parts.push(`${response.result.containersCreated} containers created`)
        }
        if (response.result.containersUpdated && response.result.containersUpdated > 0) {
          parts.push(`${response.result.containersUpdated} containers updated`)
        }
        flash(parts.length > 0 ? `Tracking refreshed: ${parts.join(', ')}` : 'Tracking refreshed', 'success')
        queryClient.invalidateQueries({ queryKey: ['fms_project_sea_containers', projectId] })
      } else {
        flash(`Failed to refresh tracking: ${response.result?.error || 'Unknown error'}`, 'error')
      }
    } catch (err) {
      flash(`Error refreshing tracking: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setIsRefreshingTracking(false)
    }
  }, [project, seaContainers, projectId, queryClient, CARRIER_PATTERNS])

  // Fetch project lines for header financials
  const { data: projectLines = [] } = useQuery({
    queryKey: ['fms_project_lines', projectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(
        `/api/fms_projects/projects/${projectId}/lines`
      )
      if (!response.ok) return []
      return (response.result?.items || []).map((line: any) => ({
        id: line.id,
        soldAmount: line.soldAmount || '0',
        actualCost: line.actualCost,
        estimatedCost: line.estimatedCost || null,
        actualSellAmount: line.actualSellAmount || null,
        currencyCode: line.currencyCode || null,
      })) as ProjectLine[]
    },
    enabled: !!projectId,
  })

  // Initialize transport modes from project data when loaded
  useEffect(() => {
    if (project && !transportModesInitialized) {
      const modes = project.transportModes || []
      setSelectedTransportModes(modes)
      setTransportModesInitialized(true)
    }
  }, [project, transportModesInitialized])

  // Build dynamic cross-table navigation chain based on which transport tables are visible.
  // The DOM order is: Header → Financials → [ShipmentStatus] → Parties
  //   → [SeaContainers] → [RoadUnits] → [CargoLCL] → Lines → Documents
  const hasShip = selectedTransportModes.includes('sea')
  const hasRoad = selectedTransportModes.includes('road')
  const hasLclCargo = project?.cargoType === 'lcl'

  // Whether transport-specific tables have focusable rows.
  // ShipmentStatus renders plain text (no DynamicTable) when seaContainers is empty,
  // and DynamicTable's handleFocus bails on 0-row tables, so we skip them from the chain.
  const hasSeaContainerRows = (seaContainers?.length ?? 0) > 0
  const hasRoadUnitRows = (roadUnits?.length ?? 0) > 0
  const hasCargoRows = (cargo?.length ?? 0) > 0

  const tableNavChain = useMemo(() => {
    const chain: React.RefObject<HTMLDivElement | null>[] = [
      headerTableRef,
      routeShippingTableRef,
      financialsTableRef,
      // ShipmentStatus only renders a DynamicTable when ship mode is active AND containers exist
      ...(hasShip && hasSeaContainerRows ? [shipmentStatusTableRef] : []),
      partiesTableRef,
      // Transport tables: only include when mode is active, section is expanded, AND data rows exist
      ...(hasShip && hasSeaContainerRows ? [seaContainersTableRef] : []),
      ...(hasRoad && roadUnitsExpanded && hasRoadUnitRows ? [roadUnitsTableRef] : []),
      ...(hasLclCargo && cargoExpanded && hasCargoRows ? [cargoTableRef] : []),
      linesTableRef,
      documentsTableRef,
    ]
    return chain
  }, [hasShip, hasRoad, hasLclCargo, hasSeaContainerRows, hasRoadUnitRows, hasCargoRows, roadUnitsExpanded, cargoExpanded])

  const getSiblingRefs = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>) => {
      const index = tableNavChain.indexOf(ref)
      if (index === -1) return undefined
      return {
        prev: index > 0 ? tableNavChain[index - 1] : undefined,
        next: index < tableNavChain.length - 1 ? tableNavChain[index + 1] : undefined,
      }
    },
    [tableNavChain]
  )

  // Called when user saves a new row in the sea containers table
  const handleAddSeaContainer = async (data: Partial<Omit<Parameters<typeof addSeaContainer>[0], 'projectId'>>) => {
    if (!projectId) return null
    return await addSeaContainer({
      projectId, // Always use the page's projectId
      containerType: data.containerType || '40HC',
      containerNumber: data.containerNumber || null,
      sealNumber: data.sealNumber || null,
      ownershipType: data.ownershipType || 'coc',
      bookingNumber: data.bookingNumber || null,
      bolNumber: data.bolNumber || null,
      carrierCode: data.carrierCode || null,
      vesselName: data.vesselName || null,
      vesselImo: data.vesselImo || null,
      voyageNumber: data.voyageNumber || null,
      originPort: data.originPort || null,
      destinationPort: data.destinationPort || null,
      etd: data.etd || null,
      eta: data.eta || null,
      atd: data.atd || null,
      ata: data.ata || null,
      status: data.status || 'PENDING',
      isActive: data.isActive ?? true,
      isHazardous: data.isHazardous || false,
      notes: data.notes || null,
      // Multi-source timestamp arrays (initially empty)
      etdTimestamps: data.etdTimestamps ?? null,
      etaTimestamps: data.etaTimestamps ?? null,
      atdTimestamps: data.atdTimestamps ?? null,
      ataTimestamps: data.ataTimestamps ?? null,
      // Tracking fields are read-only - not set on create
      trackedShipmentId: null,
      lastSyncedAt: null,
      syncStatus: null,
    })
  }

  const handleAddRoadUnit = async () => {
    await addRoadUnit({
      vehicleType: 'ftl_truck',
      truckNumber: null,
      trailerNumber: null,
      driverName: null,
      driverPhone: null,
      cmrNumber: null,
      bookingNumber: null,
      carrierName: null,
      carrierContact: null,
      originAddress: null,
      destinationAddress: null,
      pickupDate: null,
      deliveryDate: null,
      actualPickup: null,
      actualDelivery: null,
      pieces: null,
      grossWeight: null,
      palletSpaces: null,
      loadingMeters: null,
      status: 'not_ready',
      isHazardous: false,
      notes: null,
    })
  }

  const handleAddCargo = async () => {
    await addCargo({
      description: null,
      packageCount: null,
      packageType: null,
      grossWeight: null,
      volume: null,
      length: null,
      width: null,
      height: null,
    })
  }

  // Handlers for updating items
  const handleSeaContainerUpdate = async (containerId: string, field: string, value: unknown) => {
    await updateSeaContainer(containerId, { [field]: value })
  }

  const handleRoadUnitUpdate = async (roadUnitId: string, field: string, value: unknown) => {
    await updateRoadUnit(roadUnitId, { [field]: value })
  }

  const handleCargoUpdate = async (cargoId: string, field: string, value: unknown) => {
    await updateCargo(cargoId, { [field]: value })
  }

  const handleDocumentUpdate = async (documentId: string, field: string, value: unknown) => {
    await updateDocument(documentId, { [field]: value })
  }

  // Open upload modal
  const handleOpenUploadModal = useCallback(() => {
    setShowUploadModal(true)
  }, [])

  // Handle upload only
  const handleUploadDocument = useCallback(async (file: File, category: string): Promise<string | null> => {
    if (!projectId) {
      flash('Project ID is required', 'error')
      return null
    }

    try {
      const documentId = await uploadDocument(file, category)
      return documentId
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Upload failed', 'error')
      return null
    }
  }, [projectId, uploadDocument])

  // Handle extraction for the modal
  const handleExtractForModal = useCallback(async (documentId: string): Promise<any> => {
    try {
      const result = await extractDocument(documentId)
      return result
    } catch (err) {
      throw err
    }
  }, [extractDocument])

  // Handle document click - open drawer
  const handleDocumentClick = useCallback((document: ProjectDocument) => {
    setSelectedDocument(document)
  }, [])

  // Handle extract from drawer
  const handleExtractDocument = useCallback(async (documentId: string) => {
    try {
      await extractDocument(documentId)
      setTimeout(() => {
        const updatedDoc = documents.find(d => d.id === documentId)
        if (updatedDoc) {
          setSelectedDocument(updatedDoc)
        }
      }, 500)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Extraction failed', 'error')
    }
  }, [extractDocument, documents])

  // Handle download from drawer
  const handleDownloadDocument = useCallback((documentId: string) => {
    downloadDocument(documentId)
  }, [downloadDocument])

  // Close document drawer
  const handleCloseDocumentDrawer = useCallback(() => {
    setSelectedDocument(null)
  }, [])

  // Handle document uploaded - auto-open the document detail panel
  // DocumentDetailPanel fetches its own data via useQuery, so we just need to pass the ID
  const handleDocumentUploaded = useCallback((documentId: string) => {
    // Close the upload modal
    setShowUploadModal(false)
    // Set minimal object with just ID - DocumentDetailPanel fetches its own data
    // The documentCategory prop will use fallback from fetched document.category
    setSelectedDocument({ id: documentId } as ProjectDocument)
  }, [])

  // No project ID provided
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Project ID is required</p>
      </div>
    )
  }

  // Loading state
  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not found state
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* LEFT: Activity Panel — sticky, own scroll */}
      <div className="w-[400px] min-w-[350px] shrink-0 border-r h-full overflow-hidden">
        <ProjectActivitySection projectId={projectId} />
      </div>
      {/* RIGHT: Main Content - All DynamicTables stacked */}
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* FILE DETAILS TABLE: File Number, Booking, Containers, Incoterms, Status, Operator, Sales */}
        <ProjectFileDetailsTable
          project={project}
          seaContainers={seaContainers || []}
          onUpdate={updateProject}
          tableRef={headerTableRef}
          autoSelectOnFocus={true}
          siblingTableRefs={getSiblingRefs(headerTableRef)}
        />

        {/* ROUTE & SHIPPING TABLE: Full width with ETD, ETA, ATD, ATA dates */}
        <ProjectRouteShippingTable
          project={project}
          onUpdate={updateProject}
          tableRef={routeShippingTableRef}
          autoSelectOnFocus={true}
          siblingTableRefs={getSiblingRefs(routeShippingTableRef)}
        />

        {/* CUTOFFS TABLE */}
        {selectedTransportModes.includes('sea') && (
          <ProjectShipmentStatusTable
            project={project}
            onUpdate={updateProject}
            tableRef={shipmentStatusTableRef}
            autoSelectOnFocus={true}
            siblingTableRefs={getSiblingRefs(shipmentStatusTableRef)}
          />
        )}

        {/* FINANCIALS TABLE: Full width */}
        <ProjectFinancialsTable
          projectLines={projectLines}
          currencyCode={project.currencyCode || 'USD'}
          invoicingStatus={(project.invoicingStatus as 'not_invoiced' | 'invoiced' | 'partially_paid' | 'paid_resolved') || 'not_invoiced'}
          onInvoicingStatusChange={(status) => updateProject({ invoicingStatus: status })}
          offerId={project.offer?.id}
          rfqTitle={project.rfqId ? `RFQ-${project.rfqId.slice(0, 8)}` : undefined}
          onViewDetails={() => setShowProductsCostsDrawer(true)}
          onLinkedClick={() => setShowOfferDrawer(true)}
          tableRef={financialsTableRef}
          autoSelectOnFocus={true}
          siblingTableRefs={getSiblingRefs(financialsTableRef)}
          baseCurrency={project.offerBaseCurrency}
          exchangeRates={project.offerExchangeRates}
        />

        {/* PARTIES TABLE + CARGO DESCRIPTION + BL INSTRUCTIONS: Side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProjectPartiesTable
            project={project}
            onUpdate={updateProject}
            tableRef={partiesTableRef}
            autoSelectOnFocus={true}
            siblingTableRefs={getSiblingRefs(partiesTableRef)}
          />
          <div className="flex flex-col gap-4">
            <ProjectCargoDescriptionSection
              project={project}
              onUpdate={updateProject}
            />
            <ProjectBLInstructionsSection />
          </div>
        </div>

        {/* CONTAINERS TABLE: Main operational data */}
        {selectedTransportModes.includes('sea') && (
          <SeaContainersTable
            projectId={projectId}
            seaContainers={seaContainers || []}
            isLoading={isLoadingSeaContainers}
            onSeaContainerUpdate={handleSeaContainerUpdate}
            onAddSeaContainer={handleAddSeaContainer}
            onRemoveSeaContainer={removeSeaContainer}
            onImportTracking={() => setShowImportTrackingModal(true)}
            onRefreshTracking={handleRefreshTracking}
            isRefreshingTracking={isRefreshingTracking}
            tableRef={seaContainersTableRef}
            autoSelectOnFocus={true}
            siblingTableRefs={getSiblingRefs(seaContainersTableRef)}
          />
        )}

        {/* Road Units Section - Show when 'road' is selected */}
        {selectedTransportModes.includes('road') && (
          <div className="border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setRoadUnitsExpanded(!roadUnitsExpanded)}
                className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
              >
                {roadUnitsExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">Road Units</span>
                <Badge variant="secondary">{roadUnits?.length || 0}</Badge>
              </button>
            </div>
            {roadUnitsExpanded && (
              <div className="border-t">
                <ProjectRoadUnitsTable
                  roadUnits={roadUnits || []}
                  isLoading={isLoadingRoadUnits}
                  onRoadUnitUpdate={handleRoadUnitUpdate}
                  onAddRoadUnit={handleAddRoadUnit}
                  onRemoveRoadUnit={removeRoadUnit}
                  tableRef={roadUnitsTableRef}
                  autoSelectOnFocus={true}
                  siblingTableRefs={getSiblingRefs(roadUnitsTableRef)}
                />
              </div>
            )}
          </div>
        )}

        {/* Cargo Table (LCL) - Show only when cargoType is 'lcl' */}
        {project.cargoType === 'lcl' && (
          <div className="border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setCargoExpanded(!cargoExpanded)}
                className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
              >
                {cargoExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">Cargo (LCL)</span>
                <Badge variant="secondary">{cargo?.length || 0}</Badge>
              </button>
            </div>
            {cargoExpanded && (
              <div className="border-t">
                <ProjectCargoTable
                  cargo={cargo || []}
                  isLoading={isLoadingCargo}
                  onCargoUpdate={handleCargoUpdate}
                  onAddCargo={handleAddCargo}
                  onRemoveCargo={removeCargo}
                  tableRef={cargoTableRef}
                  autoSelectOnFocus={true}
                  siblingTableRefs={getSiblingRefs(cargoTableRef)}
                />
              </div>
            )}
          </div>
        )}

        {/* Documents Table - Full Width */}
        <ProjectDocumentsTable
          documents={documents}
          isLoading={isLoadingDocuments}
          onDocumentUpdate={handleDocumentUpdate}
          onUpload={handleOpenUploadModal}
          onRemoveDocument={removeDocument}
          onDocumentClick={handleDocumentClick}
          extractingDocumentId={extractingDocumentId}
          tableRef={documentsTableRef}
          autoSelectOnFocus={true}
          siblingTableRefs={getSiblingRefs(documentsTableRef)}
        />
      </div>

      {/* Upload Document Modal */}
      <UploadDocumentModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadDocument}
        onExtract={handleExtractForModal}
        onDocumentUploaded={handleDocumentUploaded}
      />

      {/* Document Details Panel (Modal) */}
      <DocumentDetailPanel
        documentId={selectedDocument?.id ?? null}
        open={!!selectedDocument}
        onOpenChange={(open) => { if (!open) handleCloseDocumentDrawer() }}
        mainTableRef={documentsTableRef}
        mode="file"
        documentCategory={selectedDocument?.category}
        onApplyToFile={handleApplyToFile}
        isApplyingToFile={isApplyingToFile}
        onExtract={handleExtractDocument}
        isExtracting={extractingDocumentId === selectedDocument?.id}
      />

      {/* Products & Costs Drawer */}
      <ProductsCostsDrawer
        projectId={projectId}
        offerId={project.offer?.id ?? null}
        currencyCode={project.currencyCode || 'USD'}
        open={showProductsCostsDrawer}
        onClose={() => setShowProductsCostsDrawer(false)}
        onError={(msg) => flash(msg, 'error')}
        baseCurrency={project.offerBaseCurrency}
        exchangeRates={project.offerExchangeRates}
      />

      {/* Offer Detail Drawer */}
      <OfferDetailDrawer
        offerId={project.offer?.id ?? null}
        open={showOfferDrawer}
        onClose={() => setShowOfferDrawer(false)}
      />

      {/* Import Tracking Modal */}
      <ImportTrackingModal
        projectId={projectId}
        open={showImportTrackingModal}
        onClose={() => setShowImportTrackingModal(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  )
}
