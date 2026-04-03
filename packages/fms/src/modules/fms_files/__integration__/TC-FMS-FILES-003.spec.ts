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
 * TC-FMS-FILES-003: Unit/Leg Deletion Cascades and Updates
 */
test.describe('TC-FMS-FILES-003: Cascades and Updates', () => {
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

  test('should cascade unit deletion to unit-legs', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'DEL-UNIT-001' })
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      await createUnitLegFixture(page.request, unit.id, leg.id)

      // Delete unit
      const delResponse = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/units/${unit.id}`,
        { method: 'DELETE' },
      )
      expect(delResponse.ok()).toBeTruthy()

      // Unit-legs for this unit should be gone
      const ulResponse = await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs?unitId=${unit.id}`,
      )
      expect(ulResponse.ok()).toBeTruthy()
      const ulBody = await ulResponse.json() as { items: unknown[] }
      expect(ulBody.items.length).toBe(0)
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should cascade leg deletion to unit-legs', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'DEL-LEG-001' })
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'SHIP' })
      await createUnitLegFixture(page.request, unit.id, leg.id)

      // Delete leg
      const delResponse = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${leg.id}`,
        { method: 'DELETE' },
      )
      expect(delResponse.ok()).toBeTruthy()

      // Unit-legs for this leg should be gone
      const ulResponse = await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs?legId=${leg.id}`,
      )
      expect(ulResponse.ok()).toBeTruthy()
      const ulBody = await ulResponse.json() as { items: unknown[] }
      expect(ulBody.items.length).toBe(0)
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should update a leg vessel name and notes', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const leg = await createLegFixture(page.request, fileId, {
        legSequence: 1,
        type: 'SHIP',
        vesselName: 'OLD VESSEL',
      })

      const updateResponse = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${leg.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ vesselName: 'NEW VESSEL', notes: 'Updated via test' }),
        },
      )
      expect(updateResponse.ok()).toBeTruthy()

      const detail = await getFileById(page.request, fileId)
      const legs = detail!.legs as Array<{ id: string; vesselName: string; notes: string }>
      const updatedLeg = legs.find((l) => l.id === leg.id)
      expect(updatedLeg!.vesselName).toBe('NEW VESSEL')
      expect(updatedLeg!.notes).toBe('Updated via test')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should update a unit-leg with truck details', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'UPD-UL-001' })
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      const unitLeg = await createUnitLegFixture(page.request, unit.id, leg.id)

      const updateResponse = await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs/${unitLeg.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            truckPlate: 'KR 99999',
            driverFullName: 'Jan Kowalski',
            atd: '2026-03-15 08:00',
          }),
        },
      )
      expect(updateResponse.ok()).toBeTruthy()

      const getResponse = await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs/${unitLeg.id}`,
      )
      const updated = await getResponse.json() as Record<string, unknown>
      expect(updated.truckPlate).toBe('KR 99999')
      expect(updated.driverFullName).toBe('Jan Kowalski')
      expect(updated.atd).toBe('2026-03-15 08:00')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should add multiple legs with sequential leg sequences', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const leg1 = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      const leg2 = await createLegFixture(page.request, fileId, { legSequence: 2, type: 'SHIP' })
      const leg3 = await createLegFixture(page.request, fileId, { legSequence: 3, type: 'TRUCK' })

      expect(leg1.legSequence).toBe(1)
      expect(leg2.legSequence).toBe(2)
      expect(leg3.legSequence).toBe(3)

      const detail = await getFileById(page.request, fileId)
      const legs = detail!.legs as Array<{ legSequence: number }>
      expect(legs.map((l) => l.legSequence)).toEqual([1, 2, 3])
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should remove a middle leg without affecting other legs', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const leg1 = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
      const leg2 = await createLegFixture(page.request, fileId, { legSequence: 2, type: 'SHIP' })
      const leg3 = await createLegFixture(page.request, fileId, { legSequence: 3, type: 'TRUCK' })

      await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${leg2.id}`,
        { method: 'DELETE' },
      )

      const detail = await getFileById(page.request, fileId)
      const legIds = (detail!.legs as Array<{ id: string }>).map((l) => l.id)
      expect(legIds).toContain(leg1.id)
      expect(legIds).not.toContain(leg2.id)
      expect(legIds).toContain(leg3.id)
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })
})
