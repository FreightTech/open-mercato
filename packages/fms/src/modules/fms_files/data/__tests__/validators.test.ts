import { describe, it, expect } from 'vitest'
import {
  createFileSchema,
  createFileInputSchema,
  updateFileSchema,
  createUnitSchema,
  updateUnitSchema,
  createLegSchema,
  updateLegSchema,
  addTimestampSchema,
  createUnitLegSchema,
  updateUnitLegSchema,
  fmsFileLineCreateSchema,
  fmsFileLineUpdateSchema,
  fmsFileNoteCreateSchema,
  fmsFileInvoiceReviewSchema,
  packageDetailSchema,
} from '../validators'

const uuid = () => crypto.randomUUID()

// ─── FmsFile Schemas ────────────────────────────────────────────────────────

describe('createFileSchema', () => {
  const validInput = () => ({
    organizationId: uuid(),
    tenantId: uuid(),
    shipmentType: 'EXP' as const,
    cargoType: 'FCL' as const,
    contractorId: uuid(),
  })

  it('accepts valid input', () => {
    expect(createFileSchema.parse(validInput())).toBeDefined()
  })

  it('rejects invalid shipment type', () => {
    expect(() => createFileSchema.parse({ ...validInput(), shipmentType: 'INVALID' })).toThrow()
  })

  it('rejects invalid cargo type', () => {
    expect(() => createFileSchema.parse({ ...validInput(), cargoType: 'BULK' })).toThrow()
  })

  it('rejects missing contractorId', () => {
    const { contractorId, ...rest } = validInput()
    expect(() => createFileSchema.parse(rest)).toThrow()
  })

  it('accepts optional assigneeId', () => {
    const result = createFileSchema.parse({ ...validInput(), assigneeId: uuid() })
    expect(result.assigneeId).toBeDefined()
  })

  it('accepts null assigneeId', () => {
    const result = createFileSchema.parse({ ...validInput(), assigneeId: null })
    expect(result.assigneeId).toBeNull()
  })

  it('accepts optional notes', () => {
    const result = createFileSchema.parse({ ...validInput(), notes: 'Test note' })
    expect(result.notes).toBe('Test note')
  })
})

describe('createFileInputSchema', () => {
  it('does not require organizationId/tenantId', () => {
    const result = createFileInputSchema.parse({
      shipmentType: 'IMP',
      cargoType: 'LCL',
      contractorId: uuid(),
    })
    expect(result.shipmentType).toBe('IMP')
    expect(result).not.toHaveProperty('organizationId')
  })
})

describe('updateFileSchema', () => {
  it('requires only id', () => {
    const result = updateFileSchema.parse({ id: uuid() })
    expect(result.id).toBeDefined()
  })

  it('accepts optional fields', () => {
    const result = updateFileSchema.parse({
      id: uuid(),
      assigneeId: uuid(),
      notes: 'Updated notes',
    })
    expect(result.assigneeId).toBeDefined()
    expect(result.notes).toBe('Updated notes')
  })
})

// ─── FmsFileUnit Schemas ────────────────────────────────────────────────────

describe('createUnitSchema', () => {
  const validUnit = () => ({
    organizationId: uuid(),
    tenantId: uuid(),
    fileId: uuid(),
    cargoType: 'FCL' as const,
  })

  it('accepts minimal valid input', () => {
    expect(createUnitSchema.parse(validUnit())).toBeDefined()
  })

  it('accepts FCL-specific fields', () => {
    const result = createUnitSchema.parse({
      ...validUnit(),
      containerNumber: 'MSKU1234567',
      containerType: '40HC',
    })
    expect(result.containerNumber).toBe('MSKU1234567')
  })

  it('accepts LCL-specific fields', () => {
    const result = createUnitSchema.parse({
      ...validUnit(),
      cargoType: 'LCL',
      packageCount: 10,
      packagesDetail: [{ packageType: 'PLT', packageCount: 5 }],
    })
    expect(result.packageCount).toBe(10)
  })

  it('coerces grossWeight from string', () => {
    const result = createUnitSchema.parse({ ...validUnit(), grossWeight: '150.5' })
    expect(result.grossWeight).toBe(150.5)
  })

  it('validates weight unit', () => {
    expect(() => createUnitSchema.parse({ ...validUnit(), weightUnit: 'stones' })).toThrow()
  })

  it('defaults isHazardous to false', () => {
    const result = createUnitSchema.parse(validUnit())
    expect(result.isHazardous).toBe(false)
  })

  it('defaults sortOrder to 0', () => {
    const result = createUnitSchema.parse(validUnit())
    expect(result.sortOrder).toBe(0)
  })
})

// ─── FmsFileLeg Schemas ─────────────────────────────────────────────────────

