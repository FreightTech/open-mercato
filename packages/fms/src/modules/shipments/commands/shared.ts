import type { ActionLog } from '@open-mercato/core/modules/audit_logs/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  Shipment,
  ShipmentContainer,
  ShipmentDocument,
  ShipmentTask,
} from '../data/entities'
import type {
  ShipmentSnapshot,
  ShipmentContainerSnapshot,
  ShipmentDocumentSnapshot,
  ShipmentTaskSnapshot,
} from '../data/snapshots'

export { ensureOrganizationScope } from '@open-mercato/shared/lib/commands/scope'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Safely extract a user ID from the auth context.
 * Returns null if the sub is not a valid UUID (e.g., API key auth).
 */
export function getUserIdFromAuth(ctx: CommandRuntimeContext): string | null {
  const sub = ctx.auth?.sub
  if (typeof sub === 'string' && UUID_REGEX.test(sub)) {
    return sub
  }
  return null
}

type UndoEnvelope<T> = {
  undo?: T
  value?: { undo?: T }
  __redoInput?: unknown
  [key: string]: unknown
}

export function ensureTenantScope(ctx: CommandRuntimeContext, tenantId: string): void {
  const currentTenant = ctx.auth?.tenantId ?? null
  if (currentTenant && currentTenant !== tenantId) {
    throw new CrudHttpError(403, { error: 'Forbidden' })
  }
}

export function extractUndoPayload<T>(logEntry: ActionLog | null | undefined): T | null {
  if (!logEntry) return null
  const payload = logEntry.commandPayload as UndoEnvelope<T> | undefined
  if (!payload || typeof payload !== 'object') return null
  if (payload.undo) return payload.undo
  if (payload.value && typeof payload.value === 'object' && payload.value.undo) {
    return payload.value.undo as T
  }
  const entries = Object.entries(payload).find(([key]) => key !== '__redoInput')
  if (entries && entries[1] && typeof entries[1] === 'object' && 'undo' in (entries[1] as Record<string, unknown>)) {
    return (entries[1] as { undo?: T }).undo ?? null
  }
  return null
}

export function assertRecordFound<T>(record: T | null | undefined, message: string): T {
  if (!record) throw new CrudHttpError(404, { error: message })
  return record
}

/**
 * Serialize a task entity to snapshot
 */
