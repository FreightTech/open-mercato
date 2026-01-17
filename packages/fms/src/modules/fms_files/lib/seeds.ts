import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsFile } from '../data/entities'
import type { Incoterm, ShipmentType, Direction, CargoType, WeightUnit, FmsFileStatus } from '../data/types'

export type FileSeedScope = {
  tenantId: string
  organizationId: string
}

interface FileSeed {
  fileNumber: string
  shipmentType: ShipmentType
  direction: Direction
  cargoType: CargoType
  incoterm?: Incoterm | null
  originAddress?: string | null
  destinationAddress?: string | null
  requestedPickupDate?: Date | null
  clientReference?: string | null
  commodityDescription?: string | null
  containerCount?: number | null
  totalGrossWeight?: string | null
  weightUnit?: WeightUnit | null
  currencyCode?: string
  currentStep?: FmsFileStatus
  specialInstructions?: string | null
  internalNotes?: string | null
}

export const defaultFiles: FileSeed[] = [
  {
    fileNumber: 'EXP/FCL/00001/2026/DEMO',
    shipmentType: 'EXP',
    direction: 'export',
    cargoType: 'fcl',
    incoterm: 'FOB',
    originAddress: 'Shanghai Port, China',
    destinationAddress: 'Los Angeles Port, CA, USA',
    requestedPickupDate: new Date('2026-02-15'),
    clientReference: 'PO-2026-001',
    commodityDescription: 'Electronics - Consumer Goods',
    containerCount: 2,
    totalGrossWeight: '20000',
    weightUnit: 'kg',
    currencyCode: 'USD',
    currentStep: 'draft',
    specialInstructions: 'Handle with care - fragile items',
    internalNotes: 'High priority client - ensure timely delivery',
  },
  {
    fileNumber: 'IMP/LCL/00001/2026/DEMO',
    shipmentType: 'IMP',
    direction: 'import',
    cargoType: 'lcl',
    incoterm: 'CIF',
    originAddress: 'Hamburg Port, Germany',
    destinationAddress: 'New York Port, NY, USA',
    requestedPickupDate: new Date('2026-02-20'),
    clientReference: 'PO-2026-002',
    commodityDescription: 'Machinery Parts',
    containerCount: null,
    totalGrossWeight: '5500',
    weightUnit: 'kg',
    currencyCode: 'EUR',
    currentStep: 'draft',
    specialInstructions: 'Requires customs clearance documentation',
    internalNotes: 'Standard shipment - follow normal procedures',
  },
  {
    fileNumber: 'EXP/FCL/00002/2026/DEMO',
    shipmentType: 'EXP',
    direction: 'export',
    cargoType: 'fcl',
    incoterm: 'EXW',
    originAddress: 'Chicago Warehouse, IL, USA',
    destinationAddress: 'Rotterdam Port, Netherlands',
    requestedPickupDate: new Date('2026-03-01'),
    clientReference: 'PO-2026-003',
    commodityDescription: 'Agricultural Equipment',
    containerCount: 1,
    totalGrossWeight: '12000',
    weightUnit: 'kg',
    currencyCode: 'USD',
    currentStep: 'draft',
    specialInstructions: 'Requires agricultural inspection certificate',
    internalNotes: 'New client - ensure excellent service',
  },
]

export async function seedFiles(
  em: EntityManager,
  scope: FileSeedScope
): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0

  for (const seed of defaultFiles) {
    const existing = await em.findOne(FmsFile, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      fileNumber: seed.fileNumber,
    })

    if (existing) {
      skipped++
      continue
    }

    const file = em.create(FmsFile, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      fileNumber: seed.fileNumber,
      shipmentType: seed.shipmentType,
      direction: seed.direction,
      cargoType: seed.cargoType,
      incoterm: seed.incoterm,
      originAddress: seed.originAddress,
      destinationAddress: seed.destinationAddress,
      requestedPickupDate: seed.requestedPickupDate,
      clientReference: seed.clientReference,
      commodityDescription: seed.commodityDescription,
      containerCount: seed.containerCount,
      totalGrossWeight: seed.totalGrossWeight,
      weightUnit: seed.weightUnit,
      currencyCode: seed.currencyCode || 'USD',
      currentStep: seed.currentStep || 'draft',
      specialInstructions: seed.specialInstructions,
      internalNotes: seed.internalNotes,
      fileDate: new Date(),
      requiresInsurance: false,
      requiresCustomsBrokerage: false,
      isHazardous: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    em.persist(file)
    created++
  }

  await em.flush()

  return { created, skipped }
}
