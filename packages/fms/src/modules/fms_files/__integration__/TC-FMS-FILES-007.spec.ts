import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  ensureContractor,
  createFileFixture,
  createUnitFixture,
  createLegFixture,
  createUnitLegFixture,
  deleteFileIfExists,
  deleteContractorIfExists,
} from './helpers/fileFixtures'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-FMS-FILES-007: Transport API — Status Filter + Units View
 *
 * Covers:
 * 1. Transport API status filtering (?status=PENDING,DEPARTED)
 * 2. Units view (?view=units) with grouped data
 * 3. Legs view with legType + status combined filter
 * 4. Pagination params
 */
test.describe('TC-FMS-FILES-007: Transport API Filters', () => {
  let contractorId: string
  let fileId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')

    contractorId = await ensureContractor(page.request)
    const file = await createFileFixture(page.request, contractorId)
    fileId = file.id

    const unit = await createUnitFixture(page.request, fileId, {
      containerNumber: 'SFTU0000001', containerType: '40HC',
    })

    // Create legs with varied types
    const truck = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
    const ship = await createLegFixture(page.request, fileId, { legSequence: 2, type: 'SHIP' })

    // Assign unit to both legs, set ATD on truck (DEPARTED status)
    const ulTruck = await createUnitLegFixture(page.request, unit.id, truck.id)
    await createUnitLegFixture(page.request, unit.id, ship.id)

    // Set truck ATD → unit-leg status becomes DEPARTED
    await page.request.fetch(`${BASE_URL}/api/fms_files/unit-legs/${ulTruck.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ atd: '2026-03-10 08:00' }),
    })

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    await deleteFileIfExists(page.request, fileId)
    await deleteContractorIfExists(page.request, contractorId)
    await page.close()
  })

  test('should return all unit-legs on default legs view', async ({ page }) => {
    await login(page, 'superadmin')

    const res = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=50`,
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { items: Array<Record<string, unknown>>; total: number }
    expect(body.total).toBeGreaterThanOrEqual(2) // at least our 2 unit-legs
  })

  test('should filter by status=PENDING', async ({ page }) => {
    await login(page, 'superadmin')

    const res = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=100&status=PENDING`,
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { items: Array<Record<string, unknown>> }

    // All returned items should have derivedStatus=PENDING
    for (const item of body.items) {
      expect(item.derivedStatus).toBe('PENDING')
    }
  })

  test('should filter by status=DEPARTED', async ({ page }) => {
    await login(page, 'superadmin')

    const res = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=100&status=DEPARTED`,
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { items: Array<Record<string, unknown>> }

    for (const item of body.items) {
      expect(item.derivedStatus).toBe('DEPARTED')
    }
    // Our truck unit-leg has ATD → should be DEPARTED
    expect(body.items.length).toBeGreaterThanOrEqual(1)
  })

  test('should filter by multiple statuses (comma-separated)', async ({ page }) => {
    await login(page, 'superadmin')

    const res = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=100&status=PENDING,DEPARTED`,
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { items: Array<Record<string, unknown>> }

    for (const item of body.items) {
      expect(['PENDING', 'DEPARTED']).toContain(item.derivedStatus)
    }
    // Should include both our PENDING (ship) and DEPARTED (truck) unit-legs
    expect(body.items.length).toBeGreaterThanOrEqual(2)
  })

  test('should combine legType and status filters', async ({ page }) => {
    await login(page, 'superadmin')

    // TRUCK + DEPARTED → only our departed truck
    const res = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=100&legType=TRUCK&status=DEPARTED`,
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { items: Array<Record<string, unknown>> }

    for (const item of body.items) {
      expect(item.legType).toBe('TRUCK')
      expect(item.derivedStatus).toBe('DEPARTED')
    }

    // SHIP + DEPARTED → should be empty (our SHIP unit-leg has no ATD)
    const res2 = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=100&legType=SHIP&status=DEPARTED`,
    )
    expect(res2.ok()).toBeTruthy()
    const body2 = await res2.json() as { items: Array<Record<string, unknown>> }
    // Our ship unit-leg is PENDING, not DEPARTED
    const ourShipDeparted = body2.items.filter(
      (i) => i.fileId === fileId && i.derivedStatus === 'DEPARTED'
    )
    expect(ourShipDeparted).toHaveLength(0)
  })

  test('should return units view with container data', async ({ page }) => {
    await login(page, 'superadmin')

    const res = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=50&view=units`,
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as {
      items: Array<Record<string, unknown>>
      total: number
      meta?: { maxLegs?: number }
    }

    expect(body.total).toBeGreaterThanOrEqual(1)

    // Find our unit
    const ourUnit = body.items.find((i) => i.containerNumber === 'SFTU0000001')
    if (ourUnit) {
      expect(ourUnit.containerType).toBe('40HC')
      // Should have dynamic leg columns (legType_1, legType_2, etc.)
      // At least legType_1 should be set since unit has 2 legs
      expect(ourUnit.legType_1).toBeDefined()
    }
  })

  test('should respect pagination in transport API', async ({ page }) => {
    await login(page, 'superadmin')

    // Request page 1 with limit=1
    const res = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=1`,
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { items: unknown[]; total: number; pageSize: number }
    expect(body.items.length).toBeLessThanOrEqual(1)
    if (body.total > 1) {
      expect(body.items).toHaveLength(1) // Only 1 item on page
    }
  })
})