describe('createLegSchema', () => {
  const validLeg = () => ({
    organizationId: uuid(),
    tenantId: uuid(),
    fileId: uuid(),
    legSequence: 1,
    type: 'SHIP' as const,
  })

  it('accepts minimal valid input', () => {
    expect(createLegSchema.parse(validLeg())).toBeDefined()
  })

  it('rejects legSequence < 1', () => {
    expect(() => createLegSchema.parse({ ...validLeg(), legSequence: 0 })).toThrow()
  })

  it('validates leg type enum', () => {
    expect(() => createLegSchema.parse({ ...validLeg(), type: 'HELICOPTER' })).toThrow()
  })

  it('accepts all valid leg types', () => {
    for (const type of ['TRUCK', 'SHIP', 'RAIL', 'AIR']) {
      expect(createLegSchema.parse({ ...validLeg(), type }).type).toBe(type)
    }
  })

  it('accepts SHIP-specific fields', () => {
    const result = createLegSchema.parse({
      ...validLeg(),
      vesselName: 'EVER GIVEN',
      vesselImo: '9811000',
      voyageNumber: '123E',
      bookingNumber: 'BK001',
    })
    expect(result.vesselName).toBe('EVER GIVEN')
  })

  it('accepts AIR-specific fields', () => {
    const result = createLegSchema.parse({
      ...validLeg(),
      type: 'AIR',
      flightNumber: 'LH1234',
      aircraftType: 'B777F',
    })
    expect(result.flightNumber).toBe('LH1234')
  })

  it('coerces demFreeTime from string', () => {
    const result = createLegSchema.parse({ ...validLeg(), demFreeTime: '5' })
    expect(result.demFreeTime).toBe(5)
  })

  it('rejects negative demFreeTime', () => {
    expect(() => createLegSchema.parse({ ...validLeg(), demFreeTime: -1 })).toThrow()
  })
})

describe('addTimestampSchema', () => {
  it('validates correct timestamp input', () => {
    const result = addTimestampSchema.parse({
      legId: uuid(),
      timestampType: 'eta',
      entry: {
        value: '2026-03-15T10:00:00Z',
        offset: '+08:00',
        source: 'carrier_api',
        updatedAt: '2026-03-15T10:00:00Z',
      },
    })
    expect(result.timestampType).toBe('eta')
  })

  it('rejects invalid timestamp type', () => {
    expect(() =>
      addTimestampSchema.parse({
        legId: uuid(),
        timestampType: 'xxx',
        entry: {
          value: '2026-03-15T10:00:00Z',
          offset: null,
          source: 'manual',
          updatedAt: '2026-03-15T10:00:00Z',
        },
      })
    ).toThrow()
  })

  it('rejects invalid source', () => {
    expect(() =>
      addTimestampSchema.parse({
        legId: uuid(),
        timestampType: 'ata',
        entry: {
          value: '2026-03-15T10:00:00Z',
          offset: null,
          source: 'gps',
          updatedAt: '2026-03-15T10:00:00Z',
        },
      })
    ).toThrow()
  })

  it('accepts all valid timestamp types', () => {
    for (const type of ['ptd', 'etd', 'atd', 'pta', 'eta', 'ata']) {
      expect(
        addTimestampSchema.parse({
          legId: uuid(),
          timestampType: type,
          entry: {
            value: '2026-03-15T10:00:00Z',
            offset: null,
            source: 'manual',
            updatedAt: '2026-03-15T10:00:00Z',
          },
        }).timestampType
      ).toBe(type)
    }
  })
})

// ─── FmsFileUnitLeg Schemas ─────────────────────────────────────────────────

describe('createUnitLegSchema', () => {
  const validUnitLeg = () => ({
    organizationId: uuid(),
    tenantId: uuid(),
    unitId: uuid(),
    legId: uuid(),
  })

  it('accepts minimal valid input', () => {
    expect(createUnitLegSchema.parse(validUnitLeg())).toBeDefined()
  })

  it('accepts TRUCK-specific fields', () => {
    const result = createUnitLegSchema.parse({
      ...validUnitLeg(),
      truckPlate: 'WI 12345',
      trailerPlate: 'WI 67890',
      driverFullName: 'Jan Kowalski',
      driverPhone: '+48123456789',
    })
    expect(result.truckPlate).toBe('WI 12345')
  })

  it('accepts timestamp fields', () => {
    const result = createUnitLegSchema.parse({
      ...validUnitLeg(),
      ptd: '2026-03-10 08:00',
      atd: '2026-03-10 09:15',
      ata: '2026-03-11 14:00',
    })
    expect(result.ptd).toBe('2026-03-10 08:00')
  })
})

// ─── FmsFileLine Schemas ────────────────────────────────────────────────────

