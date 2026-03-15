import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
} from './helpers'

/**
 * TC-TRANSPORT-002: Search Functionality
 *
 * Verifies that the search input filters transports by container number and booking number,
 * and that clearing the search restores all results.
 */
test.describe('TC-TRANSPORT-002: Search Functionality', () => {
  let authToken: string = ''
  let projectId: string | null = null
  const timestamp = Date.now()

  const seaContainer1 = { containerNumber: `SRCH${timestamp}A`, bookingNumber: `BK-SRCH-${timestamp}-1` }
  const seaContainer2 = { containerNumber: `SRCH${timestamp}B`, bookingNumber: `BK-SRCH-${timestamp}-2` }

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    const project = await createProjectFixture(request, authToken, {
      shipmentType: 'EXP',
      direction: 'export',
    })
    projectId = project?.id ?? null
    expect(projectId).toBeTruthy()

    const sc1 = await createSeaContainerFixture(request, authToken, projectId!, seaContainer1)
    expect(sc1).toBeTruthy()

    const sc2 = await createSeaContainerFixture(request, authToken, projectId!, seaContainer2)
    expect(sc2).toBeTruthy()
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should search by container number and booking number', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')

    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    // Wait for both items to load
    await expect(page.getByText(seaContainer1.containerNumber)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(seaContainer2.containerNumber)).toBeVisible({ timeout: 5_000 })

    // Search by first container number — only first sea container should be visible
    await searchInput.fill(seaContainer1.containerNumber)
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)

    await expect(page.getByText(seaContainer1.containerNumber)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(seaContainer2.containerNumber)).toBeHidden()

    // Clear search and verify all items reappear
    await searchInput.clear()
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)

    await expect(page.getByText(seaContainer1.containerNumber)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(seaContainer2.containerNumber)).toBeVisible({ timeout: 5_000 })

    // Search by booking number — only first container's booking should match
    await searchInput.fill(seaContainer1.bookingNumber)
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)

    await expect(page.getByText(seaContainer1.containerNumber)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(seaContainer2.containerNumber)).toBeHidden()

    // Clear search — all should reappear
    await searchInput.clear()
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)

    await expect(page.getByText(seaContainer1.containerNumber)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(seaContainer2.containerNumber)).toBeVisible({ timeout: 5_000 })
  })
})
