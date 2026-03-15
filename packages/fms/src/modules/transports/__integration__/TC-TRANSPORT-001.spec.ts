import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
} from './helpers'

/**
 * TC-TRANSPORT-001: Page Load & Data Display
 *
 * Verifies that the transports page loads correctly, displays the DynamicTable
 * with search input, and that created sea containers appear in the table.
 */
test.describe('TC-TRANSPORT-001: Page Load & Data Display', () => {
  let authToken: string = ''
  let projectId: string | null = null
  const timestamp = Date.now()

  const containerNumbers = [`TCNU${timestamp}01`, `TCNU${timestamp}02`]

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    const project = await createProjectFixture(request, authToken, {
      shipmentType: 'EXP',
      direction: 'export',
    })
    projectId = project?.id ?? null
    expect(projectId).toBeTruthy()

    for (const containerNumber of containerNumbers) {
      const container = await createSeaContainerFixture(request, authToken, projectId!, {
        containerNumber,
      })
      expect(container).toBeTruthy()
    }
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should display transports table with data', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')

    // Wait for table data to load — search for first container number
    await expect(page.getByText(containerNumbers[0])).toBeVisible({ timeout: 15_000 })

    // Verify both container numbers are visible in the table
    await expect(page.getByText(containerNumbers[1])).toBeVisible({ timeout: 5_000 })

    // Verify column headers are present
    await expect(page.getByText('Container #')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Booking')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Type', { exact: true })).toBeVisible({ timeout: 5_000 })

    // Verify the search input is present
    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible({ timeout: 5_000 })

    // Verify the perspective tab bar is present
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible({ timeout: 5_000 })
  })
})
