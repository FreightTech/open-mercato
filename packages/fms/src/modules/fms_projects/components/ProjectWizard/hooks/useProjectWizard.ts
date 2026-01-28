'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

// Default project factory for new mode
function createDefaultProject(): Project {
  return {
    id: 'draft',
    projectNumber: null,
    clientId: null,
    clientName: null,
    quoteId: null,
    offer: null,
    status: 'draft',
    shipmentType: 'EXP',
    cargoType: 'fcl',
    direction: 'export',
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
    currencyCode: 'PLN',
    estimatedCost: null,
    requiresInsurance: false,
    requiresCustomsBrokerage: false,
    isHazardous: false,
    hazmatDetails: null,
    specialInstructions: null,
    internalNotes: null,
    // Project Detail View Fields (New)
    bookingNumber: null,
    operatorId: null,
    operatorName: null,
    salesPersonId: null,
    salesPersonName: null,
    shipperId: null,
    shipperName: null,
    consigneeId: null,
    consigneeName: null,
  }
}

// Types
export interface ClientRef {
  id: string
  name: string
  shortName?: string | null
}

export interface LocationRef {
  id: string
  locode?: string | null
  name: string
  city?: string | null
  country?: string | null
}

export type TransportModeType = 'ship' | 'air' | 'ftl' | 'ltl' | 'train' | 'barge'

export interface Project {
  id: string
  projectNumber: string | null
  clientId: string | null
  clientName: string | null
  quoteId: string | null
  offer: { id: string } | null
  status: string
  shipmentType: string
  cargoType: string
  direction: string
  incoterm: string | null
  transportModes: TransportModeType[] | null
  originLocationId: string | null
  destinationLocationId: string | null
  originAddress: string | null
  destinationAddress: string | null
  projectDate: string
  requestedPickupDate: string | null
  requestedDeliveryDate: string | null
  clientReference: string | null
  internalReference: string | null
  commodityDescription: string | null
  hsCode: string | null
  containerCount: number | null
  transportUnitCount: number | null
  totalGrossWeight: string | null
  totalVolume: string | null
  weightUnit: string | null
  volumeUnit: string | null
  currencyCode: string
  estimatedCost: string | null
  requiresInsurance: boolean
  requiresCustomsBrokerage: boolean
  isHazardous: boolean
  hazmatDetails: string | null
  specialInstructions: string | null
  internalNotes: string | null
  // Project Detail View Fields (New)
  bookingNumber: string | null
  operatorId: string | null
  operatorName: string | null
  salesPersonId: string | null
  salesPersonName: string | null
  shipperId: string | null
  shipperName: string | null
  consigneeId: string | null
  consigneeName: string | null
}

export interface ProjectLeg {
  id: string
  projectId: string
  legSequence: number
  transportMode: string
  carrierId: string | null
  carrierName: string | null
  originLocationId: string | null
  destinationLocationId: string | null
  originAddress: string | null
  destinationAddress: string | null
  estimatedDeparture: string | null
  estimatedArrival: string | null
  vesselName: string | null
  voyageNumber: string | null
  bookingNumber: string | null
  billOfLadingNumber: string | null
}

// Sea Container (replaces ProjectContainer)
export interface ProjectSeaContainer {
  id: string
  projectId: string
  containerType: string
  containerNumber: string | null
  sealNumber: string | null
  ownershipType: string | null
  bookingNumber: string | null
  blNumber: string | null
  vesselName: string | null
  vesselImo: string | null
  voyageNumber: string | null
  originPort: string | null
  destinationPort: string | null
  etd: string | null
  eta: string | null
  atd: string | null
  ata: string | null
  status: string
  isHazardous: boolean
  notes: string | null
}

