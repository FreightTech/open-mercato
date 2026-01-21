/**
 * FMS Projects Module - New Project View
 * Creates a new project using lazy/deferred creation pattern
 */

'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Loader2, AlertCircle, ChevronDown, ChevronRight, Save } from 'lucide-react'
import { useProjectWizard, type TransportModeType } from '../../../components/ProjectWizard/hooks/useProjectWizard'
import { ProjectWizardHeader } from '../../../components/ProjectWizard/ProjectWizardHeader'
import { ProjectSeaContainersTable } from '../../../components/ProjectWizard/ProjectSeaContainersTable'
import { ProjectAirUnitsTable } from '../../../components/ProjectWizard/ProjectAirUnitsTable'
import { ProjectRoadUnitsTable } from '../../../components/ProjectWizard/ProjectRoadUnitsTable'
import { ProjectCargoTable } from '../../../components/ProjectWizard/ProjectCargoTable'
import { ProjectDocumentsTable } from '../../../components/ProjectWizard/ProjectDocumentsTable'
import { ProjectFinancialSection } from '../../../components/ProjectFinancialSection'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

export default function NewProjectPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [seaContainersExpanded, setSeaContainersExpanded] = useState(true)
  const [airUnitsExpanded, setAirUnitsExpanded] = useState(true)
  const [roadUnitsExpanded, setRoadUnitsExpanded] = useState(true)
  const [cargoExpanded, setCargoExpanded] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Transport modes multi-select state
  const [selectedTransportModes, setSelectedTransportModes] = useState<TransportModeType[]>([])

  // Use the project wizard hook in new mode
  const {
    project,
    isDirty,
    handleSave,
    updateProject,
    saveStatus,
  } = useProjectWizard({
    projectId: '',
    mode: 'new',
    onError: setError,
    onProjectCreated: (newId) => {
      flash('Project created successfully', 'success')
      router.push(`/backend/fms-projects/${newId}`)
    },
  })

  // Handler for transport mode changes
  const handleTransportModesChange = useCallback((modes: TransportModeType[]) => {
    setSelectedTransportModes(modes)
    updateProject({ transportModes: modes })
  }, [updateProject])

  // Handle save button click
  const handleSaveClick = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await handleSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, handleSave])

  // No-op handlers for tables (can't add items until project is saved)
  const handleNoOp = useCallback(() => {
    flash('Please save the project first', 'info')
  }, [])
  const handleNoOpAsync = useCallback(async (_data?: unknown) => {
    flash('Please save the project first', 'info')
    return null
  }, [])
  const handleNoOpUpdate = useCallback(async (_id: string, _field: string, _value: unknown) => {
    flash('Please save the project first', 'info')
  }, [])
  const handleNoOpRemove = useCallback(async (_id: string) => {
    flash('Please save the project first', 'info')
  }, [])

  // No project data yet (shouldn't happen with draft state)
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
        mode="new"
        selectedTransportModes={selectedTransportModes}
        onTransportModesChange={handleTransportModesChange}
        projectNumber="NEW"
        status="draft"
        saveStatus={saveStatus}
      />

      {/* Save button bar */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isDirty ? 'Unsaved changes' : 'Fill in the project details and save'}
        </div>
        <Button onClick={handleSaveClick} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Create Project
            </>
          )}
        </Button>
      </div>

      {/* Main content area with tables */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Sea Containers Section - Show when 'ship' is selected */}
        {selectedTransportModes.includes('ship') && (
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
                <Badge variant="secondary">0</Badge>
              </button>
            </div>
            {seaContainersExpanded && (
              <div className="border-t">
                <ProjectSeaContainersTable
                  projectId=""
                  seaContainers={[]}
                  isLoading={false}
                  onSeaContainerUpdate={handleNoOpUpdate}
                  onAddSeaContainer={handleNoOpAsync}
                  onRemoveSeaContainer={handleNoOpRemove}
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
                <Badge variant="secondary">0</Badge>
              </button>
            </div>
            {airUnitsExpanded && (
              <div className="border-t">
                <ProjectAirUnitsTable
                  airUnits={[]}
                  isLoading={false}
                  onAirUnitUpdate={handleNoOpUpdate}
                  onAddAirUnit={handleNoOpAsync}
                  onRemoveAirUnit={handleNoOpRemove}
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
                <Badge variant="secondary">0</Badge>
              </button>
            </div>
            {roadUnitsExpanded && (
              <div className="border-t">
                <ProjectRoadUnitsTable
                  roadUnits={[]}
                  isLoading={false}
                  onRoadUnitUpdate={handleNoOpUpdate}
                  onAddRoadUnit={handleNoOpAsync}
                  onRemoveRoadUnit={handleNoOpRemove}
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
                <Badge variant="secondary">0</Badge>
              </button>
            </div>
            {cargoExpanded && (
              <div className="border-t">
                <ProjectCargoTable
                  cargo={[]}
                  isLoading={false}
                  onCargoUpdate={handleNoOpUpdate}
                  onAddCargo={handleNoOpAsync}
                  onRemoveCargo={handleNoOpRemove}
                />
              </div>
            )}
          </div>
        )}

        {/* Products & Costs Section */}
        <ProjectFinancialSection
          projectId=""
          offerId={null}
          currencyCode={project.currencyCode || 'PLN'}
          onError={setError}
        />

        {/* Documents Table */}
        <ProjectDocumentsTable
          documents={[]}
          isLoading={false}
          onDocumentUpdate={handleNoOpUpdate}
          onUpload={handleNoOp}
          onRemoveDocument={handleNoOpRemove}
          onDocumentClick={handleNoOp}
          extractingDocumentId={null}
        />
      </div>
    </div>
  )
}