describe('fmsFileLineCreateSchema', () => {
  it('accepts valid cost line', () => {
    const result = fmsFileLineCreateSchema.parse({
      productName: 'Ocean Freight',
      quantity: '1',
      currencyCode: 'USD',
      soldUnitPrice: '1500.00',
      soldAmount: '1500.00',
    })
    expect(result.productName).toBe('Ocean Freight')
    expect(result.sourceType).toBe('manual') // default
  })

  it('defaults quantity to 1', () => {
    const result = fmsFileLineCreateSchema.parse({ productName: 'THC' })
    expect(result.quantity).toBe('1')
  })

  it('defaults currency to USD', () => {
    const result = fmsFileLineCreateSchema.parse({ productName: 'THC' })
    expect(result.currencyCode).toBe('USD')
  })

  it('rejects empty product name', () => {
    expect(() => fmsFileLineCreateSchema.parse({ productName: '' })).toThrow()
  })

  it('rejects product name over 500 chars', () => {
    expect(() => fmsFileLineCreateSchema.parse({ productName: 'x'.repeat(501) })).toThrow()
  })

  it('accepts decimal string for prices', () => {
    const result = fmsFileLineCreateSchema.parse({
      productName: 'THC',
      soldUnitPrice: '99.50',
      estimatedCost: '85.25',
    })
    expect(result.soldUnitPrice).toBe('99.50')
    expect(result.estimatedCost).toBe('85.25')
  })

  it('coerces number to decimal string', () => {
    const result = fmsFileLineCreateSchema.parse({
      productName: 'THC',
      soldUnitPrice: 100,
    })
    expect(result.soldUnitPrice).toBe('100')
  })

  it('rejects invalid decimal string', () => {
    expect(() =>
      fmsFileLineCreateSchema.parse({ productName: 'THC', soldUnitPrice: 'abc' })
    ).toThrow()
  })

  it('rejects currency code not exactly 3 chars', () => {
    expect(() =>
      fmsFileLineCreateSchema.parse({ productName: 'THC', currencyCode: 'US' })
    ).toThrow()
  })
})

describe('fmsFileLineUpdateSchema', () => {
  it('requires id, all other fields optional', () => {
    const result = fmsFileLineUpdateSchema.parse({ id: uuid() })
    expect(result.id).toBeDefined()
  })

  it('accepts partial update', () => {
    const result = fmsFileLineUpdateSchema.parse({
      id: uuid(),
      actualCost: '150.00',
      notes: 'Invoice received',
    })
    expect(result.actualCost).toBe('150.00')
  })
})

// ─── FmsFileNote Schemas ────────────────────────────────────────────────────

describe('fmsFileNoteCreateSchema', () => {
  it('accepts valid note', () => {
    expect(fmsFileNoteCreateSchema.parse({ body: 'Test note' })).toBeDefined()
  })

  it('trims whitespace', () => {
    const result = fmsFileNoteCreateSchema.parse({ body: '  Hello  ' })
    expect(result.body).toBe('Hello')
  })

  it('rejects empty body', () => {
    expect(() => fmsFileNoteCreateSchema.parse({ body: '' })).toThrow()
  })

  it('rejects body over 5000 chars', () => {
    expect(() => fmsFileNoteCreateSchema.parse({ body: 'x'.repeat(5001) })).toThrow()
  })
})

// ─── FmsFileInvoice Schemas ─────────────────────────────────────────────────

describe('fmsFileInvoiceReviewSchema', () => {
  it('accepts approved review', () => {
    const result = fmsFileInvoiceReviewSchema.parse({
      id: uuid(),
      status: 'approved',
    })
    expect(result.status).toBe('approved')
  })

  it('accepts rejected review with notes', () => {
    const result = fmsFileInvoiceReviewSchema.parse({
      id: uuid(),
      status: 'rejected',
      reviewNotes: 'Amounts do not match',
    })
    expect(result.reviewNotes).toBe('Amounts do not match')
  })

  it('rejects pending_review as review status', () => {
    expect(() =>
      fmsFileInvoiceReviewSchema.parse({ id: uuid(), status: 'pending_review' })
    ).toThrow()
  })
})

// ─── PackageDetail Schema ───────────────────────────────────────────────────

describe('packageDetailSchema', () => {
  it('accepts empty object', () => {
    expect(packageDetailSchema.parse({})).toBeDefined()
  })

  it('accepts full package detail', () => {
    const result = packageDetailSchema.parse({
      packageType: 'PLT',
      packageCount: 10,
      commodityDescription: 'Electronics',
      grossWeight: 500,
      weightUnit: 'kg',
      volume: 2.5,
      volumeUnit: 'cbm',
      isHazardous: true,
      hazmatClass: '3',
      unNumber: 'UN1234',
      length: 120,
      width: 100,
      height: 80,
      dimensionUnit: 'cm',
    })
    expect(result.packageType).toBe('PLT')
    expect(result.isHazardous).toBe(true)
  })

  it('defaults isHazardous to false', () => {
    const result = packageDetailSchema.parse({})
    expect(result.isHazardous).toBe(false)
  })

  it('rejects negative packageCount', () => {
    expect(() => packageDetailSchema.parse({ packageCount: -1 })).toThrow()
  })

  it('rejects invalid dimension unit', () => {
    expect(() => packageDetailSchema.parse({ dimensionUnit: 'km' })).toThrow()
  })
})
