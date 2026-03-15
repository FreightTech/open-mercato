import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
} from './helpers'

/**
 * TC-TRANSPORT-006: Column Visibility
 *
 * Verifies that the table renders correct column headers and that data
 * appears in the expected columns.
 */
test.describe('TC-TRANSPORT-006: Column Visibility', () => {
  let authToken: string = ''
  let projectId: string | null = null
  const timestamp = Date.now()
  const containerNumber = `COLS${timestamp}01`
  const bookingNumber = `BK-COLS-${timestamp}`

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
      bookingNumber,
    })
    expect(container).toBeTruthy()
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should display expected column headers and data in table', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')

    // Wait for data to load
    await expect(page.getByText(containerNumber)).toBeVisible({ timeout: 15_000 })

    // Verify key column headers are visible
    await expect(page.getByText('Container #')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Booking')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('B/L #')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Order #')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Type', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Direction')).toBeVisible({ timeout: 5_000 })

    // Verify the container number and booking number appear in the table
    await expect(page.getByText(containerNumber)).toBeVisible()
    await expect(page.getByText(bookingNumber)).toBeVisible()

    // Verify the container number is a clickable link (sea container opens drawer)
    const containerLink = page.locator('button').filter({ hasText: containerNumber })
    await expect(containerLink).toBeVisible({ timeout: 5_000 })

    // Verify the project number is a clickable link
    const projectLinks = page.locator('a[href*="/backend/fms-projects/"]')
    await expect(projectLinks.first()).toBeVisible({ timeout: 5_000 })
  })
})