// Air Unit
export interface ProjectAirUnit {
  id: string
  projectId: string
  deliveryStatus: string
  isLoose: boolean
  isStackable: boolean
  isDgr: boolean
  dgrUnNumber: string | null
  dgrClass: string | null
  pieces: number | null
  grossWeight: string | null
  chargeableWeight: string | null
  volume: string | null
  loadingMeters: string | null
  commodity: string | null
  description: string | null
  targetRate: string | null
  unitType: string | null
  unitNumber: string | null
  originType: string
  originAirport: string | null
  destinationAirport: string | null
  shipmentReadyDate: string | null
  requiredAtDestination: string | null
  etd: string | null
  eta: string | null
  atd: string | null
  ata: string | null
  mawbNumber: string | null
  hawbNumber: string | null
  bookingNumber: string | null
  flightNumber: string | null
  carrierCode: string | null
  aircraftType: string | null
  notes: string | null
}

// Road Unit
export interface ProjectRoadUnit {
  id: string
  projectId: string
  vehicleType: string
  truckNumber: string | null
  trailerNumber: string | null
  driverName: string | null
  driverPhone: string | null
  cmrNumber: string | null
  bookingNumber: string | null
  carrierName: string | null
  carrierContact: string | null
  originAddress: string | null
  destinationAddress: string | null
  pickupDate: string | null
  deliveryDate: string | null
  actualPickup: string | null
  actualDelivery: string | null
  pieces: number | null
  grossWeight: string | null
  palletSpaces: number | null
  loadingMeters: string | null
  status: string
  isHazardous: boolean
  notes: string | null
}

// Legacy alias for backwards compatibility
export type ProjectContainer = ProjectSeaContainer

export interface ProjectCargo {
  id: string
  projectId: string
  description: string | null
  packageCount: number | null
  packageType: string | null
  grossWeight: string | null
  volume: string | null
  length: string | null
  width: string | null
  height: string | null
}

export interface ProjectDocument {
  id: string
  name: string
  category: string
  description?: string | null
  createdAt: string
  processedAt?: string | null
  extractedData?: {
    success: boolean
    document_type: string
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    data: Record<string, unknown>
    raw_text?: string
    processing_time_ms: number
  } | null
  attachment?: {
    id: string
    fileName: string
    fileSize: number
    mimeType: string
  } | null
}

type UseProjectWizardOptions = {
  projectId: string
  mode?: 'new' | 'edit'
  onError?: (error: string) => void
  onProjectCreated?: (projectId: string) => void
}