function serializeTaskSnapshot(task: ShipmentTask): ShipmentTaskSnapshot {
  return {
    id: task.id,
    organizationId: task.organizationId,
    tenantId: task.tenantId,
    shipmentId: task.shipmentId,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    assignedToId: task.assignedTo
      ? typeof task.assignedTo === 'string'
        ? task.assignedTo
        : task.assignedTo.id
      : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

/**
 * Serialize a document entity to snapshot
 */
function serializeDocumentSnapshot(doc: ShipmentDocument): ShipmentDocumentSnapshot {
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    tenantId: doc.tenantId,
    shipmentId: doc.shipmentId,
    attachmentId: doc.attachmentId,
    extractedData: doc.extractedData ?? null,
    processedAt: doc.processedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/**
 * Serialize a container entity to snapshot
 */
function serializeContainerSnapshot(container: ShipmentContainer): ShipmentContainerSnapshot {
  return {
    id: container.id,
    organizationId: container.organizationId,
    tenantId: container.tenantId,
    shipmentId: typeof container.shipment === 'string' ? container.shipment : container.shipment.id,
    containerNumber: container.containerNumber ?? null,
    containerType: container.containerType ?? null,
    cargoDescription: container.cargoDescription ?? null,
    status: container.status ?? null,
    currentLocation: container.currentLocation ?? null,
    gateInDate: container.gateInDate ?? null,
    loadedOnVesselDate: container.loadedOnVesselDate ?? null,
    dischargedDate: container.dischargedDate ?? null,
    gateOutDate: container.gateOutDate ?? null,
    emptyReturnDate: container.emptyReturnDate ?? null,
    createdAt: container.createdAt,
    updatedAt: container.updatedAt,
  }
}

/**
 * Load a full shipment snapshot including containers, documents, and tasks
 */
export async function loadShipmentSnapshot(
  em: EntityManager,
  shipmentId: string
): Promise<ShipmentSnapshot | null> {
  const shipment = await em.findOne(Shipment, { id: shipmentId }, {
    populate: ['client', 'createdBy', 'assignedTo', 'shipper', 'consignee', 'contactPerson'],
  })
  if (!shipment) return null

  const containers = await em.find(ShipmentContainer, { shipment }, {
    orderBy: { createdAt: 'asc' },
  })

  const documents = await em.find(ShipmentDocument, { shipmentId }, {
    orderBy: { createdAt: 'asc' },
  })

  const tasks = await em.find(ShipmentTask, { shipmentId }, {
    populate: ['assignedTo'],
    orderBy: { createdAt: 'asc' },
  })

  return {
    id: shipment.id,
    organizationId: shipment.organizationId,
    tenantId: shipment.tenantId,
    clientId: shipment.client
      ? typeof shipment.client === 'string'
        ? shipment.client
        : shipment.client.id
      : null,
    createdById: shipment.createdBy
      ? typeof shipment.createdBy === 'string'
        ? shipment.createdBy
        : shipment.createdBy.id
      : null,
    assignedToId: shipment.assignedTo
      ? typeof shipment.assignedTo === 'string'
        ? shipment.assignedTo
        : shipment.assignedTo.id
      : null,
    containerNumber: shipment.containerNumber ?? null,
    internalReference: shipment.internalReference ?? null,
    clientReference: shipment.clientReference ?? null,
    bookingNumber: shipment.bookingNumber ?? null,
    bolNumber: shipment.bolNumber ?? null,
    carrier: shipment.carrier ?? null,
    originPort: shipment.originPort ?? null,
    originLocation: shipment.originLocation ?? null,
    destinationPort: shipment.destinationPort ?? null,
    destinationLocation: shipment.destinationLocation ?? null,
    etd: shipment.etd ?? null,
    atd: shipment.atd ?? null,
    eta: shipment.eta ?? null,
    ata: shipment.ata ?? null,
    shipperId: shipment.shipper
      ? typeof shipment.shipper === 'string'
        ? shipment.shipper
        : shipment.shipper.id
      : null,
    consigneeId: shipment.consignee
      ? typeof shipment.consignee === 'string'
        ? shipment.consignee
        : shipment.consignee.id
      : null,
    contactPersonId: shipment.contactPerson
      ? typeof shipment.contactPerson === 'string'
        ? shipment.contactPerson
        : shipment.contactPerson.id
      : null,
    weight: shipment.weight ?? null,
    volume: shipment.volume ?? null,
    containerType: shipment.containerType ?? null,
    totalPieces: shipment.totalPieces ?? null,
    totalActualWeight: shipment.totalActualWeight ?? null,
    totalChargeableWeight: shipment.totalChargeableWeight ?? null,
    totalVolume: shipment.totalVolume ?? null,
    actualWeightPerKilo: shipment.actualWeightPerKilo ?? null,
    amount: shipment.amount ?? null,
    mode: shipment.mode ?? null,
    vesselName: shipment.vesselName ?? null,
    vesselImo: shipment.vesselImo ?? null,
    voyageNumber: shipment.voyageNumber ?? null,
    status: shipment.status,
    incoterms: shipment.incoterms ?? null,
    requestDate: shipment.requestDate ?? null,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
    containers: containers.map(serializeContainerSnapshot),
    documents: documents.map(serializeDocumentSnapshot),
    tasks: tasks.map(serializeTaskSnapshot),
  }
}

/**
 * Load a container snapshot
 */
export async function loadContainerSnapshot(
  em: EntityManager,
  containerId: string
): Promise<ShipmentContainerSnapshot | null> {
  const container = await em.findOne(ShipmentContainer, { id: containerId }, {
    populate: ['shipment'],
  })
  if (!container) return null

  return serializeContainerSnapshot(container)
}

/**
 * Load a document snapshot
 */
export async function loadDocumentSnapshot(
  em: EntityManager,
  documentId: string
): Promise<ShipmentDocumentSnapshot | null> {
  const doc = await em.findOne(ShipmentDocument, { id: documentId })
  if (!doc) return null

  return serializeDocumentSnapshot(doc)
}

/**
 * Load a task snapshot
 */
export async function loadTaskSnapshot(
  em: EntityManager,
  taskId: string
): Promise<ShipmentTaskSnapshot | null> {
  const task = await em.findOne(ShipmentTask, { id: taskId }, {
    populate: ['assignedTo'],
  })
  if (!task) return null

  return serializeTaskSnapshot(task)
}

/**
 * Restore a shipment from snapshot (for undo operations)
 */
export async function applyShipmentSnapshot(
  em: EntityManager,
  snapshot: ShipmentSnapshot
): Promise<Shipment> {
  let shipment = await em.findOne(Shipment, { id: snapshot.id })

  if (!shipment) {
    shipment = em.create(Shipment, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      containerNumber: snapshot.containerNumber,
      internalReference: snapshot.internalReference,
      clientReference: snapshot.clientReference,
      bookingNumber: snapshot.bookingNumber,
      bolNumber: snapshot.bolNumber,
      carrier: snapshot.carrier,
      originPort: snapshot.originPort,
      originLocation: snapshot.originLocation,
      destinationPort: snapshot.destinationPort,
      destinationLocation: snapshot.destinationLocation,
      etd: snapshot.etd,
      atd: snapshot.atd,
      eta: snapshot.eta,
      ata: snapshot.ata,
      weight: snapshot.weight,
      volume: snapshot.volume,
      containerType: snapshot.containerType,
      totalPieces: snapshot.totalPieces,
      totalActualWeight: snapshot.totalActualWeight,
      totalChargeableWeight: snapshot.totalChargeableWeight,
      totalVolume: snapshot.totalVolume,
      actualWeightPerKilo: snapshot.actualWeightPerKilo,
      amount: snapshot.amount,
      mode: snapshot.mode,
      vesselName: snapshot.vesselName,
      vesselImo: snapshot.vesselImo,
      voyageNumber: snapshot.voyageNumber,
      status: snapshot.status,
      incoterms: snapshot.incoterms,
      requestDate: snapshot.requestDate,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(shipment)
  } else {
    shipment.containerNumber = snapshot.containerNumber
    shipment.internalReference = snapshot.internalReference
    shipment.clientReference = snapshot.clientReference
    shipment.bookingNumber = snapshot.bookingNumber
    shipment.bolNumber = snapshot.bolNumber
    shipment.carrier = snapshot.carrier
    shipment.originPort = snapshot.originPort
    shipment.originLocation = snapshot.originLocation
    shipment.destinationPort = snapshot.destinationPort
    shipment.destinationLocation = snapshot.destinationLocation
    shipment.etd = snapshot.etd
    shipment.atd = snapshot.atd
    shipment.eta = snapshot.eta
    shipment.ata = snapshot.ata
    shipment.weight = snapshot.weight
    shipment.volume = snapshot.volume
    shipment.containerType = snapshot.containerType
    shipment.totalPieces = snapshot.totalPieces
    shipment.totalActualWeight = snapshot.totalActualWeight
    shipment.totalChargeableWeight = snapshot.totalChargeableWeight
    shipment.totalVolume = snapshot.totalVolume
    shipment.actualWeightPerKilo = snapshot.actualWeightPerKilo
    shipment.amount = snapshot.amount
    shipment.mode = snapshot.mode
    shipment.vesselName = snapshot.vesselName
    shipment.vesselImo = snapshot.vesselImo
    shipment.voyageNumber = snapshot.voyageNumber
    shipment.status = snapshot.status
    shipment.incoterms = snapshot.incoterms
    shipment.requestDate = snapshot.requestDate
  }

  await em.flush()
  return shipment
}

/**
 * Restore a container from snapshot (for undo operations)
 */
export async function applyContainerSnapshot(
  em: EntityManager,
  snapshot: ShipmentContainerSnapshot
): Promise<ShipmentContainer> {
  let container = await em.findOne(ShipmentContainer, { id: snapshot.id })

  if (!container) {
    container = em.create(ShipmentContainer, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      shipment: em.getReference(Shipment, snapshot.shipmentId),
      containerNumber: snapshot.containerNumber,
      containerType: snapshot.containerType,
      cargoDescription: snapshot.cargoDescription,
      status: snapshot.status,
      currentLocation: snapshot.currentLocation,
      gateInDate: snapshot.gateInDate,
      loadedOnVesselDate: snapshot.loadedOnVesselDate,
      dischargedDate: snapshot.dischargedDate,
      gateOutDate: snapshot.gateOutDate,
      emptyReturnDate: snapshot.emptyReturnDate,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(container)
  } else {
    container.containerNumber = snapshot.containerNumber
    container.containerType = snapshot.containerType
    container.cargoDescription = snapshot.cargoDescription
    container.status = snapshot.status
    container.currentLocation = snapshot.currentLocation
    container.gateInDate = snapshot.gateInDate
    container.loadedOnVesselDate = snapshot.loadedOnVesselDate
    container.dischargedDate = snapshot.dischargedDate
    container.gateOutDate = snapshot.gateOutDate
    container.emptyReturnDate = snapshot.emptyReturnDate
  }

  await em.flush()
  return container
}

/**
 * Restore a document from snapshot (for undo operations)
 */
export async function applyDocumentSnapshot(
  em: EntityManager,
  snapshot: ShipmentDocumentSnapshot
): Promise<ShipmentDocument> {
  let doc = await em.findOne(ShipmentDocument, { id: snapshot.id })

  if (!doc) {
    doc = em.create(ShipmentDocument, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      shipmentId: snapshot.shipmentId,
      attachmentId: snapshot.attachmentId,
      extractedData: snapshot.extractedData,
      processedAt: snapshot.processedAt,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(doc)
  } else {
    doc.extractedData = snapshot.extractedData
    doc.processedAt = snapshot.processedAt
  }

  await em.flush()
  return doc
}

/**
 * Restore a task from snapshot (for undo operations)
 */
export async function applyTaskSnapshot(
  em: EntityManager,
  snapshot: ShipmentTaskSnapshot
): Promise<ShipmentTask> {
  let task = await em.findOne(ShipmentTask, { id: snapshot.id })

  if (!task) {
    task = em.create(ShipmentTask, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      shipmentId: snapshot.shipmentId,
      title: snapshot.title,
      description: snapshot.description,
      status: snapshot.status,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(task)
  } else {
    task.title = snapshot.title
    task.description = snapshot.description
    task.status = snapshot.status
  }

  await em.flush()
  return task
}
