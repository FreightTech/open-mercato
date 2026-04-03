import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  ensureContractor,
  createFileFixture,
  createUnitFixture,
  createLegFixture,
  createUnitLegFixture,
  createLineFixture,
  createNoteFixture,
  getFileById,
  deleteFileIfExists,
  deleteContractorIfExists,
} from './helpers/fileFixtures'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-FMS-FILES-002: File Child Entities (Units, Legs, Unit-Legs, Lines, Notes)
 */
test.describe('TC-FMS-FILES-002: File Child Entities', () => {
  let contractorId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    contractorId = await ensureContractor(page.request)
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    await deleteContractorIfExists(page.request, contractorId)
    await page.close()
  })

  test('should create an FCL unit with container details', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, {
        cargoType: 'FCL',
        containerNumber: 'MSKU1234567',
        containerType: '40HC',
      })

      expect(unit.id).toBeTruthy()
      // Verify via file detail (response field names may vary)
      const detail = await getFileById(page.request, fileId)
      const units = detail!.units as Array<Record<string, unknown>>
      const created = units.find((u) => u.id === unit.id)
      expect(created).toBeDefined()
      expect(created!.containerNumber ?? created!.container_number).toBe('MSKU1234567')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should create an LCL unit with commodity description', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, {
        cargoType: 'LCL',
        commodityDescription: 'Electronics and accessories',
      })

      expect(unit.id).toBeTruthy()
      const detail = await getFileById(page.request, fileId)
      const units = detail!.units as Array<Record<string, unknown>>
      const created = units.find((u) => u.id === unit.id)
      expect(created).toBeDefined()
      expect(created!.commodityDescription ?? created!.commodity_description).toBe('Electronics and accessories')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should create SHIP and TRUCK legs', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const shipLeg = await createLegFixture(page.request, fileId, {
        legSequence: 1,
        type: 'SHIP',
        vesselName: 'EVER GIVEN',
        bookingNumber: 'BK-TEST-001',
      })
      expect(shipLeg.type).toBe('SHIP')
      expect(shipLeg.vesselName).toBe('EVER GIVEN')

      const truckLeg = await createLegFixture(page.request, fileId, {
        legSequence: 2,
        type: 'TRUCK',
        notes: 'Last mile delivery',
      })
      expect(truckLeg.type).toBe('TRUCK')
      expect(truckLeg.notes).toBe('Last mile delivery')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should assign a unit to a leg (unit-leg)', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, {
        containerNumber: 'TSTU0000001',
        containerType: '20GP',
      })
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      const unitLeg = await createUnitLegFixture(page.request, unit.id, leg.id, {
        truckPlate: 'WI 12345',
      })

      expect(unitLeg.id).toBeTruthy()
      // Verify via file detail (CRUD response field names may differ)
      const detail = await getFileById(page.request, fileId)
      const unitLegs = detail!.unitLegs as Array<Record<string, unknown>>
      const created = unitLegs.find((ul) => ul.id === unitLeg.id)
      expect(created).toBeDefined()
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should create a cost line with auto-calculated amount', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const line = await createLineFixture(page.request, fileId, {
        productName: 'Terminal Handling Charge',
        quantity: '2',
        soldUnitPrice: '250.00',
        currencyCode: 'USD',
      })

      expect(line.productName).toBe('Terminal Handling Charge')
      expect(parseFloat(line.soldAmount)).toBe(500)
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should create and list notes', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const note = await createNoteFixture(page.request, fileId, 'Test note body')
      expect(note.body).toBe('Test note body')

      const response = await page.request.fetch(`${BASE_URL}/api/fms_files/files/${fileId}/notes`)
      expect(response.ok()).toBeTruthy()
      const body = await response.json() as { items: Array<{ id: string; body: string }> }
      expect(body.items.find((n) => n.id === note.id)).toBeDefined()
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should return all child entities in file detail', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'DTLU0000001' })
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'SHIP' })
      await createUnitLegFixture(page.request, unit.id, leg.id)
      await createLineFixture(page.request, fileId, { productName: 'Ocean Freight' })

      const detail = await getFileById(page.request, fileId)
      expect(detail).toBeTruthy()

      const units = detail!.units as Array<{ id: string }>
      const legs = detail!.legs as Array<{ id: string }>
      const unitLegs = detail!.unitLegs as Array<{ unitId: string; legId: string }>

      expect(units.some((u) => u.id === unit.id)).toBe(true)
      expect(legs.some((l) => l.id === leg.id)).toBe(true)
      expect(unitLegs.some((ul) => ul.unitId === unit.id && ul.legId === leg.id)).toBe(true)
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should compute file status from child entities', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      // Empty file
      const emptyDetail = await getFileById(page.request, fileId)
      const emptyStatus = emptyDetail!.status as Record<string, string>
      expect(emptyStatus.transport).toBe('EMPTY')
      expect(emptyStatus.financial).toBe('NO_LINES')
      expect(emptyStatus.documentation).toBe('PENDING')

      // Add children
      await createUnitFixture(page.request, fileId, { containerNumber: 'STSU0000001' })
      await createLegFixture(page.request, fileId, { legSequence: 1, type: 'SHIP' })
      await createLineFixture(page.request, fileId, { productName: 'THC' })

      const detail = await getFileById(page.request, fileId)
      const status = detail!.status as Record<string, string>
      expect(status.transport).not.toBe('DELIVERED')
      expect(status.financial).toBe('ESTIMATED')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })
})
