/**
 * Tracking Sync for fms_files
 *
 * Syncs Shipment data from the shipment-tracking module to FmsFileUnit entities.
 * Creates new units for newly discovered containers or links existing ones,
 * and ensures every synced unit is assigned to the triggering leg.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import type { Shipment } from '@open-mercato/shipment-tracking'
import { FmsFileUnit, FmsFileUnitLeg, FmsFileLeg } from '../data/entities'

/**
 * Maps ISO 6346 equipment type codes to internal container type codes.
 * Only includes codes we can map confidently.
 * Returns null for unknown codes — the caller must not override an existing type.
 *
 * Structure: SIZE (2 chars) + TYPE (2 chars)
 *   Size: 22=20ft std, 42=40ft std, 45=40ft HC (9'6"), L5=45ft HC
 *   Type: G0/G1/10/00=GP, R0/R1/30/31=Reefer, U0/U1/21=OpenTop, P1/P3/11=FlatRack
 */
const ISO_EQUIPMENT_CODE_MAP: Record<string, string> = {
  // 20ft General Purpose
  '22G0': '20GP', '22G1': '20GP', '2200': '20GP', '2210': '20GP',

  // 40ft General Purpose
  '42G0': '40GP', '42G1': '40GP', '4200': '40GP', '4210': '40GP',

  // 40ft High Cube (9'6") — MSC uses 4510
  '45G0': '40HC', '45G1': '40HC', '4500': '40HC', '4510': '40HC',

  // 45ft High Cube
  'L5G0': '45HC', 'L5G1': '45HC', 'L500': '45HC', 'L510': '45HC',

  // 20ft Reefer
  '22R0': '20RF', '22R1': '20RF', '2230': '20RF', '2231': '20RF',

  // 40ft Reefer
  '42R0': '40RF', '42R1': '40RF', '4230': '40RF', '4231': '40RF',

  // 40ft High Cube Reefer
  '45R0': '40RH', '45R1': '40RH', '4530': '40RH', '4531': '40RH',

  // 20ft Open Top
  '22U0': '20OT', '22U1': '20OT', '2220': '20OT', '2221': '20OT',

  // 40ft Open Top
  '42U0': '40OT', '42U1': '40OT', '4220': '40OT', '4221': '40OT',

  // 20ft Flat Rack
  '22P1': '20FR', '22P3': '20FR', '2211': '20FR', '2213': '20FR',

  // 40ft Flat Rack
  '42P1': '40FR', '42P3': '40FR', '4211': '40FR', '4213': '40FR',
}

/**
 * Maps an ISO 6346 equipment code (e.g. "4510", "45G1") to our container type (e.g. "40HC").
 * Returns null if the code is unknown — do NOT override an existing type in that case.
 */
function mapIsoEquipmentCode(code: string | null | undefined): string | null {
  if (!code) return null
  return ISO_EQUIPMENT_CODE_MAP[code.toUpperCase()] ?? null
}

/**
 * Validates container numbers against ISO 6346 format.
 * Inlined to avoid cross-module imports that can cause MikroORM entity discovery issues.
 */
function isValidContainerNumber(containerNumber: string | null | undefined): boolean {
  if (!containerNumber || typeof containerNumber !== 'string') return false

  const normalized = containerNumber.toUpperCase().replace(/\s/g, '')

  if (!/^[A-Z]{4}\d{7}$/.test(normalized)) return false

  const categoryCode = normalized[3]
  return ['U', 'J', 'Z'].includes(categoryCode)
}

/**
 * Ensures a FmsFileUnitLeg assignment exists between a unit and a leg.
 * Restores a soft-deleted record if one exists, otherwise creates a new one.
 */
async function ensureUnitLegAssignment(
  em: EntityManager,
  unit: FmsFileUnit,
  leg: FmsFileLeg,
  organizationId: string,
  tenantId: string
): Promise<void> {
  const existing = await em.findOne(FmsFileUnitLeg, {
    unit: unit.id,
    leg: leg.id,
  })

  if (existing) {
    if (existing.deletedAt) existing.deletedAt = null // Restore soft-deleted assignment
    return
  }

  em.create(FmsFileUnitLeg, {
    unit: unit.id,
    leg: leg.id,
    organizationId,
    tenantId,
  })
}

