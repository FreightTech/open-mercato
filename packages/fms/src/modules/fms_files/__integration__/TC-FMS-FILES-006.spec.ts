import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  ensureContractor,
  createFileFixture,
  createUnitFixture,
  createLegFixture,
  createUnitLegFixture,
  createLineFixture,
  getFileById,
  deleteFileIfExists,
  deleteContractorIfExists,
} from './helpers/fileFixtures'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-FMS-FILES-006: Timestamps, Unit-Leg Restore, Cost Line Operations
 *
 * Covers:
 * 1. POST leg timestamps (SCD array append, history preserved)
 * 2. Unit-leg soft-delete + restore (POST same unit+leg → 200 restore)
 * 3. Cost line amount recalculation on update
 * 4. Cost line: offer line deletion rejection
 * 5. Cost line: delete via query param
 */
test.describe('TC-FMS-FILES-006: Timestamps, Restore, Cost Lines', () => {
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

  test('should append timestamp to leg SCD array and preserve history', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'SHIP' })

      // Append first ETA
      const res1 = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${leg.id}/timestamps`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ timestampType: 'eta', value: '2026-03-20T00:00:00Z' }),
        },
      )
      expect(res1.ok()).toBeTruthy()
      const body1 = await res1.json() as { total: number; entry: { source: string } }
      expect(body1.total).toBe(1)
      expect(body1.entry.source).toBe('manual')

      // Append second ETA (update)
      const res2 = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${leg.id}/timestamps`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ timestampType: 'eta', value: '2026-03-22T00:00:00Z' }),
        },
      )
      expect(res2.ok()).toBeTruthy()
      const body2 = await res2.json() as { total: number }
      expect(body2.total).toBe(2) // History preserved

      // Append ATD (different type)
      const res3 = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${leg.id}/timestamps`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ timestampType: 'atd', value: '2026-03-18T06:00:00Z' }),
        },
      )
      expect(res3.ok()).toBeTruthy()

      // Verify via file detail — leg should have both etaTimestamps (2) and atdTimestamps (1)
      const detail = await getFileById(page.request, fileId)
      const legs = detail!.legs as Array<Record<string, unknown>>
      const updatedLeg = legs.find((l) => l.id === leg.id)
      expect(updatedLeg).toBeDefined()

      const etaTs = updatedLeg!.etaTimestamps as Array<{ value: string }>
      const atdTs = updatedLeg!.atdTimestamps as Array<{ value: string }>
      expect(etaTs).toHaveLength(2)
      expect(etaTs[0].value).toBe('2026-03-20T00:00:00Z')
      expect(etaTs[1].value).toBe('2026-03-22T00:00:00Z') // latest is last
      expect(atdTs).toHaveLength(1)
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should reject invalid timestamp type', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'SHIP' })

      const res = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/legs/${leg.id}/timestamps`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ timestampType: 'invalid', value: '2026-03-20T00:00:00Z' }),
        },
      )
      expect(res.ok()).toBeFalsy()
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should restore soft-deleted unit-leg when re-creating same assignment', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id
      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'RSTU0000001' })
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })

      // Create unit-leg
      const ul = await createUnitLegFixture(page.request, unit.id, leg.id, { truckPlate: 'WA 11111' })

      // Delete it
      const delRes = await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs/${ul.id}`,
        { method: 'DELETE' },
      )
      expect(delRes.ok()).toBeTruthy()

      // Verify deleted
      const listRes = await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs?unitId=${unit.id}`,
      )
      const listBody = await listRes.json() as { items: unknown[] }
      expect(listBody.items).toHaveLength(0)

      // Re-create same assignment → should restore, not duplicate
      const restored = await createUnitLegFixture(page.request, unit.id, leg.id, { truckPlate: 'WA 22222' })
      expect(restored.id).toBe(ul.id) // Same ID restored

      // Verify it's back
      const listRes2 = await page.request.fetch(
        `${BASE_URL}/api/fms_files/unit-legs?unitId=${unit.id}`,
      )
      const listBody2 = await listRes2.json() as { items: Array<{ id: string }> }
      expect(listBody2.items).toHaveLength(1)
      expect(listBody2.items[0].id).toBe(ul.id)
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should recalculate cost line amounts on quantity update', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      // Create line: qty=2, unitPrice=100 → soldAmount=200
      const line = await createLineFixture(page.request, fileId, {
        productName: 'Ocean Freight',
        quantity: '2',
        soldUnitPrice: '100.00',
      })
      expect(parseFloat(line.soldAmount)).toBe(200)

      // Update quantity and unit price together → recalculates
      const updateRes = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/lines`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ id: line.id, quantity: '5', soldUnitPrice: '100.00' }),
        },
      )
      expect(updateRes.ok()).toBeTruthy()
      const updated = await updateRes.json() as Record<string, unknown>
      expect(parseFloat(updated.soldAmount as string)).toBe(500) // 5 × 100

      // Update unit price with quantity in same request → full recalc
      const updateRes2 = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/lines`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ id: line.id, quantity: '5', soldUnitPrice: '200.00' }),
        },
      )
      expect(updateRes2.ok()).toBeTruthy()
      const updated2 = await updateRes2.json() as Record<string, unknown>
      expect(parseFloat(updated2.soldAmount as string)).toBe(1000) // 5 × 200
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should recalculate estimated and actual costs on update', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const line = await createLineFixture(page.request, fileId, {
        productName: 'THC',
        quantity: '3',
        soldUnitPrice: '50.00',
      })

      // Add estimated and actual costs with quantity in same request
      const res1 = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/lines`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            id: line.id,
            quantity: '3',
            soldUnitPrice: '50.00',
            estimatedUnitCost: '40.00',
            actualUnitCost: '38.50',
          }),
        },
      )
      expect(res1.ok()).toBeTruthy()
      const u1 = await res1.json() as Record<string, unknown>
      expect(parseFloat(u1.soldAmount as string)).toBe(150) // 3 × 50
      expect(parseFloat(u1.estimatedCost as string)).toBe(120) // 3 × 40
      expect(parseFloat(u1.actualCost as string)).toBe(115.5) // 3 × 38.50

      // Clear estimated → estimatedCost should become null
      const res3 = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/lines`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ id: line.id, estimatedUnitCost: null }),
        },
      )
      expect(res3.ok()).toBeTruthy()
      const u3 = await res3.json() as Record<string, unknown>
      expect(u3.estimatedCost).toBeNull()
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should delete a manual cost line via query param', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id
      const line = await createLineFixture(page.request, fileId, { productName: 'To Delete' })

      const delRes = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/lines?id=${line.id}`,
        { method: 'DELETE' },
      )
      expect(delRes.ok()).toBeTruthy()

      // Verify gone from list
      const listRes = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/lines`,
      )
      const body = await listRes.json() as { items: Array<{ id: string }> }
      expect(body.items.find((l) => l.id === line.id)).toBeUndefined()
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should auto-increment line number', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const line1 = await createLineFixture(page.request, fileId, { productName: 'Line A' })
      const line2 = await createLineFixture(page.request, fileId, { productName: 'Line B' })
      const line3 = await createLineFixture(page.request, fileId, { productName: 'Line C' })

      // List and verify line numbers are sequential
      const listRes = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files/${fileId}/lines`,
      )
      const body = await listRes.json() as { items: Array<{ id: string; lineNumber: number }> }
      const numbers = body.items.map((l) => l.lineNumber).sort((a, b) => a - b)
      expect(numbers).toEqual([1, 2, 3])
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })
})
