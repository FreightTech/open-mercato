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
      containerNumber: snapshot.containerNumber ?? undefined,
      internalReference: snapshot.internalReference ?? undefined,
      clientReference: snapshot.clientReference ?? undefined,
      bookingNumber: snapshot.bookingNumber ?? undefined,
      bolNumber: snapshot.bolNumber ?? undefined,
      carrier: snapshot.carrier ?? undefined,
      originPort: snapshot.originPort ?? undefined,
      originLocation: snapshot.originLocation ?? undefined,
      destinationPort: snapshot.destinationPort ?? undefined,
      destinationLocation: snapshot.destinationLocation ?? undefined,
      etd: snapshot.etd ?? undefined,
      atd: snapshot.atd ?? undefined,
      eta: snapshot.eta ?? undefined,
      ata: snapshot.ata ?? undefined,
      weight: snapshot.weight ?? undefined,
      volume: snapshot.volume ?? undefined,
      containerType: snapshot.containerType ?? undefined,
      totalPieces: snapshot.totalPieces ?? undefined,
      totalActualWeight: snapshot.totalActualWeight ?? undefined,
      totalChargeableWeight: snapshot.totalChargeableWeight ?? undefined,
      totalVolume: snapshot.totalVolume ?? undefined,
      actualWeightPerKilo: snapshot.actualWeightPerKilo ?? undefined,
      amount: snapshot.amount ?? undefined,
      mode: snapshot.mode ?? undefined,
      vesselName: snapshot.vesselName ?? undefined,
      vesselImo: snapshot.vesselImo ?? undefined,
      voyageNumber: snapshot.voyageNumber ?? undefined,
      status: snapshot.status,
      incoterms: snapshot.incoterms ?? undefined,
      requestDate: snapshot.requestDate ?? undefined,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(shipment)
  } else {
    shipment.containerNumber = snapshot.containerNumber ?? undefined
    shipment.internalReference = snapshot.internalReference ?? undefined
    shipment.clientReference = snapshot.clientReference ?? undefined
    shipment.bookingNumber = snapshot.bookingNumber ?? undefined
    shipment.bolNumber = snapshot.bolNumber ?? undefined
    shipment.carrier = snapshot.carrier ?? undefined
    shipment.originPort = snapshot.originPort ?? undefined
    shipment.originLocation = snapshot.originLocation ?? undefined
    shipment.destinationPort = snapshot.destinationPort ?? undefined
    shipment.destinationLocation = snapshot.destinationLocation ?? undefined
    shipment.etd = snapshot.etd ?? undefined
    shipment.atd = snapshot.atd ?? undefined
    shipment.eta = snapshot.eta ?? undefined
    shipment.ata = snapshot.ata ?? undefined
    shipment.weight = snapshot.weight ?? undefined
    shipment.volume = snapshot.volume ?? undefined
    shipment.containerType = snapshot.containerType ?? undefined
    shipment.totalPieces = snapshot.totalPieces ?? undefined
    shipment.totalActualWeight = snapshot.totalActualWeight ?? undefined
    shipment.totalChargeableWeight = snapshot.totalChargeableWeight ?? undefined
    shipment.totalVolume = snapshot.totalVolume ?? undefined
    shipment.actualWeightPerKilo = snapshot.actualWeightPerKilo ?? undefined
    shipment.amount = snapshot.amount ?? undefined
    shipment.mode = snapshot.mode ?? undefined
    shipment.vesselName = snapshot.vesselName ?? undefined
    shipment.vesselImo = snapshot.vesselImo ?? undefined
    shipment.voyageNumber = snapshot.voyageNumber ?? undefined
    shipment.status = snapshot.status
    shipment.incoterms = snapshot.incoterms ?? undefined
    shipment.requestDate = snapshot.requestDate ?? undefined
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
      containerNumber: snapshot.containerNumber ?? undefined,
      containerType: snapshot.containerType ?? undefined,
      cargoDescription: snapshot.cargoDescription ?? undefined,
      status: snapshot.status ?? undefined,
      currentLocation: snapshot.currentLocation ?? undefined,
      gateInDate: snapshot.gateInDate ?? undefined,
      loadedOnVesselDate: snapshot.loadedOnVesselDate ?? undefined,
      dischargedDate: snapshot.dischargedDate ?? undefined,
      gateOutDate: snapshot.gateOutDate ?? undefined,
      emptyReturnDate: snapshot.emptyReturnDate ?? undefined,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(container)
  } else {
    container.containerNumber = snapshot.containerNumber ?? undefined
    container.containerType = snapshot.containerType ?? undefined
    container.cargoDescription = snapshot.cargoDescription ?? undefined
    container.status = snapshot.status ?? undefined
    container.currentLocation = snapshot.currentLocation ?? undefined
    container.gateInDate = snapshot.gateInDate ?? undefined
    container.loadedOnVesselDate = snapshot.loadedOnVesselDate ?? undefined
    container.dischargedDate = snapshot.dischargedDate ?? undefined
    container.gateOutDate = snapshot.gateOutDate ?? undefined
    container.emptyReturnDate = snapshot.emptyReturnDate ?? undefined
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
      extractedData: snapshot.extractedData ?? undefined,
      processedAt: snapshot.processedAt ?? undefined,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(doc)
  } else {
    doc.extractedData = snapshot.extractedData ?? undefined
    doc.processedAt = snapshot.processedAt ?? undefined
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
      description: snapshot.description ?? undefined,
      status: snapshot.status,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(task)
  } else {
    task.title = snapshot.title
    task.description = snapshot.description ?? undefined
    task.status = snapshot.status
  }

  await em.flush()
  return task
}