export type SyncResult = {
  unitsCreated: number
  unitsLinked: number
}

/**
 * Syncs a list of shipments to FmsFileUnit records for the given leg.
 *
 * Matching priority per shipment:
 * 1. Existing unit in the file with a matching containerNumber → link + ensure unit-leg
 * 2. Unit already assigned to THIS leg with no container number (TBD) → fill in + link
 * 3. No match → create a new FCL FmsFileUnit + assign to leg
 *
 * This ensures TBD placeholders the user pre-created and assigned to the leg get
 * filled in with real container numbers, rather than creating duplicates.
 */
export async function syncShipmentsToFileLeg(
  em: EntityManager,
  shipments: Shipment[],
  leg: FmsFileLeg,
  organizationId: string,
  tenantId: string
): Promise<SyncResult> {
  const fileId = typeof leg.file === 'string' ? leg.file : (leg.file as any)?.id
  const legId = leg.id

  // Fetch existing units in this file that already have a matching container number
  const containerNumbers = shipments
    .map((s) => s.containerNumber)
    .filter((n): n is string => Boolean(n))

  const [existingByNumber, tbdUnitsOnLeg] = await Promise.all([
    containerNumbers.length > 0
      ? em.find(FmsFileUnit, {
          file: fileId,
          containerNumber: { $in: containerNumbers },
          deletedAt: null,
        })
      : Promise.resolve([] as FmsFileUnit[]),

    // TBD units: already assigned to this leg but have no container number yet
    em.find(
      FmsFileUnitLeg,
      { leg: legId, deletedAt: null },
      { populate: ['unit'] }
    ).then((uls) =>
      uls
        .map((ul) => ul.unit as FmsFileUnit)
        .filter((u) => !u.containerNumber && !u.deletedAt)
    ),
  ])

  const existingUnitByContainerNumber = new Map(
    existingByNumber.map((u) => [u.containerNumber, u])
  )

  // Pool of TBD units to fill in (consumed in order)
  const tbdPool = [...tbdUnitsOnLeg]

  let unitsCreated = 0
  let unitsLinked = 0

  for (const shipment of shipments) {
    if (!isValidContainerNumber(shipment.containerNumber)) continue

    const containerNumber = shipment.containerNumber!.toUpperCase().replace(/\s/g, '')

    // Priority 1: unit with same container number already in file
    const byNumber = existingUnitByContainerNumber.get(containerNumber)
    if (byNumber) {
      byNumber.trackedShipmentId = shipment.id
      const mappedType = mapIsoEquipmentCode(shipment.isoEquipmentCode)
      if (mappedType) byNumber.containerType = mappedType
      await ensureUnitLegAssignment(em, byNumber, leg, organizationId, tenantId)
      unitsLinked++
      continue
    }

    // Priority 2: TBD unit already on this leg — fill it in
    const tbdUnit = tbdPool.shift()
    if (tbdUnit) {
      tbdUnit.containerNumber = containerNumber
      tbdUnit.trackedShipmentId = shipment.id
      const mappedType = mapIsoEquipmentCode(shipment.isoEquipmentCode)
      if (mappedType) tbdUnit.containerType = mappedType
      // Unit is already on the leg — no new assignment needed
      unitsLinked++
      continue
    }

    // Priority 3: Create a new unit and assign it to the leg
    const newUnit = em.create(FmsFileUnit, {
      file: fileId,
      organizationId,
      tenantId,
      cargoType: 'FCL',
      containerNumber,
      containerType: mapIsoEquipmentCode(shipment.isoEquipmentCode),
      originLocationId: leg.originLocationId,
      destinationLocationId: leg.destinationLocationId,
      trackedShipmentId: shipment.id,
      sortOrder: 0,
    })
    em.create(FmsFileUnitLeg, {
      unit: newUnit,
      leg: legId,
      organizationId,
      tenantId,
    })
    unitsCreated++
  }

  await em.flush()

  return { unitsCreated, unitsLinked }
}
