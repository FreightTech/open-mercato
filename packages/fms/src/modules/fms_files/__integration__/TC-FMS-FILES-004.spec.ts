import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  ensureContractor,
  createFileFixture,
  createUnitFixture,
  createLegFixture,
  createUnitLegFixture,
  getFileById,
  deleteFileIfExists,
  deleteContractorIfExists,
} from './helpers/fileFixtures'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-FMS-FILES-004: Multimodal Transport (TRUCK → SHIP → RAIL → TRUCK)
 *
 * Verifies:
 * 1. Creating a full 4-leg multimodal route
 * 2. Assigning a unit to all legs
 * 3. File detail returns correct leg ordering
 * 4. Status is computed from the full chain
 * 5. Updating timestamps on different leg types
 * 6. Removing a middle leg (RAIL) and verifying cascade
 */
test.describe('TC-FMS-FILES-004: Multimodal Transport', () => {
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

  test('should create a full TRUCK → SHIP → RAIL → TRUCK route', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId, {
        shipmentType: 'EXP',
        cargoType: 'FCL',
        notes: 'Multimodal test: Warsaw → Gdynia → Shanghai → Chengdu → Warehouse',
      })
      fileId = file.id

      const truck1 = await createLegFixture(page.request, fileId, {
        legSequence: 1, type: 'TRUCK', notes: 'Pre-carriage to port',
      })
      const ship = await createLegFixture(page.request, fileId, {
        legSequence: 2, type: 'SHIP',
        vesselName: 'EVER GIVEN', bookingNumber: 'BK-MM-001',
      })
      const rail = await createLegFixture(page.request, fileId, {
        legSequence: 3, type: 'RAIL', notes: 'Intermodal rail to inland',
      })
      const truck2 = await createLegFixture(page.request, fileId, {
        legSequence: 4, type: 'TRUCK', notes: 'Last mile delivery',
      })

      // Verify all 4 legs created
      const detail = await getFileById(page.request, fileId)
      const legs = detail!.legs as Array<{ id: string; legSequence: number; type: string }>
      expect(legs).toHaveLength(4)
      expect(legs.map((l) => l.type)).toEqual(['TRUCK', 'SHIP', 'RAIL', 'TRUCK'])
      expect(legs.map((l) => l.legSequence)).toEqual([1, 2, 3, 4])
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should assign a unit to all 4 legs and verify in detail', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, {
        containerNumber: 'MMTU0000001', containerType: '40HC',
      })
      const truck1 = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      const ship = await createLegFixture(page.request, fileId, { legSequence: 2, type: 'SHIP' })
      const rail = await createLegFixture(page.request, fileId, { legSequence: 3, type: 'RAIL' })
      const truck2 = await createLegFixture(page.request, fileId, { legSequence: 4, type: 'TRUCK' })

      // Assign unit to all legs
      await createUnitLegFixture(page.request, unit.id, truck1.id, { truckPlate: 'WI 11111' })
      await createUnitLegFixture(page.request, unit.id, ship.id)
      await createUnitLegFixture(page.request, unit.id, rail.id)
      await createUnitLegFixture(page.request, unit.id, truck2.id, { truckPlate: 'CD 22222' })

      const detail = await getFileById(page.request, fileId)
      const unitLegs = detail!.unitLegs as Array<Record<string, unknown>>
      // Should have 4 unit-leg assignments for this unit
      const forUnit = unitLegs.filter((ul) =>
        (ul.unitId ?? ul.unit) === unit.id
      )
      expect(forUnit.length).toBe(4)
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should progress status as timestamps are added', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      // Empty file → EMPTY
      let detail = await getFileById(page.request, fileId)
      let status = (detail!.status as Record<string, string>).transport
      expect(status).toBe('EMPTY')

      // Add unit + legs, assign unit to all legs
      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'PRGU0000001' })
      const truck1 = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      const ship = await createLegFixture(page.request, fileId, { legSequence: 2, type: 'SHIP' })
      const truck2 = await createLegFixture(page.request, fileId, { legSequence: 3, type: 'TRUCK' })

      const ul1 = await createUnitLegFixture(page.request, unit.id, truck1.id)
      await createUnitLegFixture(page.request, unit.id, ship.id)
      const ul3 = await createUnitLegFixture(page.request, unit.id, truck2.id)

      // With unit + legs but no locations → PLANNING (unit not fully covered)
      detail = await getFileById(page.request, fileId)
      status = (detail!.status as Record<string, string>).transport
      expect(status).toBe('PLANNING')

      // Add ATD to first TRUCK unit-leg
      await page.request.fetch(`${BASE_URL}/api/fms_files/unit-legs/${ul1.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ atd: '2026-03-01 08:00' }),
      })

      // Still PLANNING because unit has no origin/destination location IDs
      // (coverage check requires matching locations). But ATD is recorded.
      detail = await getFileById(page.request, fileId)
      status = (detail!.status as Record<string, string>).transport
      expect(status).toBe('PLANNING')

      // Verify the ATD was actually stored on the unit-leg
      const ulDetail = detail!.unitLegs as Array<Record<string, unknown>>
      const ul1Updated = ulDetail.find((ul) => ul.id === ul1.id)
      expect(ul1Updated!.atd).toBe('2026-03-01 08:00')

      // Add ATA to final TRUCK unit-leg
      await page.request.fetch(`${BASE_URL}/api/fms_files/unit-legs/${ul3.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ ata: '2026-04-01 14:00' }),
      })

      // Verify ATA stored
      detail = await getFileById(page.request, fileId)
      const ul3Detail = (detail!.unitLegs as Array<Record<string, unknown>>).find((ul) => ul.id === ul3.id)
      expect(ul3Detail!.ata).toBe('2026-04-01 14:00')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should cascade middle RAIL leg deletion to unit-legs', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'CASU0000001' })
      const truck1 = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      const ship = await createLegFixture(page.request, fileId, { legSequence: 2, type: 'SHIP' })
      const rail = await createLegFixture(page.request, fileId, { legSequence: 3, type: 'RAIL' })
      const truck2 = await createLegFixture(page.request, fileId, { legSequence: 4, type: 'TRUCK' })

      await createUnitLegFixture(page.request, unit.id, truck1.id)
      await createUnitLegFixture(page.request, unit.id, ship.id)
      await createUnitLegFixture(page.request, unit.id, rail.id)
      await createUnitLegFixture(page.request, unit.id, truck2.id)

      // Delete RAIL leg
      await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${rail.id}`,
        { method: 'DELETE' },
      )

      // Verify unit-leg assignments for RAIL leg are cascade-deleted
      const ulResponse = await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs?legId=${rail.id}`,
      )
      expect(ulResponse.ok()).toBeTruthy()
      const ulBody = await ulResponse.json() as { items: unknown[] }
      expect(ulBody.items).toHaveLength(0)

      // Unit-legs for other legs still intact
      for (const legId of [truck1.id, ship.id, truck2.id]) {
        const r = await page.request.fetch(
          `${BASE_URL}/api/fms_files/unit-legs?legId=${legId}`,
        )
        const body = await r.json() as { items: unknown[] }
        expect(body.items.length).toBeGreaterThanOrEqual(1)
      }
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should update SHIP leg with vessel info and TRUCK unit-leg with driver info', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'UPDU0000001' })
      const truck1 = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      const ship = await createLegFixture(page.request, fileId, { legSequence: 2, type: 'SHIP' })

      const ulTruck = await createUnitLegFixture(page.request, unit.id, truck1.id)

      // Update SHIP vessel info
      await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${ship.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            vesselName: 'MSC ANNA',
            vesselImo: '9839430',
            voyageNumber: '123W',
          }),
        },
      )

      // Update TRUCK unit-leg with driver info
      await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs/${ulTruck.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            truckPlate: 'GD 55555',
            driverFullName: 'Adam Nowak',
            driverPhone: '+48500100200',
            atd: '2026-03-01 06:00',
            ata: '2026-03-01 14:30',
          }),
        },
      )

      // Verify both updates via file detail
      const detail = await getFileById(page.request, fileId)
      const legs = detail!.legs as Array<Record<string, unknown>>
      const shipLeg = legs.find((l) => l.id === ship.id)
      expect(shipLeg!.vesselName).toBe('MSC ANNA')
      expect(shipLeg!.vesselImo).toBe('9839430')
      expect(shipLeg!.voyageNumber).toBe('123W')

      const unitLegs = detail!.unitLegs as Array<Record<string, unknown>>
      const truckUl = unitLegs.find((ul) => ul.id === ulTruck.id)
      expect(truckUl!.driverFullName).toBe('Adam Nowak')
      expect(truckUl!.atd).toBe('2026-03-01 06:00')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })
})
