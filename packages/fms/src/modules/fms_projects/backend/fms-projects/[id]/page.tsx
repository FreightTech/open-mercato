/**
 * FMS Projects Module - Detail View
 * Project detail page with all wizard components in page format
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { useProjectWizard, type TransportModeType } from '../../../components/ProjectWizard/hooks/useProjectWizard'
import { ProjectWizardHeader } from '../../../components/ProjectWizard/ProjectWizardHeader'
import { ProjectSeaContainersTable } from '../../../components/ProjectWizard/ProjectSeaContainersTable'
import { ProjectAirUnitsTable } from '../../../components/ProjectWizard/ProjectAirUnitsTable'
import { ProjectRoadUnitsTable } from '../../../components/ProjectWizard/ProjectRoadUnitsTable'
import { ProjectCargoTable } from '../../../components/ProjectWizard/ProjectCargoTable'
import { ProjectDocumentsTable, type ProjectDocument } from '../../../components/ProjectWizard/ProjectDocumentsTable'
import { DocumentDetailsDrawer } from '../../../components/ProjectWizard/DocumentDetailsDrawer'
import { UploadDocumentModal } from '../../../components/ProjectWizard/UploadDocumentModal'
import { ProjectFinancialSection } from '../../../components/ProjectFinancialSection'

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

  // Document modals state
  const [selectedDocument, setSelectedDocument] = useState<ProjectDocument | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

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

  // Initialize transport modes from project data when loaded
  useEffect(() => {
    if (project && !transportModesInitialized) {
      const modes = project.transportModes || []
      setSelectedTransportModes(modes)
      setTransportModesInitialized(true)
    }
  }, [project, transportModesInitialized])

  // Handler for transport mode changes that syncs to database
  const handleTransportModesChange = useCallback((modes: TransportModeType[]) => {
    setSelectedTransportModes(modes)
    const derivedShipmentType = deriveShipmentType(modes, project?.direction)
    updateProject({
      transportModes: modes,
      ...(derivedShipmentType && { shipmentType: derivedShipmentType })
    })
  }, [updateProject, project?.direction])

  // Map UI transport mode to leg transport mode
  const mapTransportModeToLegMode = (mode: TransportModeType | undefined): string => {
    const mapping: Record<TransportModeType, string> = {
      ship: 'SEA',
      air: 'AIR',
      ftl: 'ROAD',
      ltl: 'ROAD',
      train: 'RAIL',
      barge: 'SEA', // Barge is water transport
    }
    return mode ? mapping[mode] : 'SEA'
  }

  // Derive shipment type from transport modes and direction
  type DirectionType = 'export' | 'import' | 'domestic'
  type ShipmentTypeValue = 'EXP' | 'IMP' | 'RAIL' | 'FTL' | 'LTL' | 'AIR' | 'DEPOT'

  const deriveShipmentType = (
    modes: TransportModeType[],
    direction: DirectionType | string | null | undefined
  ): ShipmentTypeValue | null => {
    if (modes.length === 0) return null

    const primaryMode = modes[0]

    // Sea/Barge: use direction
    if (primaryMode === 'ship' || primaryMode === 'barge') {
      if (direction === 'export') return 'EXP'
      if (direction === 'import') return 'IMP'
      return 'EXP' // default for domestic
    }

    // Direct mode-to-type mappings
    if (primaryMode === 'train') return 'RAIL'
    if (primaryMode === 'ftl') return 'FTL'
    if (primaryMode === 'ltl') return 'LTL'
    if (primaryMode === 'air') return 'AIR'

    return null
  }

  // Handlers for adding new items
  const handleAddLeg = async () => {
    // Default to first selected mode, or 'SEA' if none
    const defaultMode = mapTransportModeToLegMode(selectedTransportModes[0])

    await addLeg({
      legSequence: legs.length + 1,
      transportMode: defaultMode,
      carrierId: null,
      carrierName: null,
      originLocationId: null,
      destinationLocationId: null,
      originAddress: null,
      destinationAddress: null,
      estimatedDeparture: null,
      estimatedArrival: null,
      vesselName: null,
      voyageNumber: null,
      bookingNumber: null,
      billOfLadingNumber: null,
    })
  }

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
  const handleLegUpdate = async (legId: string, field: string, value: unknown) => {
    await updateLeg(legId, { [field]: value })
  }

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

      {/* Header with key fields */}
      <ProjectWizardHeader
        project={project}
        onChange={updateProject}
        mode="edit"
        selectedTransportModes={selectedTransportModes}
        onTransportModesChange={handleTransportModesChange}
        projectNumber={project.projectNumber || projectId.slice(0, 8)}
        status={project.status || 'draft'}
        saveStatus={saveStatus}
      />

      {/* Main content area with tables */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Sea Containers Section - Show when 'ship' is selected */}
        {selectedTransportModes.includes('ship') && (
          <ProjectSeaContainersTable
            projectId={projectId}
            seaContainers={seaContainers || []}
            isLoading={isLoadingSeaContainers}
            onSeaContainerUpdate={handleSeaContainerUpdate}
            onAddSeaContainer={handleAddSeaContainer}
            onRemoveSeaContainer={removeSeaContainer}
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
                />
              </div>
            )}
          </div>
        )}

        {/* Products & Costs Section */}
        <ProjectFinancialSection
          projectId={projectId}
          offerId={project.offer?.id ?? null}
          currencyCode={project.currencyCode || 'USD'}
          onError={setError}
        />

        {/* Documents Table */}
        <ProjectDocumentsTable
          documents={documents}
          isLoading={isLoadingDocuments}
          onDocumentUpdate={handleDocumentUpdate}
          onUpload={handleOpenUploadModal}
          onRemoveDocument={removeDocument}
          onDocumentClick={handleDocumentClick}
          extractingDocumentId={extractingDocumentId}
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
    </div>
  )
}
