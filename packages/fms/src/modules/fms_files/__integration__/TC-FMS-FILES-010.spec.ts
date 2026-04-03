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
 * TC-FMS-FILES-010: Cell Editing — Transport Page (DynamicTable)
 *
 * Tests inline cell editing on the /backend/fms-files-transport page.
 * The transport page uses DynamicTable with legs view (ALL/TRUCK/SEA/RAIL/AIR tabs)
 * and units view (UNITS tab).
 *
 * Editable columns (legs view / table-config API):
 *   containerNumber, containerType, legOrigin, legDestination, carrierName,
 *   ptd, etd, atd, pta, eta, ata, truckPlate, trailerPlate, driverFullName,
 *   sealNumber, unitBl, consolidationContainer, bookingNumber, masterBl,
 *   vesselName, voyageNumber, cutoffs, demFreeTime, detFreeTime,
 *   grossWeight, volume, isHazardous, packageCount, notes
 *
 * Read-only columns:
 *   referenceNumber, derivedStatus, legSequence, legType, cargoType,
 *   shipmentType, contractorName, assigneeName
 */
test.describe('TC-FMS-FILES-010: Transport Page Cell Editing', () => {
  let contractorId: string
  let fileId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')

    contractorId = await ensureContractor(page.request)
    const file = await createFileFixture(page.request, contractorId)
    fileId = file.id

    const unit = await createUnitFixture(page.request, fileId, {
      containerNumber: 'TPED0000001', containerType: '40HC',
    })

    const truck = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
    const ship = await createLegFixture(page.request, fileId, { legSequence: 2, type: 'SHIP' })

    await createUnitLegFixture(page.request, unit.id, truck.id, { truckPlate: 'WA 10001' })
    await createUnitLegFixture(page.request, unit.id, ship.id)

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    await deleteFileIfExists(page.request, fileId)
    await deleteContractorIfExists(page.request, contractorId)
    await page.close()
  })

  function tabButton(page: import('@playwright/test').Page, label: string) {
    return page.getByRole('button', { name: label, exact: true }).first()
  }

  async function gotoTransport(page: import('@playwright/test').Page) {
    await page.goto('/backend/fms-files-transport')
    await expect(page.getByText('FMS Transport')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1500) // Let table data load
  }

  /**
   * Find a column index by its header title text.
   */
  async function findColumnIndex(page: import('@playwright/test').Page, title: string): Promise<number> {
    const headers = page.locator('th.hot-col-header')
    const count = await headers.count()
    for (let i = 0; i < count; i++) {
      const span = headers.nth(i).locator(`span[title="${title}"]`)
      if (await span.count() > 0) return i
    }
    return -1
  }

  /**
   * Edit a cell by finding the row (by text) and column (by header title).
   * Returns true if edit succeeded, false if cell was read-only.
   */
  async function editCellInRow(
    page: import('@playwright/test').Page,
    rowText: string,
    columnTitle: string,
    newValue: string,
  ): Promise<boolean> {
    const colIndex = await findColumnIndex(page, columnTitle)
    if (colIndex < 0) return false

    const row = page.locator('tr').filter({ hasText: rowText }).first()
    await expect(row).toBeVisible({ timeout: 5000 })

    const cells = row.locator('td.hot-cell')
    const cell = cells.nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await cell.dblclick()

    const editor = page.locator('textarea.hot-cell-editor, input.hot-cell-editor, .hot-cell-editor').first()
    const visible = await editor.isVisible().catch(() => false)
    if (!visible) {
      await page.waitForTimeout(500)
      const retryVisible = await editor.isVisible().catch(() => false)
      if (!retryVisible) return false // Read-only cell
    }

    await editor.fill(newValue)
    await editor.press('Tab')
    await page.waitForTimeout(2000)
    return true
  }

  /** Verify a cell's displayed text contains the expected value. */
  async function verifyCellText(
    page: import('@playwright/test').Page,
    rowText: string,
    columnTitle: string,
    expected: string,
  ) {
    const colIndex = await findColumnIndex(page, columnTitle)
    expect(colIndex).toBeGreaterThanOrEqual(0)
    const row = page.locator('tr').filter({ hasText: rowText }).first()
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await expect(cell).toContainText(expected, { timeout: 5000 })
  }

  // ─── Legs View (All tab) — Editable Cells ────────────────────────────────

  test('should edit truck plate on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)

    const edited = await editCellInRow(page, 'TPED0000001', 'Truck Plate', 'GD 55555')
    expect(edited).toBe(true)

    // Verify UI shows the new value
    await verifyCellText(page, 'TPED0000001', 'Truck Plate', 'GD 55555')

    // Verify API persisted
    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=100&legType=TRUCK`,
    )
    const body = await response.json() as { items: Array<Record<string, unknown>> }
    const row = body.items.find((i) => i.containerNumber === 'TPED0000001')
    expect(row?.truckPlate).toBe('GD 55555')
  })

  test('should edit driver name on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)

    const edited = await editCellInRow(page, 'TPED0000001', 'Driver', 'Jan Kowalski')
    expect(edited).toBe(true)

    await verifyCellText(page, 'TPED0000001', 'Driver', 'Jan Kowalski')

    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=100&legType=TRUCK`,
    )
    const body = await response.json() as { items: Array<Record<string, unknown>> }
    const row = body.items.find((i) => i.containerNumber === 'TPED0000001')
    expect(row?.driverFullName).toBe('Jan Kowalski')
  })

  test('should edit container type on All tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)

    const edited = await editCellInRow(page, 'TPED0000001', 'Cnt Type', '20GP')
    expect(edited).toBe(true)

    await verifyCellText(page, 'TPED0000001', 'Cnt Type', '20GP')

    const response = await page.request.fetch(
      `${BASE_URL}/api/fms_files/transport?page=1&limit=100`,
    )
    const body = await response.json() as { items: Array<Record<string, unknown>> }
    const row = body.items.find((i) => i.containerNumber === 'TPED0000001')
    if (row) {
      expect(row.containerType).toBe('20GP')
    }
  })

  test('should NOT edit read-only reference number', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)

    const edited = await editCellInRow(page, 'TPED0000001', 'Reference #', 'SHOULD_NOT_SAVE')
    expect(edited).toBe(false)
  })

  test('should NOT edit read-only status cell', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)

    const edited = await editCellInRow(page, 'TPED0000001', 'Status', 'ARRIVED')
    expect(edited).toBe(false)
  })

  test('should NOT edit read-only leg sequence', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)

    const edited = await editCellInRow(page, 'TPED0000001', 'Leg', '99')
    expect(edited).toBe(false)
  })

  // ─── More editable columns on All/Truck tab ────────────────────────────────

  test('should edit trailer plate on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'Trailer', 'TR 88888')).toBe(true)
    await verifyCellText(page, 'TPED0000001', 'Trailer', 'TR 88888')
  })

  test('should edit seal number on All tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'Seal #', 'SEAL123')).toBe(true)
    await verifyCellText(page, 'TPED0000001', 'Seal #', 'SEAL123')
  })

  test('should edit booking number on All tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'Booking #', 'BK-EDIT-002')).toBe(true)
    await verifyCellText(page, 'TPED0000001', 'Booking #', 'BK-EDIT-002')
  })

  test('should edit vessel name on Sea tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Sea').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'Vessel', 'MSC ANNA')).toBe(true)
    await verifyCellText(page, 'TPED0000001', 'Vessel', 'MSC ANNA')
  })

  test('should edit voyage number on Sea tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Sea').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'Voyage', '123W')).toBe(true)
    await verifyCellText(page, 'TPED0000001', 'Voyage', '123W')
  })

  // ─── Timestamp columns (datetime editor) ──────────────────────────────────

  test('should edit PTD on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'PTD', '2026-04-01 08:00')).toBe(true)
  })

  test('should edit ETD on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'ETD', '2026-04-02 10:00')).toBe(true)
  })

  test('should edit ATD on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'ATD', '2026-04-03 06:30')).toBe(true)
  })

  test('should edit PTA on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'PTA', '2026-04-04 14:00')).toBe(true)
  })

  test('should edit ETA on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'ETA', '2026-04-05 16:00')).toBe(true)
  })

  test('should edit ATA on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'ATA', '2026-04-06 09:00')).toBe(true)
  })

  // ─── Entity search editors (verify editor opens) ──────────────────────────

  test('should open Leg Origin editor on All tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)

    const colIndex = await findColumnIndex(page, 'Leg Origin')
    expect(colIndex).toBeGreaterThanOrEqual(0)
    const row = page.locator('tr').filter({ hasText: 'TPED0000001' }).first()
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await cell.dblclick()
    const editor = page.locator('.hot-cell-editor, [role="combobox"], input[placeholder*="Search"]').first()
    await page.waitForTimeout(500)
    expect(await editor.isVisible().catch(() => false)).toBe(true)
    await page.keyboard.press('Escape')
  })

  test('should open Leg Destination editor on All tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)

    const colIndex = await findColumnIndex(page, 'Leg Destination')
    expect(colIndex).toBeGreaterThanOrEqual(0)
    const row = page.locator('tr').filter({ hasText: 'TPED0000001' }).first()
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await cell.dblclick()
    const editor = page.locator('.hot-cell-editor, [role="combobox"], input[placeholder*="Search"]').first()
    await page.waitForTimeout(500)
    expect(await editor.isVisible().catch(() => false)).toBe(true)
    await page.keyboard.press('Escape')
  })

  test('should open Carrier editor on All tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'All').click()
    await page.waitForTimeout(1500)

    const colIndex = await findColumnIndex(page, 'Carrier')
    expect(colIndex).toBeGreaterThanOrEqual(0)
    const row = page.locator('tr').filter({ hasText: 'TPED0000001' }).first()
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await cell.dblclick()
    const editor = page.locator('.hot-cell-editor, [role="combobox"], input[placeholder*="Search"]').first()
    await page.waitForTimeout(500)
    expect(await editor.isVisible().catch(() => false)).toBe(true)
    await page.keyboard.press('Escape')
  })

  // ─── Units View — Editable Cells ──────────────────────────────────────────

  test('should edit container number on Units tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Units').click()
    await page.waitForTimeout(2000)

    const edited = await editCellInRow(page, 'TPED0000001', 'Container / Commodity', 'TPED0000099')
    expect(edited).toBe(true)
  })

  test('should NOT edit read-only client on Units tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Units').click()
    await page.waitForTimeout(2000)

    const edited = await editCellInRow(page, 'TPED0000099', 'Client', 'FAKE CLIENT')
    expect(edited).toBe(false)
  })

  // ─── NOT editable read-only on All tab ────────────────────────────────────

  test('should NOT edit read-only Mode on Truck tab', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoTransport(page)
    await tabButton(page, 'Truck').click()
    await page.waitForTimeout(1500)
    expect(await editCellInRow(page, 'TPED0000001', 'Mode', 'SHIP')).toBe(false)
  })
})
