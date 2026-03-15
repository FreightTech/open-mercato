import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
  getTransportById,
} from './helpers'

/**
 * TC-TRANSPORT-008: Multi-field Inline Editing with API verification
 *
 * Verifies that editing multiple fields inline persists changes both in the UI
 * and via the GET /api/transports/:id API. Each field is edited by scrolling to
 * the target column header, finding the cell in the data row by column index,
 * double-clicking to enter edit mode, typing the new value, and pressing Tab.
 */
test.describe('TC-TRANSPORT-008: Multi-field Inline Editing', () => {
  let authToken: string = ''
  let projectId: string | null = null
  let containerId: string | null = null
  const timestamp = Date.now()
  const containerNumber = `MFEDIT${timestamp}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    const project = await createProjectFixture(request, authToken, {
      shipmentType: 'EXP',
      direction: 'export',
    })
    projectId = project?.id ?? null
    expect(projectId).toBeTruthy()

    const container = await createSeaContainerFixture(request, authToken, projectId!, {
      containerNumber,
      bookingNumber: `BK-ORIG-${timestamp}`,
      notes: 'Initial notes',
    })
    expect(container).toBeTruthy()
    containerId = container!.id
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  /**
   * Finds the column index for a given header title, scrolls into view,
   * then double-clicks the cell at that index in the target row.
   */
  async function editCellByHeader(
    page: any,
    request: any,
    columnTitle: string,
    newValue: string,
    apiField: string,
  ) {
    // 1. Scroll the header into view
    const headerSpan = page.locator(`th.hot-col-header span[title="${columnTitle}"]`)
    await headerSpan.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)

    // 2. Determine the column index by finding which th contains this header
    const headerTh = headerSpan.locator('xpath=ancestor::th')
    const allHeaders = page.locator('th.hot-col-header')
    const headerCount = await allHeaders.count()
    let colIndex = -1
    for (let i = 0; i < headerCount; i++) {
      const span = allHeaders.nth(i).locator(`span[title="${columnTitle}"]`)
      if (await span.count() > 0) {
        colIndex = i
        break
      }
    }
    expect(colIndex).toBeGreaterThanOrEqual(0)

    // 3. Find the data row containing our container
    const row = page.locator('tr').filter({ hasText: containerNumber }).first()
    await expect(row).toBeVisible({ timeout: 5_000 })

    // 4. Get cells and double-click the one at the column index
    const cells = row.locator('td.hot-cell')
    const targetCell = cells.nth(colIndex)
    await targetCell.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await targetCell.dblclick()

    // 5. Wait for editor
    const editor = page.locator('.hot-cell-editor').first()
    await expect(editor).toBeVisible({ timeout: 5_000 })

    // 6. Clear and type the new value
    await editor.fill(newValue)

    // 7. Tab to commit
    await editor.press('Tab')
    await page.waitForTimeout(2000)

    // 8. Verify the new value is visible in the UI
    await expect(page.getByText(newValue)).toBeVisible({ timeout: 5_000 })

    // 9. Verify via API
    const transport = await getTransportById(request, authToken, containerId!)
    expect(transport).toBeTruthy()
    const actual = String(transport![apiField] ?? '')
    expect(actual).toBe(newValue)
  }

  test('should edit booking number inline and verify via API', async ({ page, request }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByText(containerNumber)).toBeVisible({ timeout: 15_000 })

    const newBooking = `BK-EDITED-${timestamp}`
    await editCellByHeader(page, request, 'Booking', newBooking, 'bookingNumber')
  })

  test('should edit notes inline and verify via API', async ({ page, request }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByText(containerNumber)).toBeVisible({ timeout: 15_000 })

    await editCellByHeader(page, request, 'Notes', `Notes updated ${timestamp}`, 'notes')
  })

  test('should edit PIN code inline and verify via API', async ({ page, request }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByText(containerNumber)).toBeVisible({ timeout: 15_000 })

    await editCellByHeader(page, request, 'PIN', `P${timestamp}`, 'pinCode')
  })

  test('should edit HS code inline and verify via API', async ({ page, request }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByText(containerNumber)).toBeVisible({ timeout: 15_000 })

    await editCellByHeader(page, request, 'HS Code', '8471.30', 'hsCode')
  })

  test('should edit voyage number inline and verify via API', async ({ page, request }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByText(containerNumber)).toBeVisible({ timeout: 15_000 })

    await editCellByHeader(page, request, 'Voyage', `V${timestamp}`, 'voyageNumber')
  })
})
