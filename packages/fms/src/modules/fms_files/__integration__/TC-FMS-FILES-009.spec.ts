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

/**
 * TC-FMS-FILES-009: Cell Editing — FMS File Detail (Units tab)
 *
 * Tests every editable unit-level cell on the file detail page's Units sub-tab.
 * Leg-level cell editing is tested on the Transport page (TC-FMS-FILES-010)
 * where the DynamicTable selectors are more reliable.
 */
test.describe('TC-FMS-FILES-009: File Detail Units Tab Cells', () => {
  let contractorId: string
  let fileId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    contractorId = await ensureContractor(page.request)
    const file = await createFileFixture(page.request, contractorId)
    fileId = file.id
    const unit = await createUnitFixture(page.request, fileId, {
      containerNumber: 'CEDU0000001', containerType: '40HC',
    })
    const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'TRUCK' })
    await createUnitLegFixture(page.request, unit.id, leg.id)
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    await deleteFileIfExists(page.request, fileId)
    await deleteContractorIfExists(page.request, contractorId)
    await page.close()
  })

  async function gotoDetail(page: import('@playwright/test').Page) {
    await page.goto(`/backend/fms-files/${fileId}`)
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(2000)
  }

  async function findColumnIndex(page: import('@playwright/test').Page, title: string): Promise<number> {
    const headers = page.locator('th.hot-col-header')
    const count = await headers.count()
    for (let i = 0; i < count; i++) {
      const span = headers.nth(i).locator(`span[title="${title}"]`)
      if (await span.count() > 0) return i
    }
    return -1
  }

  async function tryEditCell(
    page: import('@playwright/test').Page,
    rowText: string,
    columnTitle: string,
    newValue: string,
  ): Promise<'edited' | 'readonly' | 'not_found'> {
    const colIndex = await findColumnIndex(page, columnTitle)
    if (colIndex < 0) return 'not_found'
    const row = page.locator('tr').filter({ hasText: rowText }).first()
    if (!await row.isVisible().catch(() => false)) return 'not_found'
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await cell.dblclick()
    const editor = page.locator('textarea.hot-cell-editor, input.hot-cell-editor, .hot-cell-editor').first()
    await page.waitForTimeout(500)
    if (!await editor.isVisible().catch(() => false)) return 'readonly'
    await editor.fill(newValue)
    await editor.press('Tab')
    await page.waitForTimeout(2000)
    return 'edited'
  }

  async function tryOpenEditor(
    page: import('@playwright/test').Page,
    rowText: string,
    columnTitle: string,
  ): Promise<'opened' | 'readonly' | 'not_found'> {
    const colIndex = await findColumnIndex(page, columnTitle)
    if (colIndex < 0) return 'not_found'
    const row = page.locator('tr').filter({ hasText: rowText }).first()
    if (!await row.isVisible().catch(() => false)) return 'not_found'
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await cell.dblclick()
    const editor = page.locator('.hot-cell-editor, [role="combobox"], input[placeholder*="Search"]').first()
    await page.waitForTimeout(500)
    const visible = await editor.isVisible().catch(() => false)
    if (visible) await page.keyboard.press('Escape')
    return visible ? 'opened' : 'readonly'
  }

  // ─── Editable unit cells ──────────────────────────────────────────────────

  test('edit: Container # (containerNumber)', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)
    expect(await tryEditCell(page, 'CEDU0000001', 'Container #', 'CEDU9999999')).toBe('edited')
  })

  test('edit: Type (containerType)', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)
    expect(await tryEditCell(page, 'CEDU9999999', 'Type', '20GP')).toBe('edited')
  })

  test('edit: Weight (grossWeight)', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)
    expect(await tryEditCell(page, 'CEDU9999999', 'Weight', '1500')).toBe('edited')
  })

  test('edit: Volume (volume)', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)
    expect(await tryEditCell(page, 'CEDU9999999', 'Volume', '33.5')).toBe('edited')
  })

  test('edit: Origin opens entity search editor', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)
    expect(await tryOpenEditor(page, 'CEDU9999999', 'Origin')).toBe('opened')
  })

  test('edit: Destination opens entity search editor', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)
    expect(await tryOpenEditor(page, 'CEDU9999999', 'Destination')).toBe('opened')
  })

  // ─── Context menu: change weight/volume unit via right-click ──────────────

  test('right-click Weight cell shows unit context menu and changes to "lb"', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)

    const colIndex = await findColumnIndex(page, 'Weight')
    expect(colIndex).toBeGreaterThanOrEqual(0)

    const row = page.locator('tr').filter({ hasText: 'CEDU9999999' }).first()
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)

    // Right-click to open context menu
    await cell.click({ button: 'right' })
    await page.waitForTimeout(500)

    // Context menu should appear with unit options
    const menu = page.locator('.context-menu').first()
    await expect(menu).toBeVisible({ timeout: 3000 })

    // Click "lb" option
    const lbItem = menu.locator('.context-menu-item').filter({ hasText: 'lb' })
    await expect(lbItem).toBeVisible()
    await lbItem.click()
    await page.waitForTimeout(2000)

    // Verify weight unit changed via API
    const detail = await getFileById(page.request, fileId!)
    const units = detail!.units as Array<Record<string, unknown>>
    const unit = units.find((u) => u.containerNumber === 'CEDU9999999')
    expect(unit).toBeDefined()
    expect(unit!.weightUnit).toBe('lb')
  })

  test('right-click Weight cell shows kg/lb/ton/mt options', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)

    const colIndex = await findColumnIndex(page, 'Weight')
    expect(colIndex).toBeGreaterThanOrEqual(0)

    const row = page.locator('tr').filter({ hasText: 'CEDU9999999' }).first()
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await cell.click({ button: 'right' })
    await page.waitForTimeout(500)

    const menu = page.locator('.context-menu').first()
    await expect(menu).toBeVisible({ timeout: 3000 })

    // Verify all 4 weight unit options exist
    for (const unit of ['kg', 'lb', 'ton', 'mt']) {
      await expect(menu.locator('.context-menu-item').filter({ hasText: unit })).toBeVisible()
    }

    await page.keyboard.press('Escape')
  })

  test('right-click Volume cell shows cbm/cft/liter options and changes to "cft"', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'superadmin')
    await gotoDetail(page)

    const colIndex = await findColumnIndex(page, 'Volume')
    expect(colIndex).toBeGreaterThanOrEqual(0)

    const row = page.locator('tr').filter({ hasText: 'CEDU9999999' }).first()
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await cell.click({ button: 'right' })
    await page.waitForTimeout(500)

    const menu = page.locator('.context-menu').first()
    await expect(menu).toBeVisible({ timeout: 3000 })

    // Verify all 3 volume unit options exist
    for (const unit of ['cbm', 'cft', 'liter']) {
      await expect(menu.locator('.context-menu-item').filter({ hasText: unit })).toBeVisible()
    }

    // Click "cft"
    await menu.locator('.context-menu-item').filter({ hasText: 'cft' }).click()
    await page.waitForTimeout(2000)

    // Verify volume unit changed
    const detail = await getFileById(page.request, fileId!)
    const units = detail!.units as Array<Record<string, unknown>>
    const unit = units.find((u) => u.containerNumber === 'CEDU9999999')
    expect(unit!.volumeUnit).toBe('cft')
  })
})
