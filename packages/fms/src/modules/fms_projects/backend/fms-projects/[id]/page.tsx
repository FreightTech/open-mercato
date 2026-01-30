/**
 * FMS Projects Module - Detail View
 * Project detail page with redesigned DynamicTable-based layout
 */

'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useProjectWizard, type TransportModeType } from '../../../components/ProjectWizard/hooks/useProjectWizard'
import { ProjectFileDetailsTable } from '../../../components/ProjectWizard/ProjectFileDetailsTable'
import { ProjectRouteShippingTable } from '../../../components/ProjectWizard/ProjectRouteShippingTable'
import { ProjectFinancialsTable } from '../../../components/ProjectWizard/ProjectFinancialsTable'
import { ProjectShipmentStatusTable } from '../../../components/ProjectWizard/ProjectShipmentStatusTable'
import { ProjectPartiesTable } from '../../../components/ProjectWizard/ProjectPartiesTable'
import { ProjectTimelineTable } from '../../../components/ProjectWizard/ProjectTimelineTable'
import { ProjectSeaContainersTable } from '../../../components/ProjectWizard/ProjectSeaContainersTable'
import { ProjectAirUnitsTable } from '../../../components/ProjectWizard/ProjectAirUnitsTable'
import { ProjectRoadUnitsTable } from '../../../components/ProjectWizard/ProjectRoadUnitsTable'
import { ProjectCargoTable } from '../../../components/ProjectWizard/ProjectCargoTable'
import { ProjectDocumentsTable, type ProjectDocument } from '../../../components/ProjectWizard/ProjectDocumentsTable'
import { DocumentDetailsDrawer } from '../../../components/ProjectWizard/DocumentDetailsDrawer'
import { UploadDocumentModal } from '../../../components/ProjectWizard/UploadDocumentModal'
import { ProductsCostsDrawer } from '../../../components/ProductsCostsDrawer'
import { OfferDetailDrawer } from '../../../../fms_quotes/components/OfferDetailDrawer'

// Project line type for financials calculation
interface ProjectLine {
  id: string
  soldAmount: string
  actualCost?: string | null
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

  const [error, setError] = useState<string | null>(null)
  const [airUnitsExpanded, setAirUnitsExpanded] = useState(true)
  const [roadUnitsExpanded, setRoadUnitsExpanded] = useState(true)
  const [cargoExpanded, setCargoExpanded] = useState(true)

  // Transport modes multi-select state
  const [selectedTransportModes, setSelectedTransportModes] = useState<TransportModeType[]>([])
  const [transportModesInitialized, setTransportModesInitialized] = useState(false)

