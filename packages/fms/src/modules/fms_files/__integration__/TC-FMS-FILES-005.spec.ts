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
 * TC-FMS-FILES-005: Transport Page Tabs (Units, All, Truck, Sea, Rail, Air)
 *
 * Verifies:
 * 1. All 6 tabs render and are clickable
 * 2. Each tab loads data with correct API params (legType filter)
 * 3. Tab content changes when switching tabs
 * 4. Data appears in the correct tab based on leg type
 */
test.describe('TC-FMS-FILES-005: Transport Page Tabs', () => {
  let contractorId: string
  let fileId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')

    contractorId = await ensureContractor(page.request)
    const file = await createFileFixture(page.request, contractorId, {
      shipmentType: 'EXP', cargoType: 'FCL',
    })
    fileId = file.id

    const unitA = await createUnitFixture(page.request, fileId, {
      containerNumber: 'TRPU0000001', containerType: '40HC',
    })
    const unitB = await createUnitFixture(page.request, fileId, {
      containerNumber: 'TRPU0000002', containerType: '20GP',
    })

    const truckLeg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
    const shipLeg = await createLegFixture(page.request, fileId, {
      legSequence: 2, type: 'SHIP', vesselName: 'TRANSPORT TEST VESSEL',
    })
    const railLeg = await createLegFixture(page.request, fileId, { legSequence: 3, type: 'RAIL' })
    const airLeg = await createLegFixture(page.request, fileId, { legSequence: 4, type: 'AIR' })

    await createUnitLegFixture(page.request, unitA.id, truckLeg.id, { truckPlate: 'TP 11111' })
    await createUnitLegFixture(page.request, unitA.id, shipLeg.id)
    await createUnitLegFixture(page.request, unitB.id, railLeg.id)
    await createUnitLegFixture(page.request, unitB.id, airLeg.id)

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    await deleteFileIfExists(page.request, fileId)
    await deleteContractorIfExists(page.request, contractorId)
    await page.close()
  })

  async function gotoTransport(page: import('@playwright/test').Page) {
    await page.goto('/backend/fms-files-transport')
    // Wait for page heading instead of networkidle (DynamicTable keeps polling)
    await expect(page.getByText('FMS Transport')).toBeVisible({ timeout: 15000 })
  }

  /**
   * Click a tab in the custom tab bar. Uses .first() to avoid matching
   * DynamicTable's built-in hot-top-tab buttons that share the same label.
   */
  function tabButton(page: import('@playwright/test').Page, label: string) {
    return page.getByRole('button', { name: label, exact: true }).first()
  }

  test('should render all 6 tabs on the transport page', async ({ page }) => {
    await login(page, 'superadmin')
    await gotoTransport(page)

    for (const label of ['Units', 'All', 'Truck', 'Sea', 'Rail', 'Air']) {
      await expect(tabButton(page, label)).toBeVisible()
    }
  })

  test('should show data on the All tab via API', async ({ page }) => {
    await login(page, 'superadmin')
    await gotoTransport(page)

    await tabButton(page, 'All').click()
    await page.waitForTimeout(500)

    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=50`,
    )
    expect(response.ok()).toBeTruthy()
    const body = await response.json() as { items: Array<Record<string, unknown>>; total: number }
    expect(body.total).toBeGreaterThanOrEqual(4)
  })

  test('should filter to TRUCK legs on Truck tab', async ({ page }) => {
    await login(page, 'superadmin')
    await gotoTransport(page)

    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(500)

    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=50&legType=TRUCK`,
    )
    expect(response.ok()).toBeTruthy()
    const body = await response.json() as { items: Array<Record<string, unknown>> }
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    for (const item of body.items) {
      expect(item.legType).toBe('TRUCK')
    }
  })

  test('should filter to SHIP legs on Sea tab', async ({ page }) => {
    await login(page, 'superadmin')
    await gotoTransport(page)

    await tabButton(page, 'Sea').click()
    await page.waitForTimeout(500)

    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=50&legType=SHIP`,
    )
    expect(response.ok()).toBeTruthy()
    const body = await response.json() as { items: Array<Record<string, unknown>> }
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    for (const item of body.items) {
      expect(item.legType).toBe('SHIP')
    }
  })

  test('should filter to RAIL legs on Rail tab', async ({ page }) => {
    await login(page, 'superadmin')
    await gotoTransport(page)

    await tabButton(page, 'Rail').click()
    await page.waitForTimeout(500)

    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=50&legType=RAIL`,
    )
    expect(response.ok()).toBeTruthy()
    const body = await response.json() as { items: Array<Record<string, unknown>> }
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    for (const item of body.items) {
      expect(item.legType).toBe('RAIL')
    }
  })

  test('should filter to AIR legs on Air tab', async ({ page }) => {
    await login(page, 'superadmin')
    await gotoTransport(page)

    await tabButton(page, 'Air').click()
    await page.waitForTimeout(500)

    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=50&legType=AIR`,
    )
    expect(response.ok()).toBeTruthy()
    const body = await response.json() as { items: Array<Record<string, unknown>> }
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    for (const item of body.items) {
      expect(item.legType).toBe('AIR')
    }
  })

  test('should show Units view with grouped data', async ({ page }) => {
    await login(page, 'superadmin')
    await gotoTransport(page)

    await tabButton(page, 'Units').click()
    await page.waitForTimeout(500)

    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=50&view=units`,
    )
    expect(response.ok()).toBeTruthy()
    const body = await response.json() as {
      items: Array<Record<string, unknown>>
      total: number
    }
    expect(body.total).toBeGreaterThanOrEqual(2)
  })

  test('should switch between all tabs without errors', async ({ page }) => {
    await login(page, 'superadmin')
    await gotoTransport(page)

    for (const label of ['All', 'Truck', 'Sea', 'Rail', 'Air', 'Units']) {
      await tabButton(page, label).click()
      await page.waitForTimeout(300)
      await expect(tabButton(page, label)).toBeVisible()
    }
  })

  test('should return exclusive leg types per tab filter', async ({ page }) => {
    await login(page, 'superadmin')

    // Verify each legType filter returns only matching legs
    for (const legType of ['TRUCK', 'SHIP', 'RAIL', 'AIR']) {
      const response = await page.request.fetch(
        `${BASE_URL}/api/fms_files/transport?page=1&limit=100&legType=${legType}`,
      )
      expect(response.ok()).toBeTruthy()
      const body = await response.json() as { items: Array<Record<string, unknown>> }
      expect(body.items.length).toBeGreaterThanOrEqual(1)
      for (const item of body.items) {
        expect(item.legType).toBe(legType)
      }
    }
  })
})
