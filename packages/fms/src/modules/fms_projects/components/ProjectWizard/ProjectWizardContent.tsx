'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Loader2, X, Check, AlertCircle, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { useProjectWizard, type TransportModeType } from './hooks/useProjectWizard'
import { useNewProjectWizard } from './hooks/useNewProjectWizard'
import { ProjectWizardHeader } from './ProjectWizardHeader'
import { ProjectLegsTable } from './ProjectLegsTable'
import { ProjectSeaContainersTable } from './ProjectSeaContainersTable'
import { ProjectAirUnitsTable } from './ProjectAirUnitsTable'
import { ProjectRoadUnitsTable } from './ProjectRoadUnitsTable'
import { ProjectCargoTable } from './ProjectCargoTable'
import { ProjectDocumentsTable, type ProjectDocument } from './ProjectDocumentsTable'
import { DocumentDetailsDrawer } from './DocumentDetailsDrawer'
import { UploadDocumentModal } from './UploadDocumentModal'
import type { Project } from './hooks/useProjectWizard'

export type { TransportModeType }

type ProjectWizardContentProps = {
  projectId: string | null
  mode: 'new' | 'edit'
  onClose: () => void
  onProjectCreated?: (projectId: string) => void
}

export function ProjectWizardContent({ projectId, mode, onClose, onProjectCreated }: ProjectWizardContentProps) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [legsExpanded, setLegsExpanded] = useState(false)
  const [documentsExpanded, setDocumentsExpanded] = useState(true)
  const [seaContainersExpanded, setSeaContainersExpanded] = useState(true)
  const [airUnitsExpanded, setAirUnitsExpanded] = useState(true)
  const [roadUnitsExpanded, setRoadUnitsExpanded] = useState(true)
  const [cargoExpanded, setCargoExpanded] = useState(true)

  // Transport modes multi-select state - initialized from project
  const [selectedTransportModes, setSelectedTransportModes] = useState<TransportModeType[]>([])
  const [transportModesInitialized, setTransportModesInitialized] = useState(false)

  // Document modals state
  const [selectedDocument, setSelectedDocument] = useState<ProjectDocument | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

  // Determine which hook to use based on mode and projectId
  const isNewMode = mode === 'new' && !projectId

  // Use the new project wizard hook for draft mode
  const newProjectWizard = useNewProjectWizard({
    onError: setError,
    onProjectCreated: (id) => {
      onProjectCreated?.(id)
    },
  })

  // Use the existing project wizard hook for edit mode
  const editProjectWizard = useProjectWizard({
    projectId: projectId || '',
    onError: setError,
  })

  // Extract values based on mode
  const project = isNewMode ? newProjectWizard.project : editProjectWizard.project
  const isLoadingProject = isNewMode ? newProjectWizard.isLoadingProject : editProjectWizard.isLoadingProject
  const updateProject = isNewMode ? newProjectWizard.updateProject : editProjectWizard.updateProject
  const legs = isNewMode ? newProjectWizard.legs : editProjectWizard.legs
  const isLoadingLegs = isNewMode ? newProjectWizard.isLoadingLegs : editProjectWizard.isLoadingLegs
  const addLeg = isNewMode ? newProjectWizard.addLeg : editProjectWizard.addLeg
  const updateLeg = isNewMode ? newProjectWizard.updateLeg : editProjectWizard.updateLeg
  const removeLeg = isNewMode ? newProjectWizard.removeLeg : editProjectWizard.removeLeg
  // Sea containers
  const seaContainers = isNewMode ? newProjectWizard.seaContainers : editProjectWizard.seaContainers
  const isLoadingSeaContainers = isNewMode ? newProjectWizard.isLoadingSeaContainers : editProjectWizard.isLoadingSeaContainers
  const addSeaContainer = isNewMode ? newProjectWizard.addSeaContainer : editProjectWizard.addSeaContainer
  const updateSeaContainer = isNewMode ? newProjectWizard.updateSeaContainer : editProjectWizard.updateSeaContainer
  const removeSeaContainer = isNewMode ? newProjectWizard.removeSeaContainer : editProjectWizard.removeSeaContainer

  // Air units
  const airUnits = isNewMode ? newProjectWizard.airUnits : editProjectWizard.airUnits
  const isLoadingAirUnits = isNewMode ? newProjectWizard.isLoadingAirUnits : editProjectWizard.isLoadingAirUnits
  const addAirUnit = isNewMode ? newProjectWizard.addAirUnit : editProjectWizard.addAirUnit
  const updateAirUnit = isNewMode ? newProjectWizard.updateAirUnit : editProjectWizard.updateAirUnit
  const removeAirUnit = isNewMode ? newProjectWizard.removeAirUnit : editProjectWizard.removeAirUnit

  // Road units
  const roadUnits = isNewMode ? newProjectWizard.roadUnits : editProjectWizard.roadUnits
  const isLoadingRoadUnits = isNewMode ? newProjectWizard.isLoadingRoadUnits : editProjectWizard.isLoadingRoadUnits
  const addRoadUnit = isNewMode ? newProjectWizard.addRoadUnit : editProjectWizard.addRoadUnit
  const updateRoadUnit = isNewMode ? newProjectWizard.updateRoadUnit : editProjectWizard.updateRoadUnit
  const removeRoadUnit = isNewMode ? newProjectWizard.removeRoadUnit : editProjectWizard.removeRoadUnit

  // Legacy aliases
  const containers = seaContainers
  const isLoadingContainers = isLoadingSeaContainers
  const addContainer = addSeaContainer
  const updateContainer = updateSeaContainer
  const removeContainer = removeSeaContainer
  const cargo = isNewMode ? newProjectWizard.cargo : editProjectWizard.cargo
  const isLoadingCargo = isNewMode ? newProjectWizard.isLoadingCargo : editProjectWizard.isLoadingCargo
  const addCargo = isNewMode ? newProjectWizard.addCargo : editProjectWizard.addCargo
  const updateCargo = isNewMode ? newProjectWizard.updateCargo : editProjectWizard.updateCargo
  const removeCargo = isNewMode ? newProjectWizard.removeCargo : editProjectWizard.removeCargo
  const documents = isNewMode ? newProjectWizard.documents : editProjectWizard.documents
  const isLoadingDocuments = isNewMode ? newProjectWizard.isLoadingDocuments : editProjectWizard.isLoadingDocuments
  const uploadDocument = isNewMode ? newProjectWizard.uploadDocument : editProjectWizard.uploadDocument
  const updateDocument = isNewMode ? newProjectWizard.updateDocument : editProjectWizard.updateDocument
  const removeDocument = isNewMode ? newProjectWizard.removeDocument : editProjectWizard.removeDocument
  const extractDocument = isNewMode ? newProjectWizard.extractDocument : editProjectWizard.extractDocument
  const downloadDocument = isNewMode ? newProjectWizard.downloadDocument : editProjectWizard.downloadDocument
  const extractingDocumentId = isNewMode ? newProjectWizard.extractingDocumentId : editProjectWizard.extractingDocumentId
  const saveStatus = isNewMode ? newProjectWizard.saveStatus : editProjectWizard.saveStatus
  const forceSave = isNewMode ? newProjectWizard.forceSave : editProjectWizard.forceSave
  const hasPendingChanges = isNewMode ? newProjectWizard.hasPendingChanges : editProjectWizard.hasPendingChanges

  const isDirty = isNewMode ? newProjectWizard.isDirty : false
  const persistedProjectId = isNewMode ? newProjectWizard.persistedProjectId : null
  const resetDraft = isNewMode ? newProjectWizard.resetDraft : () => {}

  const effectiveProjectId = projectId || persistedProjectId

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
    // Update the project in the database
    updateProject({ transportModes: modes })
  }, [updateProject])

  const handleClose = async () => {
    if (isNewMode && isDirty && !persistedProjectId) {
      setShowDiscardDialog(true)
      return
    }

    if (hasPendingChanges) {
      await forceSave()
    }
    onClose()
  }

  const handleConfirmDiscard = () => {
    resetDraft()
    setShowDiscardDialog(false)
    onClose()
  }

  // Handlers for adding new items
  const handleAddLeg = async () => {
    await addLeg({
      legSequence: legs.length + 1,
      transportMode: 'SEA',
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

  const handleAddSeaContainer = async () => {
    await addSeaContainer({
      containerType: '40HC',
      containerNumber: null,
      sealNumber: null,
      ownershipType: 'coc',
      bookingNumber: null,
      blNumber: null,
      vesselName: null,
      vesselImo: null,
      voyageNumber: null,
      originPort: null,
      destinationPort: null,
      etd: null,
      eta: null,
      atd: null,
      ata: null,
      status: 'not_ready',
      isHazardous: false,
      notes: null,
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

  // Legacy alias
  const handleAddContainer = handleAddSeaContainer

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

  // Legacy alias
  const handleContainerUpdate = handleSeaContainerUpdate

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

  // Handle upload only (returns document ID for the modal)
  const handleUploadDocument = useCallback(async (file: File, category: string): Promise<string | null> => {
    if (!effectiveProjectId) {
      setError('Please save the project first before uploading documents')
      return null
    }

    try {
      const documentId = await uploadDocument(file, category)
      return documentId
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      return null
    }
  }, [effectiveProjectId, uploadDocument])

  // Handle extraction for the modal (returns extraction result)
  const handleExtractForModal = useCallback(async (documentId: string): Promise<any> => {
    try {
      const result = await extractDocument(documentId)
      return result
    } catch (err) {
      throw err // Let the modal handle the error display
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
      // Refresh the selected document
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

  // Loading state only for edit mode
  if (!isNewMode && isLoadingProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not found state only for edit mode
  if (!isNewMode && !project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  if (!project) {
    return null
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {isNewMode && !persistedProjectId
              ? 'New Freight Project'
              : `Project ${project.projectNumber || (effectiveProjectId ? effectiveProjectId.slice(0, 8) : '')}`}
          </h1>
          <Badge variant={project.status === 'draft' ? 'secondary' : 'default'}>
            {(project.status || 'DRAFT').toUpperCase()}
          </Badge>
          {project.originAddress && project.destinationAddress && (
            <span className="text-muted-foreground text-sm">
              {project.originAddress} → {project.destinationAddress}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save status indicator */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-green-600">Saved</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-600">Error saving</span>
              </>
            )}
            {isNewMode && !persistedProjectId && isDirty && saveStatus === 'idle' && (
              <span className="text-yellow-600">Unsaved draft</span>
            )}
          </div>

          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
        mode={mode}
        selectedTransportModes={selectedTransportModes}
        onTransportModesChange={handleTransportModesChange}
      />

      {/* Main content area with tables */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Prompt to select transport modes if none selected */}
        {selectedTransportModes.length === 0 && (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <p className="text-lg mb-2">Select transport modes to begin</p>
            <p className="text-sm">Choose one or more transport modes in the header above: Sea, Air, or Road</p>
          </div>
        )}

        {/* Sea Containers Section - Show when 'sea' is selected */}
        {selectedTransportModes.includes('sea') && (
          <div className="border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setSeaContainersExpanded(!seaContainersExpanded)}
                className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
              >
                {seaContainersExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">Sea Containers</span>
                <Badge variant="secondary">{seaContainers?.length || 0}</Badge>
              </button>
            </div>
            {seaContainersExpanded && (
              <div className="border-t">
                <ProjectSeaContainersTable
                  seaContainers={seaContainers || []}
                  isLoading={isLoadingSeaContainers}
                  onSeaContainerUpdate={handleSeaContainerUpdate}
                  onAddSeaContainer={handleAddSeaContainer}
                  onRemoveSeaContainer={removeSeaContainer}
                />
              </div>
            )}
          </div>
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

        {/* Route Legs Table - Collapsible */}
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setLegsExpanded(!legsExpanded)}
              className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
            >
              {legsExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium">Route Legs</span>
              <Badge variant="secondary">{legs.length}</Badge>
            </button>
            <Button size="sm" variant="outline" onClick={handleAddLeg}>
              <span className="mr-1">+</span>
              Add Leg
            </Button>
          </div>
          {legsExpanded && (
            <div className="border-t">
              <ProjectLegsTable
                legs={legs}
                isLoading={isLoadingLegs}
                onLegUpdate={handleLegUpdate}
                onRemoveLeg={removeLeg}
              />
            </div>
          )}
        </div>

        {/* Documents Table - Collapsible */}
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setDocumentsExpanded(!documentsExpanded)}
              className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
            >
              {documentsExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Documents</span>
              <Badge variant="secondary">{documents.length}</Badge>
            </button>
          </div>
          {documentsExpanded && (
            <div className="border-t">
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
          )}
        </div>
      </div>

      {/* Discard draft dialog */}
      <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscardDialog(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={handleConfirmDiscard}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