  // Table refs for cross-table arrow navigation
  const headerTableRef = useRef<HTMLDivElement>(null)
  const financialsTableRef = useRef<HTMLDivElement>(null)
  const shipmentStatusTableRef = useRef<HTMLDivElement>(null)
  const partiesTableRef = useRef<HTMLDivElement>(null)
  const timelineTableRef = useRef<HTMLDivElement>(null)
  const seaContainersTableRef = useRef<HTMLDivElement>(null)
  const airUnitsTableRef = useRef<HTMLDivElement>(null)
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
    airUnits,
    isLoadingAirUnits,
    addAirUnit,
    updateAirUnit,
    removeAirUnit,
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
    saveStatus,
  } = useProjectWizard({
    projectId: projectId || '',
    onError: setError,
  })

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
  // The DOM order is: Header → Financials → [ShipmentStatus] → Parties → Timeline
  //   → [SeaContainers] → [AirUnits] → [RoadUnits] → [CargoLCL] → Lines → Documents
  const hasShip = selectedTransportModes.includes('ship')
  const hasAir = selectedTransportModes.includes('air')
  const hasRoad = selectedTransportModes.includes('ftl') || selectedTransportModes.includes('ltl')
  const hasLclCargo = project?.cargoType === 'lcl'

  // Whether transport-specific tables have focusable rows.
  // ShipmentStatus renders plain text (no DynamicTable) when seaContainers is empty,
  // and DynamicTable's handleFocus bails on 0-row tables, so we skip them from the chain.
  const hasSeaContainerRows = (seaContainers?.length ?? 0) > 0
  const hasAirUnitRows = (airUnits?.length ?? 0) > 0
  const hasRoadUnitRows = (roadUnits?.length ?? 0) > 0
  const hasCargoRows = (cargo?.length ?? 0) > 0

  const tableNavChain = useMemo(() => {
    const chain: React.RefObject<HTMLDivElement | null>[] = [
      headerTableRef,
      financialsTableRef,
      // ShipmentStatus only renders a DynamicTable when ship mode is active AND containers exist
      ...(hasShip && hasSeaContainerRows ? [shipmentStatusTableRef] : []),
      partiesTableRef,
      timelineTableRef,
      // Transport tables: only include when mode is active, section is expanded, AND data rows exist
      ...(hasShip && hasSeaContainerRows ? [seaContainersTableRef] : []),
      ...(hasAir && airUnitsExpanded && hasAirUnitRows ? [airUnitsTableRef] : []),
      ...(hasRoad && roadUnitsExpanded && hasRoadUnitRows ? [roadUnitsTableRef] : []),
      ...(hasLclCargo && cargoExpanded && hasCargoRows ? [cargoTableRef] : []),
      linesTableRef,
      documentsTableRef,
    ]
    return chain
  }, [hasShip, hasAir, hasRoad, hasLclCargo, hasSeaContainerRows, hasAirUnitRows, hasRoadUnitRows, hasCargoRows, airUnitsExpanded, roadUnitsExpanded, cargoExpanded])

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
      blNumber: data.blNumber || null,
      vesselName: data.vesselName || null,
      vesselImo: data.vesselImo || null,
      voyageNumber: data.voyageNumber || null,
      originPort: data.originPort || null,
      destinationPort: data.destinationPort || null,
      etd: data.etd || null,
      eta: data.eta || null,
      atd: data.atd || null,
      ata: data.ata || null,
      status: data.status || 'not_ready',
      isHazardous: data.isHazardous || false,
      notes: data.notes || null,
    })
  }

  const handleAddAirUnit = async () => {
    await addAirUnit({
      deliveryStatus: 'awaiting',
      isLoose: true,
      isStackable: true,
      isDgr: false,
      dgrUnNumber: null,
      dgrClass: null,
      pieces: null,
      grossWeight: null,
      chargeableWeight: null,
      volume: null,
      loadingMeters: null,
      commodity: null,
      description: null,
      targetRate: null,
      unitType: null,
      unitNumber: null,
      originType: 'airport',
      originAirport: null,
      destinationAirport: null,
      shipmentReadyDate: null,
      requiredAtDestination: null,
      etd: null,
      eta: null,
      atd: null,
      ata: null,
      mawbNumber: null,
      hawbNumber: null,
      bookingNumber: null,
      flightNumber: null,
      carrierCode: null,
      aircraftType: null,
      notes: null,
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

  const handleAirUnitUpdate = async (airUnitId: string, field: string, value: unknown) => {
    await updateAirUnit(airUnitId, { [field]: value })
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
      setError('Project ID is required')
      return null
    }

    try {
      const documentId = await uploadDocument(file, category)
      return documentId
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
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
      setError(err instanceof Error ? err.message : 'Extraction failed')
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
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content - All DynamicTables stacked */}
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* FILE DETAILS TABLE: File Number, Booking, Containers, ETD, ETA, Status, Operator, Sales */}
        <ProjectFileDetailsTable
          project={project}
          seaContainers={seaContainers || []}
          onUpdate={updateProject}
          tableRef={headerTableRef}
          autoSelectOnFocus={true}
          siblingTableRefs={getSiblingRefs(headerTableRef)}
        />

   

        {/* ROUTE & SHIPPING + FINANCIALS: Side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProjectRouteShippingTable
            project={project}
            onUpdate={updateProject}
          />
          <ProjectFinancialsTable
            projectLines={projectLines}
            currencyCode={project.currencyCode || 'USD'}
            offerId={project.offer?.id}
            quoteNumber={project.quoteId ? `QT-${project.quoteId.slice(0, 8)}` : undefined}
            onViewDetails={() => setShowProductsCostsDrawer(true)}
            onLinkedClick={() => setShowOfferDrawer(true)}
          tableRef={financialsTableRef}
          autoSelectOnFocus={true}
          siblingTableRefs={getSiblingRefs(financialsTableRef)}
                    onContainerUpdate={handleSeaContainerUpdate}

          />
        </div>

        {/* SHIPMENT STATUS TABLE: Tabbed (Origin/Global/Destination) */}
        {selectedTransportModes.includes('ship') && (
          <ProjectShipmentStatusTable
            project={project}
            seaContainers={seaContainers || []}
            onContainerUpdate={handleSeaContainerUpdate}
            tableRef={shipmentStatusTableRef}
            autoSelectOnFocus={true}
            siblingTableRefs={getSiblingRefs(shipmentStatusTableRef)}
          />
        )}

        {/* PARTIES TABLE + TIMELINE TABLE: Side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProjectPartiesTable
            project={project}
            onUpdate={updateProject}
            tableRef={partiesTableRef}
            autoSelectOnFocus={true}
            siblingTableRefs={getSiblingRefs(partiesTableRef)}
          />
          <ProjectTimelineTable
            project={project}
            seaContainers={seaContainers || []}
            onProjectUpdate={updateProject}
            onContainerUpdate={handleSeaContainerUpdate}
            tableRef={timelineTableRef}
            autoSelectOnFocus={true}
            siblingTableRefs={getSiblingRefs(timelineTableRef)}
          />
        </div>

        {/* CONTAINERS TABLE: Main operational data */}
        {selectedTransportModes.includes('ship') && (
          <ProjectSeaContainersTable
            projectId={projectId}
            seaContainers={seaContainers || []}
            isLoading={isLoadingSeaContainers}
            onSeaContainerUpdate={handleSeaContainerUpdate}
            onAddSeaContainer={handleAddSeaContainer}
            onRemoveSeaContainer={removeSeaContainer}
            tableRef={seaContainersTableRef}
            autoSelectOnFocus={true}
            siblingTableRefs={getSiblingRefs(seaContainersTableRef)}
          />
        )}

        {/* Air Units Section - Show when 'air' is selected */}
        {selectedTransportModes.includes('air') && (
          <div className="border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setAirUnitsExpanded(!airUnitsExpanded)}
                className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
              >
                {airUnitsExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">Air Units</span>
                <Badge variant="secondary">{airUnits?.length || 0}</Badge>
              </button>
            </div>
            {airUnitsExpanded && (
              <div className="border-t">
                <ProjectAirUnitsTable
                  airUnits={airUnits || []}
                  isLoading={isLoadingAirUnits}
                  onAirUnitUpdate={handleAirUnitUpdate}
                  onAddAirUnit={handleAddAirUnit}
                  onRemoveAirUnit={removeAirUnit}
                  tableRef={airUnitsTableRef}
                  autoSelectOnFocus={true}
                  siblingTableRefs={getSiblingRefs(airUnitsTableRef)}
                />
              </div>
            )}
          </div>
        )}

        {/* Road Units Section - Show when 'ftl' or 'ltl' is selected */}
        {(selectedTransportModes.includes('ftl') || selectedTransportModes.includes('ltl')) && (
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

        {/* Documents Table */}
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
      />

      {/* Document Details Drawer */}
      <DocumentDetailsDrawer
        open={!!selectedDocument}
        onClose={handleCloseDocumentDrawer}
        document={selectedDocument}
        onExtract={handleExtractDocument}
        onDownload={handleDownloadDocument}
        isExtracting={extractingDocumentId === selectedDocument?.id}
      />

      {/* Products & Costs Drawer */}
      <ProductsCostsDrawer
        projectId={projectId}
        offerId={project.offer?.id ?? null}
        currencyCode={project.currencyCode || 'USD'}
        open={showProductsCostsDrawer}
        onClose={() => setShowProductsCostsDrawer(false)}
        onError={setError}
      />

      {/* Offer Detail Drawer */}
      <OfferDetailDrawer
        offerId={project.offer?.id ?? null}
        open={showOfferDrawer}
        onClose={() => setShowOfferDrawer(false)}
      />
    </div>
  )
}
