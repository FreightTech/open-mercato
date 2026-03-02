'use client'

import { useState, useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type {
  Project,
  ProjectLeg,
  ProjectSeaContainer,
  ProjectAirUnit,
  ProjectRoadUnit,
  ProjectCargo,
  ProjectDocument,
} from './useProjectWizard'

type DraftLeg = Omit<ProjectLeg, 'id' | 'projectId'> & { tempId: string; realId?: string }
type DraftSeaContainer = Omit<ProjectSeaContainer, 'id' | 'projectId'> & { tempId: string; realId?: string }
type DraftAirUnit = Omit<ProjectAirUnit, 'id' | 'projectId'> & { tempId: string; realId?: string }
type DraftRoadUnit = Omit<ProjectRoadUnit, 'id' | 'projectId'> & { tempId: string; realId?: string }
type DraftCargo = Omit<ProjectCargo, 'id' | 'projectId'> & { tempId: string; realId?: string }
type DraftDocument = Omit<ProjectDocument, 'id'> & { tempId: string; realId?: string; file?: File }

type UseNewProjectWizardOptions = {
  onError?: (error: string) => void
  onProjectCreated?: (projectId: string) => void
}

const defaultDraftProject: Project = {
  id: 'new',
  projectNumber: null,
  clientId: null,
  clientName: null,
  rfqId: null,
  offer: null,
  status: 'draft',
  shipmentType: '',
  cargoType: '',
  direction: '',
  incoterm: null,
  transportModes: null,
  originLocationId: null,
  destinationLocationId: null,
  originAddress: null,
  destinationAddress: null,
  projectDate: new Date().toISOString(),
  requestedPickupDate: null,
  requestedDeliveryDate: null,
  clientReference: null,
  internalReference: null,
  commodityDescription: null,
  hsCode: null,
  containerCount: null,
  transportUnitCount: null,
  totalGrossWeight: null,
  totalVolume: null,
  weightUnit: null,
  volumeUnit: null,
  currencyCode: '',
  estimatedCost: null,
  requiresInsurance: false,
  requiresCustomsBrokerage: false,
  isHazardous: false,
  hazmatDetails: null,
  specialInstructions: null,
  internalNotes: null,
  // Project Detail View Fields (New)
  bookingNumber: null,
  blNumber: null,
  vesselName: null,
  voyageNumber: null,
  operatorId: null,
  operatorName: null,
  salesPersonId: null,
  salesPersonName: null,
  shipperId: null,
  shipperName: null,
  consigneeId: null,
  consigneeName: null,
  // Financial status
  invoicingStatus: null,
  // Shipping dates (project-level)
  etd: null,
  eta: null,
  atd: null,
  ata: null,
  // Cutoff dates (project-level)
  cargoReadyDate: null,
  vgmCutoffDate: null,
  docCutoffDate: null,
  gateInDate: null,
  gateCloseDate: null,
  // Carrier (project-level)
  carrierId: null,
  carrierName: null,
  // Offer exchange rate data (read-only, from linked offer)
  offerExchangeRates: null,
  offerBaseCurrency: null,
}

export function useNewProjectWizard({ onError, onProjectCreated }: UseNewProjectWizardOptions) {
  const queryClient = useQueryClient()
  const [draftProject, setDraftProject] = useState<Project>(defaultDraftProject)
  const [draftLegs, setDraftLegs] = useState<DraftLeg[]>([])
  const [draftSeaContainers, setDraftSeaContainers] = useState<DraftSeaContainer[]>([])
  const [draftAirUnits, setDraftAirUnits] = useState<DraftAirUnit[]>([])
  const [draftRoadUnits, setDraftRoadUnits] = useState<DraftRoadUnit[]>([])
  const [draftCargo, setDraftCargo] = useState<DraftCargo[]>([])
  const [draftDocuments, setDraftDocuments] = useState<DraftDocument[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [extractingDocumentId, setExtractingDocumentId] = useState<string | null>(null)

  const isCreatingProjectRef = useRef(false)
  const persistedProjectIdRef = useRef<string | null>(null)

  // Mutation to create the project
  const createProjectMutation = useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const payload: Record<string, unknown> = {}

      // Only include fields that have values
      if (data.shipmentType) payload.shipmentType = data.shipmentType
      if (data.cargoType) payload.cargoType = data.cargoType
      if (data.direction) payload.direction = data.direction
      if (data.currencyCode) payload.currencyCode = data.currencyCode
      if (data.clientId) payload.clientId = data.clientId
      if (data.incoterm) payload.incoterm = data.incoterm
      if (data.originAddress) payload.originAddress = data.originAddress
      if (data.destinationAddress) payload.destinationAddress = data.destinationAddress
      if (data.clientReference) payload.clientReference = data.clientReference
      if (data.internalReference) payload.internalReference = data.internalReference
      if (data.commodityDescription) payload.commodityDescription = data.commodityDescription
      if (data.hsCode) payload.hsCode = data.hsCode
      if (data.requestedPickupDate) payload.requestedPickupDate = data.requestedPickupDate
      if (data.requestedDeliveryDate) payload.requestedDeliveryDate = data.requestedDeliveryDate
      if (data.specialInstructions) payload.specialInstructions = data.specialInstructions
      if (data.internalNotes) payload.internalNotes = data.internalNotes
      if (data.transportModes) payload.transportModes = data.transportModes

      const response = await apiCall<{ id: string; project_number: string; error?: string }>('/api/fms_projects/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error(response.result?.error || 'Failed to create project')
      return response.result
    },
    onSuccess: async (result) => {
      if (result?.id) {
        setPersistedProjectId(result.id)
        persistedProjectIdRef.current = result.id
        setDraftProject(prev => ({ ...prev, id: result.id, projectNumber: result.project_number }))

        // Persist any existing draft items to the database
        await persistDraftItems(result.id)

        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
        onProjectCreated?.(result.id)
      }
    },
    onError: (err) => {
      isCreatingProjectRef.current = false
      setSaveStatus('error')
      onError?.(err instanceof Error ? err.message : 'Failed to create project')
    },
  })

  // Persist draft items (legs, transport units, cargo) after project is created
  const persistDraftItems = async (projectId: string) => {
    // Persist legs
    if (draftLegs.length > 0) {
      for (const leg of draftLegs) {
        try {
          const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/legs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              legSequence: leg.legSequence,
              transportMode: leg.transportMode,
              carrierId: leg.carrierId,
              originAddress: leg.originAddress,
              destinationAddress: leg.destinationAddress,
            }),
          })
          if (response.ok && response.result?.id) {
            setDraftLegs(prev => prev.map(l =>
              l.tempId === leg.tempId ? { ...l, realId: response.result!.id } : l
            ))
          }
        } catch (err) {
          console.error('Failed to persist leg:', err)
        }
      }
    }

    // Persist sea containers
    if (draftSeaContainers.length > 0) {
      for (const container of draftSeaContainers) {
        try {
          const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/sea-containers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              containerType: container.containerType,
              containerNumber: container.containerNumber,
              sealNumber: container.sealNumber,
              ownershipType: container.ownershipType,
              bookingNumber: container.bookingNumber,
              bolNumber: container.bolNumber,
              carrierCode: container.carrierCode,
              vesselName: container.vesselName,
              originPort: container.originPort,
              destinationPort: container.destinationPort,
              status: container.status,
              isActive: container.isActive,
            }),
          })
          if (response.ok && response.result?.id) {
            setDraftSeaContainers(prev => prev.map(c =>
              c.tempId === container.tempId ? { ...c, realId: response.result!.id } : c
            ))
          }
        } catch (err) {
          console.error('Failed to persist sea container:', err)
        }
      }
    }

    // Persist air units
    if (draftAirUnits.length > 0) {
      for (const unit of draftAirUnits) {
        try {
          const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/air-units`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deliveryStatus: unit.deliveryStatus,
              isLoose: unit.isLoose,
              isStackable: unit.isStackable,
              isDgr: unit.isDgr,
              pieces: unit.pieces,
              grossWeight: unit.grossWeight,
              chargeableWeight: unit.chargeableWeight,
              volume: unit.volume,
              originType: unit.originType,
              originAirport: unit.originAirport,
              destinationAirport: unit.destinationAirport,
              mawbNumber: unit.mawbNumber,
              hawbNumber: unit.hawbNumber,
              flightNumber: unit.flightNumber,
            }),
          })
          if (response.ok && response.result?.id) {
            setDraftAirUnits(prev => prev.map(u =>
              u.tempId === unit.tempId ? { ...u, realId: response.result!.id } : u
            ))
          }
        } catch (err) {
          console.error('Failed to persist air unit:', err)
        }
      }
    }

    // Persist road units
    if (draftRoadUnits.length > 0) {
      for (const unit of draftRoadUnits) {
        try {
          const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/road-units`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicleType: unit.vehicleType,
              truckNumber: unit.truckNumber,
              trailerNumber: unit.trailerNumber,
              driverName: unit.driverName,
              cmrNumber: unit.cmrNumber,
              carrierName: unit.carrierName,
              originAddress: unit.originAddress,
              destinationAddress: unit.destinationAddress,
              pieces: unit.pieces,
              grossWeight: unit.grossWeight,
              palletSpaces: unit.palletSpaces,
              loadingMeters: unit.loadingMeters,
              status: unit.status,
            }),
          })
          if (response.ok && response.result?.id) {
            setDraftRoadUnits(prev => prev.map(u =>
              u.tempId === unit.tempId ? { ...u, realId: response.result!.id } : u
            ))
          }
        } catch (err) {
          console.error('Failed to persist road unit:', err)
        }
      }
    }

    // Persist cargo
    if (draftCargo.length > 0) {
      for (const item of draftCargo) {
        try {
          const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/cargo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commodityDescription: item.description,
              packageCount: item.packageCount,
              packageType: item.packageType,
              grossWeight: item.grossWeight,
              volume: item.volume,
            }),
          })
          if (response.ok && response.result?.id) {
            setDraftCargo(prev => prev.map(c =>
              c.tempId === item.tempId ? { ...c, realId: response.result!.id } : c
            ))
          }
        } catch (err) {
          console.error('Failed to persist cargo:', err)
        }
      }
    }

    // Persist documents
    if (draftDocuments.length > 0) {
      for (const doc of draftDocuments) {
        if (doc.file) {
          try {
            const formData = new FormData()
            formData.append('file', doc.file)
            formData.append('name', doc.name)
            formData.append('category', doc.category)
            formData.append('relatedEntityType', 'fms_projects:fms_project')
            formData.append('relatedEntityId', projectId)

            const response = await apiCall<{ item: { id: string } }>(`/api/fms_projects/projects/${projectId}/documents`, {
              method: 'POST',
              body: formData,
            })
            if (response.ok && response.result?.item?.id) {
              setDraftDocuments(prev => prev.map(d =>
                d.tempId === doc.tempId ? { ...d, realId: response.result!.item.id, file: undefined } : d
              ))
            }
          } catch (err) {
            console.error('Failed to persist document:', err)
          }
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_legs', projectId] })
    queryClient.invalidateQueries({ queryKey: ['fms_project_sea_containers', projectId] })
    queryClient.invalidateQueries({ queryKey: ['fms_project_air_units', projectId] })
    queryClient.invalidateQueries({ queryKey: ['fms_project_road_units', projectId] })
    queryClient.invalidateQueries({ queryKey: ['fms_project_cargo', projectId] })
    queryClient.invalidateQueries({ queryKey: ['fms_project_documents', projectId] })
  }

  // Create project lazily on first meaningful edit
  const maybeCreateProject = useCallback(async (currentDraft: Project) => {
    if (persistedProjectIdRef.current || isCreatingProjectRef.current) {
      return
    }

    // Check if this is a meaningful edit
    const hasMeaningfulData =
      currentDraft.clientId ||
      currentDraft.originAddress ||
      currentDraft.destinationAddress ||
      currentDraft.clientReference ||
      currentDraft.commodityDescription

    if (!hasMeaningfulData) {
      return
    }

    isCreatingProjectRef.current = true
    setSaveStatus('saving')

    await createProjectMutation.mutateAsync(currentDraft)
  }, [createProjectMutation])

  // Update draft project
  const updateProject = useCallback((updates: Partial<Project>) => {
    setIsDirty(true)

    setDraftProject(prev => {
      const newDraft = { ...prev, ...updates }
      maybeCreateProject(newDraft)
      return newDraft
    })
  }, [maybeCreateProject])

  // Add leg
  const addLeg = useCallback(async (legData: Omit<ProjectLeg, 'id' | 'projectId'>) => {
    setIsDirty(true)
    const tempId = `temp_leg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newLeg: DraftLeg = { ...legData, tempId }

    const currentProjectId = persistedProjectIdRef.current
    if (currentProjectId) {
      try {
        const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${currentProjectId}/legs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(legData),
        })
        if (response.ok && response.result?.id) {
          newLeg.realId = response.result.id
          queryClient.invalidateQueries({ queryKey: ['fms_project_legs', currentProjectId] })
        }
      } catch (err) {
        onError?.('Failed to add leg')
      }
    } else {
      maybeCreateProject(draftProject)
    }

    setDraftLegs(prev => [...prev, newLeg])
    return newLeg
  }, [draftProject, maybeCreateProject, queryClient, onError])

  // Update leg
  const updateLeg = useCallback(async (legId: string, updates: Partial<ProjectLeg>) => {
    setDraftLegs(prev => prev.map(leg => {
      if (leg.tempId !== legId && leg.realId !== legId) return leg
      return { ...leg, ...updates }
    }))

    // If persisted, update in database
    const leg = draftLegs.find(l => l.tempId === legId || l.realId === legId)
    if (leg?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/legs/${leg.realId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      } catch (err) {
        onError?.('Failed to update leg')
      }
    }
  }, [draftLegs, onError])

  // Remove leg
  const removeLeg = useCallback(async (legId: string) => {
    const leg = draftLegs.find(l => l.tempId === legId || l.realId === legId)

    if (leg?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/legs/${leg.realId}`, {
          method: 'DELETE',
        })
        queryClient.invalidateQueries({ queryKey: ['fms_project_legs', persistedProjectIdRef.current] })
      } catch (err) {
        onError?.('Failed to remove leg')
      }
    }

    setDraftLegs(prev => prev.filter(l => l.tempId !== legId && l.realId !== legId))
  }, [draftLegs, queryClient, onError])

  // Add sea container
  const addSeaContainer = useCallback(async (containerData: Omit<ProjectSeaContainer, 'id' | 'projectId'>) => {
    setIsDirty(true)
    const tempId = `temp_sea_container_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newContainer: DraftSeaContainer = { ...containerData, tempId }

    const currentProjectId = persistedProjectIdRef.current
    if (currentProjectId) {
      try {
        const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${currentProjectId}/sea-containers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(containerData),
        })
        if (response.ok && response.result?.id) {
          newContainer.realId = response.result.id
          queryClient.invalidateQueries({ queryKey: ['fms_project_sea_containers', currentProjectId] })
        }
      } catch (err) {
        onError?.('Failed to add sea container')
      }
    } else {
      maybeCreateProject(draftProject)
    }

    setDraftSeaContainers(prev => [...prev, newContainer])
    return newContainer
  }, [draftProject, maybeCreateProject, queryClient, onError])

  // Update sea container
  const updateSeaContainer = useCallback(async (containerId: string, updates: Partial<ProjectSeaContainer>) => {
    setDraftSeaContainers(prev => prev.map(container => {
      if (container.tempId !== containerId && container.realId !== containerId) return container
      return { ...container, ...updates }
    }))

    // If persisted, update in database
    const container = draftSeaContainers.find(c => c.tempId === containerId || c.realId === containerId)
    if (container?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/sea-containers/${container.realId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      } catch (err) {
        onError?.('Failed to update sea container')
      }
    }
  }, [draftSeaContainers, onError])

  // Remove sea container
  const removeSeaContainer = useCallback(async (containerId: string) => {
    const container = draftSeaContainers.find(c => c.tempId === containerId || c.realId === containerId)

    if (container?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/sea-containers/${container.realId}`, {
          method: 'DELETE',
        })
        queryClient.invalidateQueries({ queryKey: ['fms_project_sea_containers', persistedProjectIdRef.current] })
      } catch (err) {
        onError?.('Failed to remove sea container')
      }
    }

    setDraftSeaContainers(prev => prev.filter(c => c.tempId !== containerId && c.realId !== containerId))
  }, [draftSeaContainers, queryClient, onError])

  // Backwards compatibility aliases
  const addContainer = addSeaContainer
  const updateContainer = updateSeaContainer
  const removeContainer = removeSeaContainer

  // Add air unit
  const addAirUnit = useCallback(async (airUnitData: Omit<ProjectAirUnit, 'id' | 'projectId'>) => {
    setIsDirty(true)
    const tempId = `temp_air_unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newAirUnit: DraftAirUnit = { ...airUnitData, tempId }

    const currentProjectId = persistedProjectIdRef.current
    if (currentProjectId) {
      try {
        const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${currentProjectId}/air-units`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(airUnitData),
        })
        if (response.ok && response.result?.id) {
          newAirUnit.realId = response.result.id
          queryClient.invalidateQueries({ queryKey: ['fms_project_air_units', currentProjectId] })
        }
      } catch (err) {
        onError?.('Failed to add air unit')
      }
    } else {
      maybeCreateProject(draftProject)
    }

    setDraftAirUnits(prev => [...prev, newAirUnit])
    return newAirUnit
  }, [draftProject, maybeCreateProject, queryClient, onError])

  // Update air unit
  const updateAirUnit = useCallback(async (airUnitId: string, updates: Partial<ProjectAirUnit>) => {
    setDraftAirUnits(prev => prev.map(unit => {
      if (unit.tempId !== airUnitId && unit.realId !== airUnitId) return unit
      return { ...unit, ...updates }
    }))

    // If persisted, update in database
    const unit = draftAirUnits.find(u => u.tempId === airUnitId || u.realId === airUnitId)
    if (unit?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/air-units/${unit.realId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      } catch (err) {
        onError?.('Failed to update air unit')
      }
    }
  }, [draftAirUnits, onError])

  // Remove air unit
  const removeAirUnit = useCallback(async (airUnitId: string) => {
    const unit = draftAirUnits.find(u => u.tempId === airUnitId || u.realId === airUnitId)

    if (unit?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/air-units/${unit.realId}`, {
          method: 'DELETE',
        })
        queryClient.invalidateQueries({ queryKey: ['fms_project_air_units', persistedProjectIdRef.current] })
      } catch (err) {
        onError?.('Failed to remove air unit')
      }
    }

    setDraftAirUnits(prev => prev.filter(u => u.tempId !== airUnitId && u.realId !== airUnitId))
  }, [draftAirUnits, queryClient, onError])

  // Add road unit
  const addRoadUnit = useCallback(async (roadUnitData: Omit<ProjectRoadUnit, 'id' | 'projectId'>) => {
    setIsDirty(true)
    const tempId = `temp_road_unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newRoadUnit: DraftRoadUnit = { ...roadUnitData, tempId }

    const currentProjectId = persistedProjectIdRef.current
    if (currentProjectId) {
      try {
        const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${currentProjectId}/road-units`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(roadUnitData),
        })
        if (response.ok && response.result?.id) {
          newRoadUnit.realId = response.result.id
          queryClient.invalidateQueries({ queryKey: ['fms_project_road_units', currentProjectId] })
        }
      } catch (err) {
        onError?.('Failed to add road unit')
      }
    } else {
      maybeCreateProject(draftProject)
    }

    setDraftRoadUnits(prev => [...prev, newRoadUnit])
    return newRoadUnit
  }, [draftProject, maybeCreateProject, queryClient, onError])

  // Update road unit
  const updateRoadUnit = useCallback(async (roadUnitId: string, updates: Partial<ProjectRoadUnit>) => {
    setDraftRoadUnits(prev => prev.map(unit => {
      if (unit.tempId !== roadUnitId && unit.realId !== roadUnitId) return unit
      return { ...unit, ...updates }
    }))

    // If persisted, update in database
    const unit = draftRoadUnits.find(u => u.tempId === roadUnitId || u.realId === roadUnitId)
    if (unit?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/road-units/${unit.realId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      } catch (err) {
        onError?.('Failed to update road unit')
      }
    }
  }, [draftRoadUnits, onError])

  // Remove road unit
  const removeRoadUnit = useCallback(async (roadUnitId: string) => {
    const unit = draftRoadUnits.find(u => u.tempId === roadUnitId || u.realId === roadUnitId)

    if (unit?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/road-units/${unit.realId}`, {
          method: 'DELETE',
        })
        queryClient.invalidateQueries({ queryKey: ['fms_project_road_units', persistedProjectIdRef.current] })
      } catch (err) {
        onError?.('Failed to remove road unit')
      }
    }

    setDraftRoadUnits(prev => prev.filter(u => u.tempId !== roadUnitId && u.realId !== roadUnitId))
  }, [draftRoadUnits, queryClient, onError])

  // Add cargo
  const addCargo = useCallback(async (cargoData: Omit<ProjectCargo, 'id' | 'projectId'>) => {
    setIsDirty(true)
    const tempId = `temp_cargo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newCargo: DraftCargo = { ...cargoData, tempId }

    const currentProjectId = persistedProjectIdRef.current
    if (currentProjectId) {
      try {
        const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${currentProjectId}/cargo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commodityDescription: cargoData.description,
            packageCount: cargoData.packageCount,
            packageType: cargoData.packageType,
            grossWeight: cargoData.grossWeight,
            volume: cargoData.volume,
          }),
        })
        if (response.ok && response.result?.id) {
          newCargo.realId = response.result.id
          queryClient.invalidateQueries({ queryKey: ['fms_project_cargo', currentProjectId] })
        }
      } catch (err) {
        onError?.('Failed to add cargo')
      }
    } else {
      maybeCreateProject(draftProject)
    }

    setDraftCargo(prev => [...prev, newCargo])
    return newCargo
  }, [draftProject, maybeCreateProject, queryClient, onError])

  // Update cargo
  const updateCargo = useCallback(async (cargoId: string, updates: Partial<ProjectCargo>) => {
    setDraftCargo(prev => prev.map(item => {
      if (item.tempId !== cargoId && item.realId !== cargoId) return item
      return { ...item, ...updates }
    }))

    // If persisted, update in database
    const item = draftCargo.find(c => c.tempId === cargoId || c.realId === cargoId)
    if (item?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/cargo/${item.realId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      } catch (err) {
        onError?.('Failed to update cargo')
      }
    }
  }, [draftCargo, onError])

  // Remove cargo
  const removeCargo = useCallback(async (cargoId: string) => {
    const item = draftCargo.find(c => c.tempId === cargoId || c.realId === cargoId)

    if (item?.realId && persistedProjectIdRef.current) {
      try {
        await apiCall(`/api/fms_projects/projects/${persistedProjectIdRef.current}/cargo/${item.realId}`, {
          method: 'DELETE',
        })
        queryClient.invalidateQueries({ queryKey: ['fms_project_cargo', persistedProjectIdRef.current] })
      } catch (err) {
        onError?.('Failed to remove cargo')
      }
    }

    setDraftCargo(prev => prev.filter(c => c.tempId !== cargoId && c.realId !== cargoId))
  }, [draftCargo, queryClient, onError])

  // Upload document
  const uploadDocument = useCallback(async (file: File, category: string): Promise<string | null> => {
    setIsDirty(true)
    const tempId = `temp_doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newDoc: DraftDocument = {
      tempId,
      name: file.name,
      category,
      createdAt: new Date().toISOString(),
      file,
    }

    const currentProjectId = persistedProjectIdRef.current
    if (currentProjectId) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('name', file.name)
        formData.append('category', category)
        formData.append('relatedEntityType', 'fms_projects:fms_project')
        formData.append('relatedEntityId', currentProjectId)

        const response = await apiCall<{ item: { id: string } }>(`/api/fms_projects/projects/${currentProjectId}/documents`, {
          method: 'POST',
          body: formData,
        })
        if (response.ok && response.result?.item?.id) {
          newDoc.realId = response.result.item.id
          newDoc.file = undefined
          queryClient.invalidateQueries({ queryKey: ['fms_project_documents', currentProjectId] })
          setDraftDocuments(prev => [...prev, newDoc])
          return response.result.item.id
        }
      } catch (err) {
        onError?.('Failed to upload document')
        return null
      }
    } else {
      maybeCreateProject(draftProject)
    }

    setDraftDocuments(prev => [...prev, newDoc])
    return newDoc.realId || tempId
  }, [draftProject, maybeCreateProject, queryClient, onError])

  // Upload document and auto-extract
  const uploadAndExtract = useCallback(async (file: File, category: string): Promise<string | null> => {
    const documentId = await uploadDocument(file, category)
    if (!documentId) return null

    // Find the draft document to get the realId
    const doc = draftDocuments.find(d => d.tempId === documentId || d.realId === documentId)
    const realId = doc?.realId || documentId

    // Only extract if we have a real ID and project
    if (!realId.startsWith('temp_') && persistedProjectIdRef.current) {
      setExtractingDocumentId(documentId)
      try {
        await apiCall(`/api/fms_documents/documents/${realId}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: persistedProjectIdRef.current }),
        })
        queryClient.invalidateQueries({ queryKey: ['fms_project_documents', persistedProjectIdRef.current] })
      } catch (err) {
        console.error('Auto-extraction failed:', err)
        // Don't fail the whole operation if extraction fails
      } finally {
        setExtractingDocumentId(null)
      }
    }

    return documentId
  }, [uploadDocument, draftDocuments, queryClient])

  // Update document
  const updateDocument = useCallback(async (documentId: string, updates: Partial<ProjectDocument>) => {
    setDraftDocuments(prev => prev.map(doc => {
      if (doc.tempId !== documentId && doc.realId !== documentId) return doc
      return { ...doc, ...updates }
    }))

    // If persisted, update in database
    const doc = draftDocuments.find(d => d.tempId === documentId || d.realId === documentId)
    if (doc?.realId) {
      try {
        await apiCall(`/api/fms_documents/documents/${doc.realId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        if (persistedProjectIdRef.current) {
          queryClient.invalidateQueries({ queryKey: ['fms_project_documents', persistedProjectIdRef.current] })
        }
      } catch (err) {
        onError?.('Failed to update document')
      }
    }
  }, [draftDocuments, queryClient, onError])

  // Remove document
  const removeDocument = useCallback(async (documentId: string) => {
    const doc = draftDocuments.find(d => d.tempId === documentId || d.realId === documentId)

    if (doc?.realId) {
      try {
        await apiCall(`/api/fms_documents/documents/${doc.realId}`, {
          method: 'DELETE',
        })
        if (persistedProjectIdRef.current) {
          queryClient.invalidateQueries({ queryKey: ['fms_project_documents', persistedProjectIdRef.current] })
        }
      } catch (err) {
        onError?.('Failed to remove document')
      }
    }

    setDraftDocuments(prev => prev.filter(d => d.tempId !== documentId && d.realId !== documentId))
  }, [draftDocuments, queryClient, onError])

  // Extract document
  const extractDocument = useCallback(async (documentId: string) => {
    const doc = draftDocuments.find(d => d.tempId === documentId || d.realId === documentId)
    if (!doc?.realId || !persistedProjectIdRef.current) {
      onError?.('Document must be saved before extraction')
      return null
    }

    setExtractingDocumentId(documentId)
    try {
      const response = await apiCall(`/api/fms_documents/documents/${doc.realId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: persistedProjectIdRef.current }),
      })

      if (!response.ok) {
        onError?.('Failed to extract document')
        return null
      }

      queryClient.invalidateQueries({ queryKey: ['fms_project_documents', persistedProjectIdRef.current] })
      return response.result
    } finally {
      setExtractingDocumentId(null)
    }
  }, [draftDocuments, queryClient, onError])

  // Download document
  const downloadDocument = useCallback((documentId: string) => {
    const doc = draftDocuments.find(d => d.tempId === documentId || d.realId === documentId)
    if (doc?.realId) {
      window.open(`/api/fms_documents/documents/${doc.realId}/download`, '_blank')
    }
  }, [draftDocuments])

  // Convert draft items to standard format
  const legs: ProjectLeg[] = draftLegs.map(leg => ({
    id: leg.realId || leg.tempId,
    projectId: persistedProjectId || 'new',
    legSequence: leg.legSequence,
    transportMode: leg.transportMode,
    carrierId: leg.carrierId,
    carrierName: leg.carrierName,
    originLocationId: leg.originLocationId,
    destinationLocationId: leg.destinationLocationId,
    originAddress: leg.originAddress,
    destinationAddress: leg.destinationAddress,
    estimatedDeparture: leg.estimatedDeparture,
    estimatedArrival: leg.estimatedArrival,
    vesselName: leg.vesselName,
    voyageNumber: leg.voyageNumber,
    bookingNumber: leg.bookingNumber,
    billOfLadingNumber: leg.billOfLadingNumber,
  }))

  const seaContainers: ProjectSeaContainer[] = draftSeaContainers.map(container => ({
    id: container.realId || container.tempId,
    projectId: persistedProjectId || 'new',
    containerType: container.containerType,
    containerNumber: container.containerNumber,
    sealNumber: container.sealNumber,
    ownershipType: container.ownershipType,
    bookingNumber: container.bookingNumber,
    bolNumber: container.bolNumber,
    carrierCode: container.carrierCode,
    vesselName: container.vesselName,
    vesselImo: container.vesselImo,
    voyageNumber: container.voyageNumber,
    originPort: container.originPort,
    destinationPort: container.destinationPort,
    etd: container.etd,
    eta: container.eta,
    atd: container.atd,
    ata: container.ata,
    status: container.status,
    isActive: container.isActive,
    isHazardous: container.isHazardous,
    notes: container.notes,
    // Multi-source timestamp arrays (for rich display with history)
    etdTimestamps: container.etdTimestamps ?? null,
    etaTimestamps: container.etaTimestamps ?? null,
    atdTimestamps: container.atdTimestamps ?? null,
    ataTimestamps: container.ataTimestamps ?? null,
    // Tracking integration fields (read-only, set by sync)
    trackedShipmentId: container.trackedShipmentId,
    lastSyncedAt: container.lastSyncedAt,
    syncStatus: container.syncStatus,
  }))

  // Backwards compatibility alias
  const containers = seaContainers

  const airUnits: ProjectAirUnit[] = draftAirUnits.map(unit => ({
    id: unit.realId || unit.tempId,
    projectId: persistedProjectId || 'new',
    deliveryStatus: unit.deliveryStatus,
    isLoose: unit.isLoose,
    isStackable: unit.isStackable,
    isDgr: unit.isDgr,
    dgrUnNumber: unit.dgrUnNumber,
    dgrClass: unit.dgrClass,
    pieces: unit.pieces,
    grossWeight: unit.grossWeight,
    chargeableWeight: unit.chargeableWeight,
    volume: unit.volume,
    loadingMeters: unit.loadingMeters,
    commodity: unit.commodity,
    description: unit.description,
    targetRate: unit.targetRate,
    unitType: unit.unitType,
    unitNumber: unit.unitNumber,
    originType: unit.originType,
    originAirport: unit.originAirport,
    destinationAirport: unit.destinationAirport,
    shipmentReadyDate: unit.shipmentReadyDate,
    requiredAtDestination: unit.requiredAtDestination,
    etd: unit.etd,
    eta: unit.eta,
    atd: unit.atd,
    ata: unit.ata,
    mawbNumber: unit.mawbNumber,
    hawbNumber: unit.hawbNumber,
    bookingNumber: unit.bookingNumber,
    flightNumber: unit.flightNumber,
    carrierCode: unit.carrierCode,
    aircraftType: unit.aircraftType,
    notes: unit.notes,
  }))

  const roadUnits: ProjectRoadUnit[] = draftRoadUnits.map(unit => ({
    id: unit.realId || unit.tempId,
    projectId: persistedProjectId || 'new',
    vehicleType: unit.vehicleType,
    truckNumber: unit.truckNumber,
    trailerNumber: unit.trailerNumber,
    driverName: unit.driverName,
    driverPhone: unit.driverPhone,
    cmrNumber: unit.cmrNumber,
    bookingNumber: unit.bookingNumber,
    carrierName: unit.carrierName,
    carrierContact: unit.carrierContact,
    originAddress: unit.originAddress,
    destinationAddress: unit.destinationAddress,
    pickupDate: unit.pickupDate,
    deliveryDate: unit.deliveryDate,
    actualPickup: unit.actualPickup,
    actualDelivery: unit.actualDelivery,
    pieces: unit.pieces,
    grossWeight: unit.grossWeight,
    palletSpaces: unit.palletSpaces,
    loadingMeters: unit.loadingMeters,
    status: unit.status,
    isHazardous: unit.isHazardous,
    notes: unit.notes,
  }))

  const cargo: ProjectCargo[] = draftCargo.map(item => ({
    id: item.realId || item.tempId,
    projectId: persistedProjectId || 'new',
    description: item.description,
    packageCount: item.packageCount,
    packageType: item.packageType,
    grossWeight: item.grossWeight,
    volume: item.volume,
    length: item.length,
    width: item.width,
    height: item.height,
  }))

  const documents: ProjectDocument[] = draftDocuments.map(doc => ({
    id: doc.realId || doc.tempId,
    name: doc.name,
    category: doc.category,
    description: doc.description,
    createdAt: doc.createdAt,
    processedAt: doc.processedAt,
    extractedData: doc.extractedData,
    attachment: doc.attachment,
  }))

  // Reset for close without save
  const resetDraft = useCallback(() => {
    setDraftProject(defaultDraftProject)
    setDraftLegs([])
    setDraftSeaContainers([])
    setDraftAirUnits([])
    setDraftRoadUnits([])
    setDraftCargo([])
    setDraftDocuments([])
    setIsDirty(false)
    setPersistedProjectId(null)
    persistedProjectIdRef.current = null
    setSaveStatus('idle')
    isCreatingProjectRef.current = false
    setExtractingDocumentId(null)
  }, [])

  return {
    // Draft state
    draftProject,
    isDirty,
    persistedProjectId,

    // Project-like object for display
    project: draftProject,
    isLoadingProject: false,
    updateProject,

    // Legs
    legs,
    isLoadingLegs: false,
    addLeg,
    updateLeg,
    removeLeg,

    // Sea Containers
    seaContainers,
    isLoadingSeaContainers: false,
    addSeaContainer,
    updateSeaContainer,
    removeSeaContainer,

    // Backwards compatibility for containers
    containers,
    isLoadingContainers: false,
    addContainer,
    updateContainer,
    removeContainer,

    // Air Units
    airUnits,
    isLoadingAirUnits: false,
    addAirUnit,
    updateAirUnit,
    removeAirUnit,

    // Road Units
    roadUnits,
    isLoadingRoadUnits: false,
    addRoadUnit,
    updateRoadUnit,
    removeRoadUnit,

    // Cargo
    cargo,
    isLoadingCargo: false,
    addCargo,
    updateCargo,
    removeCargo,

    // Documents
    documents,
    isLoadingDocuments: false,
    uploadDocument,
    uploadAndExtract,
    updateDocument,
    removeDocument,
    extractDocument,
    downloadDocument,
    extractingDocumentId,

    // Save status
    saveStatus,
    forceSave: async () => {},
    hasPendingChanges: isDirty && !persistedProjectId,
    isCreating: createProjectMutation.isPending,

    // Reset
    resetDraft,
  }
}
