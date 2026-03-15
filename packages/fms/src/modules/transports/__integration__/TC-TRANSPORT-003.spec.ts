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
 * TC-TRANSPORT-003: Inline Cell Editing
 *
 * Verifies that editing a cell in the DynamicTable persists the change
 * both in the UI and via the API.
 */
test.describe('TC-TRANSPORT-003: Inline Cell Editing', () => {
  let authToken: string = ''
  let projectId: string | null = null
  let containerId: string | null = null
  const timestamp = Date.now()
  const containerNumber = `EDIT${timestamp}01`

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
      notes: 'Original notes',
    })
    expect(container).toBeTruthy()
    containerId = container!.id
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should edit notes cell inline and persist via API', async ({ page, request }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')

    // Wait for our container to appear
    await expect(page.getByText(containerNumber)).toBeVisible({ timeout: 15_000 })

    // Find the row containing our container number
    const row = page.locator('tr, .hot-row').filter({ hasText: containerNumber })
    await expect(row).toBeVisible({ timeout: 5_000 })

    // Find the notes cell within the row — scroll to make it visible if needed
    // Notes column may be off-screen; we need to scroll the table horizontally
    const notesCell = row.locator('[data-col="notes"], td').filter({ hasText: 'Original notes' })

    // If notes cell is not immediately visible, try scrolling the table
    if (!(await notesCell.isVisible().catch(() => false))) {
      // Try to find any cell with "Original notes" text in the table
      const tableContainer = page.locator('.hot-table-container, .dynamic-table-wrapper').first()
      if (await tableContainer.isVisible().catch(() => false)) {
        await tableContainer.evaluate((el) => {
          el.scrollLeft = el.scrollWidth
        })
        await page.waitForTimeout(500)
      }
    }

    // Double-click the notes cell to enter edit mode
    const notesCellAny = row.getByText('Original notes').first()
    await notesCellAny.dblclick()

    // Wait for cell editor to appear
    const cellEditor = page.locator('textarea.hot-cell-editor, input.hot-cell-editor').first()
    await expect(cellEditor).toBeVisible({ timeout: 5_000 })

    // Clear and type new value
    await cellEditor.fill('Updated notes TC003')

    // Press Enter to commit the edit
    await cellEditor.press('Enter')
    await page.waitForTimeout(2000) // Allow save round-trip

    // Verify the UI shows the updated value
    await expect(page.getByText('Updated notes TC003')).toBeVisible({ timeout: 5_000 })

    // Verify via API that the change persisted
    const transport = await getTransportById(request, authToken, containerId!)
    expect(transport).toBeTruthy()
    expect(transport!.notes).toBe('Updated notes TC003')
  })
})