export function useProjectWizard({ projectId, mode = 'edit', onError, onProjectCreated }: UseProjectWizardOptions) {
  const queryClient = useQueryClient()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const pendingUpdatesRef = useRef<Partial<Project>>({})
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // New mode state
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(null)
  const isNewMode = mode === 'new' && !persistedProjectId
  const effectiveProjectId = projectId || persistedProjectId || ''

  // Draft state for new mode
  const [draftProject, setDraftProject] = useState<Project>(() => createDefaultProject())
  const [isDirty, setIsDirty] = useState(false)

  // Fetch project data (disabled in new mode)
  const { data: fetchedProject, isLoading: isLoadingProject, error: projectError } = useQuery({
    queryKey: ['fms_project', effectiveProjectId],
    queryFn: async () => {
      const response = await apiCall<any>(`/api/fms_projects/projects/${effectiveProjectId}`)
      if (!response.ok) throw new Error('Failed to load project')
      const data = response.result
      // Convert snake_case to camelCase
      return {
        id: data.id,
        projectNumber: data.project_number,
        clientId: data.client_id,
        clientName: data.client?.name || data.client_name,
        quoteId: data.quote_id,
        offer: data.offer_id ? { id: data.offer_id } : null,
        status: data.current_step || 'draft',
        shipmentType: data.shipment_type,
        cargoType: data.cargo_type,
        direction: data.direction,
        incoterm: data.incoterm,
        transportModes: data.transport_modes || null,
        originLocationId: data.origin_location_id,
        destinationLocationId: data.destination_location_id,
        originAddress: data.origin_address,
        destinationAddress: data.destination_address,
        projectDate: data.project_date,
        requestedPickupDate: data.requested_pickup_date,
        requestedDeliveryDate: data.requested_delivery_date,
        clientReference: data.client_reference,
        internalReference: data.internal_reference,
        commodityDescription: data.commodity_description,
        hsCode: data.hs_code,
        containerCount: data.container_count,
        transportUnitCount: data.transport_unit_count,
        totalGrossWeight: data.total_gross_weight,
        totalVolume: data.total_volume,
        weightUnit: data.weight_unit,
        volumeUnit: data.volume_unit,
        currencyCode: data.currency_code || 'PLN',
        estimatedCost: data.estimated_cost,
        requiresInsurance: data.requires_insurance || false,
        requiresCustomsBrokerage: data.requires_customs_brokerage || false,
        isHazardous: data.is_hazardous || false,
        hazmatDetails: data.hazmat_details,
        specialInstructions: data.special_instructions,
        internalNotes: data.internal_notes,
        // Project Detail View Fields (New)
        bookingNumber: data.booking_number,
        operatorId: data.operator_id,
        operatorName: data.operator_name,
        salesPersonId: data.sales_person_id,
        salesPersonName: data.sales_person_name,
        shipperId: data.shipper_id,
        shipperName: data.shipper?.name || data.shipper_name,
        consigneeId: data.consignee_id,
        consigneeName: data.consignee?.name || data.consignee_name,
      } as Project
    },
    enabled: !isNewMode && !!effectiveProjectId,
  })

  // Memoized project - returns draft or fetched data
  const project = useMemo(() => {
    if (isNewMode) return draftProject
    return fetchedProject ?? null
  }, [isNewMode, draftProject, fetchedProject])

  // Fetch legs (disabled in new mode)
  const { data: legs = [], isLoading: isLoadingLegs } = useQuery({
    queryKey: ['fms_project_legs', effectiveProjectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(`/api/fms_projects/projects/${effectiveProjectId}/legs`)
      if (!response.ok) return []
      return (response.result?.items || []).map((leg: any) => ({
        id: leg.id,
        projectId: leg.project_id,
        legSequence: leg.leg_sequence,
        transportMode: leg.transport_mode,
        carrierId: leg.carrier_id,
        carrierName: leg.carrier?.name || leg.carrier_name,
        originLocationId: leg.origin_location_id,
        destinationLocationId: leg.destination_location_id,
        originAddress: leg.origin_address,
        destinationAddress: leg.destination_address,
        estimatedDeparture: leg.estimated_departure,
        estimatedArrival: leg.estimated_arrival,
        vesselName: leg.vessel_name,
        voyageNumber: leg.voyage_number,
        bookingNumber: leg.booking_number,
        billOfLadingNumber: leg.bill_of_lading_number,
      })) as ProjectLeg[]
    },
    enabled: !isNewMode && !!effectiveProjectId,
  })

  // Fetch sea containers (disabled in new mode)
  const { data: seaContainers = [], isLoading: isLoadingSeaContainers } = useQuery({
    queryKey: ['fms_project_sea_containers', effectiveProjectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(`/api/fms_projects/projects/${effectiveProjectId}/sea-containers`)
      if (!response.ok) return []
      return (response.result?.items || []).map((container: any) => ({
        id: container.id,
        projectId: container.project_id,
        containerType: container.container_type,
        containerNumber: container.container_number,
        sealNumber: container.seal_number,
        ownershipType: container.ownership_type,
        bookingNumber: container.booking_number,
        blNumber: container.bl_number,
        vesselName: container.vessel_name,
        vesselImo: container.vessel_imo,
        voyageNumber: container.voyage_number,
        originPort: container.origin_port,
        destinationPort: container.destination_port,
        etd: container.etd,
        eta: container.eta,
        atd: container.atd,
        ata: container.ata,
        status: container.status || 'not_ready',
        isHazardous: container.is_hazardous || false,
        notes: container.notes,
      })) as ProjectSeaContainer[]
    },
    enabled: !isNewMode && !!effectiveProjectId,
  })

  // Backwards compatibility alias
  const containers = seaContainers
  const isLoadingContainers = isLoadingSeaContainers

  // Fetch air units (disabled in new mode)
  const { data: airUnits = [], isLoading: isLoadingAirUnits } = useQuery({
    queryKey: ['fms_project_air_units', effectiveProjectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(`/api/fms_projects/projects/${effectiveProjectId}/air-units`)
      if (!response.ok) return []
      return (response.result?.items || []).map((unit: any) => ({
        id: unit.id,
        projectId: unit.project_id,
        deliveryStatus: unit.delivery_status || 'awaiting',
        isLoose: unit.is_loose ?? true,
        isStackable: unit.is_stackable ?? true,
        isDgr: unit.is_dgr || false,
        dgrUnNumber: unit.dgr_un_number,
        dgrClass: unit.dgr_class,
        pieces: unit.pieces,
        grossWeight: unit.gross_weight,
        chargeableWeight: unit.chargeable_weight,
        volume: unit.volume,
        loadingMeters: unit.loading_meters,
        commodity: unit.commodity,
        description: unit.description,
        targetRate: unit.target_rate,
        unitType: unit.unit_type,
        unitNumber: unit.unit_number,
        originType: unit.origin_type || 'airport',
        originAirport: unit.origin_airport,
        destinationAirport: unit.destination_airport,
        shipmentReadyDate: unit.shipment_ready_date,
        requiredAtDestination: unit.required_at_destination,
        etd: unit.etd,
        eta: unit.eta,
        atd: unit.atd,
        ata: unit.ata,
        mawbNumber: unit.mawb_number,
        hawbNumber: unit.hawb_number,
        bookingNumber: unit.booking_number,
        flightNumber: unit.flight_number,
        carrierCode: unit.carrier_code,
        aircraftType: unit.aircraft_type,
        notes: unit.notes,
      })) as ProjectAirUnit[]
    },
    enabled: !isNewMode && !!effectiveProjectId,
  })

  // Fetch road units (disabled in new mode)
  const { data: roadUnits = [], isLoading: isLoadingRoadUnits } = useQuery({
    queryKey: ['fms_project_road_units', effectiveProjectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(`/api/fms_projects/projects/${effectiveProjectId}/road-units`)
      if (!response.ok) return []
      return (response.result?.items || []).map((unit: any) => ({
        id: unit.id,
        projectId: unit.project_id,
        vehicleType: unit.vehicle_type || 'ftl_truck',
        truckNumber: unit.truck_number,
        trailerNumber: unit.trailer_number,
        driverName: unit.driver_name,
        driverPhone: unit.driver_phone,
        cmrNumber: unit.cmr_number,
        bookingNumber: unit.booking_number,
        carrierName: unit.carrier_name,
        carrierContact: unit.carrier_contact,
        originAddress: unit.origin_address,
        destinationAddress: unit.destination_address,
        pickupDate: unit.pickup_date,
        deliveryDate: unit.delivery_date,
        actualPickup: unit.actual_pickup,
        actualDelivery: unit.actual_delivery,
        pieces: unit.pieces,
        grossWeight: unit.gross_weight,
        palletSpaces: unit.pallet_spaces,
        loadingMeters: unit.loading_meters,
        status: unit.status || 'not_ready',
        isHazardous: unit.is_hazardous || false,
        notes: unit.notes,
      })) as ProjectRoadUnit[]
    },
    enabled: !isNewMode && !!effectiveProjectId,
  })

  // Fetch cargo (disabled in new mode)
  const { data: cargo = [], isLoading: isLoadingCargo } = useQuery({
    queryKey: ['fms_project_cargo', effectiveProjectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(`/api/fms_projects/projects/${effectiveProjectId}/cargo`)
      if (!response.ok) return []
      return (response.result?.items || []).map((item: any) => ({
        id: item.id,
        projectId: item.project_id,
        description: item.commodity_description || item.description,
        packageCount: item.package_count,
        packageType: item.package_type,
        grossWeight: item.gross_weight,
        volume: item.volume,
        length: item.length,
        width: item.width,
        height: item.height,
      })) as ProjectCargo[]
    },
    enabled: !isNewMode && !!effectiveProjectId,
  })

  // Fetch documents (disabled in new mode)
  const { data: documents = [], isLoading: isLoadingDocuments } = useQuery({
    queryKey: ['fms_project_documents', effectiveProjectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(`/api/fms_projects/projects/${effectiveProjectId}/documents`)
      if (!response.ok) return []
      return (response.result?.items || []).map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        description: doc.description,
        createdAt: doc.created_at || doc.createdAt,
        processedAt: doc.processed_at || doc.processedAt,
        extractedData: doc.extracted_data || doc.extractedData,
        attachment: doc.attachment ? {
          id: doc.attachment.id,
          fileName: doc.attachment.file_name || doc.attachment.fileName,
          fileSize: doc.attachment.file_size || doc.attachment.fileSize,
          mimeType: doc.attachment.mime_type || doc.attachment.mimeType,
        } : null,
      })) as ProjectDocument[]
    },
    enabled: !isNewMode && !!effectiveProjectId,
  })

  // Extracting document state
  const [extractingDocumentId, setExtractingDocumentId] = useState<string | null>(null)

  // Update project mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Project>) => {
      // Convert camelCase to snake_case for API
      const payload: Record<string, any> = {}
      if (updates.clientId !== undefined) payload.clientId = updates.clientId
      if (updates.shipmentType !== undefined) payload.shipmentType = updates.shipmentType
      if (updates.cargoType !== undefined) payload.cargoType = updates.cargoType
      if (updates.direction !== undefined) payload.direction = updates.direction
      if (updates.incoterm !== undefined) payload.incoterm = updates.incoterm
      if (updates.originAddress !== undefined) payload.originAddress = updates.originAddress
      if (updates.destinationAddress !== undefined) payload.destinationAddress = updates.destinationAddress
      if (updates.requestedPickupDate !== undefined) payload.requestedPickupDate = updates.requestedPickupDate
      if (updates.requestedDeliveryDate !== undefined) payload.requestedDeliveryDate = updates.requestedDeliveryDate
      if (updates.clientReference !== undefined) payload.clientReference = updates.clientReference
      if (updates.internalReference !== undefined) payload.internalReference = updates.internalReference
      if (updates.commodityDescription !== undefined) payload.commodityDescription = updates.commodityDescription
      if (updates.hsCode !== undefined) payload.hsCode = updates.hsCode
      if (updates.currencyCode !== undefined) payload.currencyCode = updates.currencyCode
      if (updates.specialInstructions !== undefined) payload.specialInstructions = updates.specialInstructions
      if (updates.internalNotes !== undefined) payload.internalNotes = updates.internalNotes
      if (updates.transportModes !== undefined) payload.transportModes = updates.transportModes
      if (updates.transportUnitCount !== undefined) payload.transportUnitCount = updates.transportUnitCount
      // Project Detail View Fields (New)
      if (updates.bookingNumber !== undefined) payload.bookingNumber = updates.bookingNumber
      if (updates.operatorId !== undefined) payload.operatorId = updates.operatorId
      if (updates.operatorName !== undefined) payload.operatorName = updates.operatorName
      if (updates.salesPersonId !== undefined) payload.salesPersonId = updates.salesPersonId
      if (updates.salesPersonName !== undefined) payload.salesPersonName = updates.salesPersonName
      if (updates.shipperId !== undefined) payload.shipperId = updates.shipperId
      if (updates.consigneeId !== undefined) payload.consigneeId = updates.consigneeId

      const response = await apiCall(`/api/fms_projects/projects/${effectiveProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('Failed to update project')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_project', effectiveProjectId] })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    },
    onError: (err) => {
      setSaveStatus('error')
      onError?.(err instanceof Error ? err.message : 'Failed to update project')
    },
  })

  // Debounced save
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (Object.keys(pendingUpdatesRef.current).length > 0) {
        setSaveStatus('saving')
        updateMutation.mutate(pendingUpdatesRef.current)
        pendingUpdatesRef.current = {}
      }
    }, 1000)
  }, [updateMutation])

  // Update project - uses draft state in new mode
  const updateProject = useCallback((updates: Partial<Project>) => {
    if (isNewMode) {
      setDraftProject(prev => ({ ...prev, ...updates }))
      setIsDirty(true)
    } else {
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates }
      debouncedSave()
    }
  }, [isNewMode, debouncedSave])

  // Force save (for edit mode)
  const forceSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    if (Object.keys(pendingUpdatesRef.current).length > 0) {
      setSaveStatus('saving')
      await updateMutation.mutateAsync(pendingUpdatesRef.current)
      pendingUpdatesRef.current = {}
    }
  }, [updateMutation])

  // Handle save - creates project in new mode, returns project ID
  const handleSave = useCallback(async (): Promise<string | null> => {
    if (!isNewMode) {
      await forceSave()
      return effectiveProjectId || null
    }

    setSaveStatus('saving')
    try {
      // Convert camelCase to snake_case for API
      const payload: Record<string, any> = {
        cargoType: draftProject.cargoType,
        shipmentType: draftProject.shipmentType,
        direction: draftProject.direction,
      }

      // Add optional fields if set
      if (draftProject.clientId) payload.clientId = draftProject.clientId
      if (draftProject.incoterm) payload.incoterm = draftProject.incoterm
      if (draftProject.originLocationId) payload.originLocationId = draftProject.originLocationId
      if (draftProject.originAddress) payload.originAddress = draftProject.originAddress
      if (draftProject.destinationLocationId) payload.destinationLocationId = draftProject.destinationLocationId
      if (draftProject.destinationAddress) payload.destinationAddress = draftProject.destinationAddress
      if (draftProject.requestedPickupDate) payload.requestedPickupDate = draftProject.requestedPickupDate
      if (draftProject.requestedDeliveryDate) payload.requestedDeliveryDate = draftProject.requestedDeliveryDate
      if (draftProject.clientReference) payload.clientReference = draftProject.clientReference
      if (draftProject.internalReference) payload.internalReference = draftProject.internalReference
      if (draftProject.commodityDescription) payload.commodityDescription = draftProject.commodityDescription
      if (draftProject.hsCode) payload.hsCode = draftProject.hsCode
      if (draftProject.transportModes) payload.transportModes = draftProject.transportModes
      if (draftProject.transportUnitCount !== null) payload.transportUnitCount = draftProject.transportUnitCount
      if (draftProject.currencyCode) payload.currencyCode = draftProject.currencyCode
      if (draftProject.specialInstructions) payload.specialInstructions = draftProject.specialInstructions
      if (draftProject.internalNotes) payload.internalNotes = draftProject.internalNotes

      const response = await apiCall<{ id: string }>('/api/fms_projects/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Failed to create project')
      }

      const newId = response.result?.id
      if (!newId) {
        throw new Error('No project ID returned')
      }

      setPersistedProjectId(newId)
      setIsDirty(false)
      setSaveStatus('saved')
      onProjectCreated?.(newId)
      return newId
    } catch (err) {
      setSaveStatus('error')
      onError?.(err instanceof Error ? err.message : 'Failed to create project')
      throw err
    }
  }, [isNewMode, effectiveProjectId, forceSave, draftProject, onProjectCreated, onError])

  // Add leg
  const addLeg = useCallback(async (legData: Omit<ProjectLeg, 'id' | 'projectId'>) => {
    const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/legs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legSequence: legData.legSequence,
        transportMode: legData.transportMode,
        carrierId: legData.carrierId,
        originAddress: legData.originAddress,
        destinationAddress: legData.destinationAddress,
        estimatedDeparture: legData.estimatedDeparture,
        estimatedArrival: legData.estimatedArrival,
      }),
    })

    if (!response.ok) {
      onError?.('Failed to add leg')
      return null
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_legs', projectId] })
    return response.result
  }, [projectId, queryClient, onError])

  // Update leg
  const updateLeg = useCallback(async (legId: string, updates: Partial<ProjectLeg>) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/legs/${legId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      onError?.('Failed to update leg')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_legs', projectId] })
  }, [projectId, queryClient, onError])

  // Remove leg
  const removeLeg = useCallback(async (legId: string) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/legs/${legId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      onError?.('Failed to remove leg')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_legs', projectId] })
  }, [projectId, queryClient, onError])

  // Add sea container
  const addSeaContainer = useCallback(async (containerData: Omit<ProjectSeaContainer, 'id'>) => {
    // Use projectId from containerData if provided, otherwise use hook's projectId
    const effectiveProjectId = containerData.projectId || projectId
    const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${effectiveProjectId}/sea-containers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...containerData, projectId: effectiveProjectId }),
    })

    if (!response.ok) {
      onError?.('Failed to add sea container')
      return null
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_sea_containers', effectiveProjectId] })
    return response.result
  }, [projectId, queryClient, onError])

  // Update sea container
  const updateSeaContainer = useCallback(async (containerId: string, updates: Partial<ProjectSeaContainer>) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/sea-containers/${containerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      onError?.('Failed to update sea container')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_sea_containers', projectId] })
  }, [projectId, queryClient, onError])

  // Remove sea container
  const removeSeaContainer = useCallback(async (containerId: string) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/sea-containers/${containerId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      onError?.('Failed to remove sea container')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_sea_containers', projectId] })
  }, [projectId, queryClient, onError])

  // Backwards compatibility aliases
  const addContainer = addSeaContainer
  const updateContainer = updateSeaContainer
  const removeContainer = removeSeaContainer

  // Add air unit
  const addAirUnit = useCallback(async (airUnitData: Omit<ProjectAirUnit, 'id' | 'projectId'>) => {
    const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/air-units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(airUnitData),
    })

    if (!response.ok) {
      onError?.('Failed to add air unit')
      return null
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_air_units', projectId] })
    return response.result
  }, [projectId, queryClient, onError])

  // Update air unit
  const updateAirUnit = useCallback(async (airUnitId: string, updates: Partial<ProjectAirUnit>) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/air-units/${airUnitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      onError?.('Failed to update air unit')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_air_units', projectId] })
  }, [projectId, queryClient, onError])

  // Remove air unit
  const removeAirUnit = useCallback(async (airUnitId: string) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/air-units/${airUnitId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      onError?.('Failed to remove air unit')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_air_units', projectId] })
  }, [projectId, queryClient, onError])

  // Add road unit
  const addRoadUnit = useCallback(async (roadUnitData: Omit<ProjectRoadUnit, 'id' | 'projectId'>) => {
    const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/road-units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roadUnitData),
    })

    if (!response.ok) {
      onError?.('Failed to add road unit')
      return null
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_road_units', projectId] })
    return response.result
  }, [projectId, queryClient, onError])

  // Update road unit
  const updateRoadUnit = useCallback(async (roadUnitId: string, updates: Partial<ProjectRoadUnit>) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/road-units/${roadUnitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      onError?.('Failed to update road unit')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_road_units', projectId] })
  }, [projectId, queryClient, onError])

  // Remove road unit
  const removeRoadUnit = useCallback(async (roadUnitId: string) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/road-units/${roadUnitId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      onError?.('Failed to remove road unit')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_road_units', projectId] })
  }, [projectId, queryClient, onError])

  // Add cargo
  const addCargo = useCallback(async (cargoData: Omit<ProjectCargo, 'id' | 'projectId'>) => {
    const response = await apiCall<{ id: string }>(`/api/fms_projects/projects/${projectId}/cargo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cargoData),
    })

    if (!response.ok) {
      onError?.('Failed to add cargo')
      return null
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_cargo', projectId] })
    return response.result
  }, [projectId, queryClient, onError])

  // Update cargo
  const updateCargo = useCallback(async (cargoId: string, updates: Partial<ProjectCargo>) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/cargo/${cargoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      onError?.('Failed to update cargo')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_cargo', projectId] })
  }, [projectId, queryClient, onError])

  // Remove cargo
  const removeCargo = useCallback(async (cargoId: string) => {
    const response = await apiCall(`/api/fms_projects/projects/${projectId}/cargo/${cargoId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      onError?.('Failed to remove cargo')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_cargo', projectId] })
  }, [projectId, queryClient, onError])

  // Upload document
  const uploadDocument = useCallback(async (file: File, category: string): Promise<string | null> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', file.name)
    formData.append('category', category)
    formData.append('relatedEntityType', 'fms_projects:fms_project')
    formData.append('relatedEntityId', projectId)

    const response = await apiCall<{ item: { id: string } }>(`/api/fms_projects/projects/${projectId}/documents`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      onError?.('Failed to upload document')
      return null
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_documents', projectId] })
    return response.result?.item?.id || null
  }, [projectId, queryClient, onError])

  // Upload document and auto-extract
  const uploadAndExtract = useCallback(async (file: File, category: string): Promise<string | null> => {
    const documentId = await uploadDocument(file, category)
    if (!documentId) return null

    // Auto-extract the uploaded document
    setExtractingDocumentId(documentId)
    try {
      await apiCall(`/api/fms_documents/documents/${documentId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      queryClient.invalidateQueries({ queryKey: ['fms_project_documents', projectId] })
    } catch (err) {
      console.error('Auto-extraction failed:', err)
      // Don't fail the whole operation if extraction fails
    } finally {
      setExtractingDocumentId(null)
    }

    return documentId
  }, [uploadDocument, projectId, queryClient])

  // Update document
  const updateDocument = useCallback(async (documentId: string, updates: Partial<ProjectDocument>) => {
    const response = await apiCall(`/api/fms_documents/documents/${documentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      onError?.('Failed to update document')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_documents', projectId] })
  }, [projectId, queryClient, onError])

  // Remove document
  const removeDocument = useCallback(async (documentId: string) => {
    const response = await apiCall(`/api/fms_documents/documents/${documentId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      onError?.('Failed to remove document')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['fms_project_documents', projectId] })
  }, [projectId, queryClient, onError])

  // Extract document
  const extractDocument = useCallback(async (documentId: string) => {
    setExtractingDocumentId(documentId)
    try {
      const response = await apiCall(`/api/fms_documents/documents/${documentId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!response.ok) {
        onError?.('Failed to extract document')
        return null
      }

      queryClient.invalidateQueries({ queryKey: ['fms_project_documents', projectId] })
      return response.result
    } finally {
      setExtractingDocumentId(null)
    }
  }, [projectId, queryClient, onError])

  // Download document
  const downloadDocument = useCallback((documentId: string) => {
    window.open(`/api/fms_documents/documents/${documentId}/download`, '_blank')
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return {
    project,
    isLoadingProject: isNewMode ? false : isLoadingProject,
    updateProject,
    // New mode state
    isNewMode,
    isDirty,
    effectiveProjectId,
    handleSave,
    // Legs
    legs,
    isLoadingLegs,
    addLeg,
    updateLeg,
    removeLeg,
    // Sea containers
    seaContainers,
    isLoadingSeaContainers,
    addSeaContainer,
    updateSeaContainer,
    removeSeaContainer,
    // Backwards compatibility for containers
    containers,
    isLoadingContainers,
    addContainer,
    updateContainer,
    removeContainer,
    // Air units
    airUnits,
    isLoadingAirUnits,
    addAirUnit,
    updateAirUnit,
    removeAirUnit,
    // Road units
    roadUnits,
    isLoadingRoadUnits,
    addRoadUnit,
    updateRoadUnit,
    removeRoadUnit,
    // Cargo
    cargo,
    isLoadingCargo,
    addCargo,
    updateCargo,
    removeCargo,
    // Documents
    documents,
    isLoadingDocuments,
    uploadDocument,
    uploadAndExtract,
    updateDocument,
    removeDocument,
    extractDocument,
    downloadDocument,
    extractingDocumentId,
    // Save status
    saveStatus,
    forceSave,
    hasPendingChanges: isNewMode ? isDirty : Object.keys(pendingUpdatesRef.current).length > 0,
  }
}
