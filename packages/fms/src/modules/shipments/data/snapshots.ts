import type { ShipmentStatus, ContainerType, ContainerStatus, Incoterms, ShipmentMode, TaskStatus } from './entities'

/**
 * Snapshot type for ShipmentTask
 */
export type ShipmentTaskSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  shipmentId: string
  title: string | undefined
  description: string | null
  status: TaskStatus
  assignedToId: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Snapshot type for ShipmentDocument
 */
export type ShipmentDocumentSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  shipmentId: string
  attachmentId: string
  extractedData: Record<string, any> | null
  processedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Snapshot type for ShipmentContainer
 */
export type ShipmentContainerSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  shipmentId: string
  containerNumber: string | null
  containerType: ContainerType | null
  cargoDescription: string | null
  status: ContainerStatus | null
  currentLocation: string | null
  gateInDate: Date | null
  loadedOnVesselDate: Date | null
  dischargedDate: Date | null
  gateOutDate: Date | null
  emptyReturnDate: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Snapshot type for Shipment (includes containers, documents, tasks for cascade undo)
 */
export type ShipmentSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  clientId: string | null
  createdById: string | null
  assignedToId: string | null
  containerNumber: string | null
  internalReference: string | null
  clientReference: string | null
  bookingNumber: string | null
  bolNumber: string | null
  carrier: string | null
  originPort: string | null
  originLocation: string | null
  destinationPort: string | null
  destinationLocation: string | null
  etd: Date | null
  atd: Date | null
  eta: Date | null
  ata: Date | null
  shipperId: string | null
  consigneeId: string | null
  contactPersonId: string | null
  weight: number | null
  volume: number | null
  containerType: ContainerType | null
  totalPieces: number | null
  totalActualWeight: number | null
  totalChargeableWeight: number | null
  totalVolume: number | null
  actualWeightPerKilo: number | null
  amount: number | null
  mode: ShipmentMode | null
  vesselName: string | null
  vesselImo: string | null
  voyageNumber: string | null
  status: ShipmentStatus
  incoterms: Incoterms | null
  requestDate: Date | null
  createdAt: Date
  updatedAt: Date
  containers: ShipmentContainerSnapshot[]
  documents: ShipmentDocumentSnapshot[]
  tasks: ShipmentTaskSnapshot[]
}

/**
 * Undo payload types
 */
export type ShipmentUndoPayload = {
  before?: ShipmentSnapshot | null
  after?: ShipmentSnapshot | null
}

export type ContainerUndoPayload = {
  before?: ShipmentContainerSnapshot | null
  after?: ShipmentContainerSnapshot | null
}

export type DocumentUndoPayload = {
  before?: ShipmentDocumentSnapshot | null
  after?: ShipmentDocumentSnapshot | null
}

export type TaskUndoPayload = {
  before?: ShipmentTaskSnapshot | null
  after?: ShipmentTaskSnapshot | null
}
