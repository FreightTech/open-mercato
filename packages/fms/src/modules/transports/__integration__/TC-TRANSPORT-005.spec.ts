import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
} from './helpers'

/**
 * TC-TRANSPORT-005: Search Filter (UI)
 *
 * Verifies that the search input filters transports by partial container number
 * and that clearing the search restores all results. Uses unique prefixes
 * to ensure test isolation.
 */
test.describe('TC-TRANSPORT-005: Search Filter', () => {
  let authToken: string = ''
  let projectId: string | null = null
  const timestamp = Date.now()

  const container1 = `FILT${timestamp}A`
  const container2 = `FILT${timestamp}B`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    const project = await createProjectFixture(request, authToken, {
      shipmentType: 'EXP',
      direction: 'export',
    })
    projectId = project?.id ?? null
    expect(projectId).toBeTruthy()

    const sc1 = await createSeaContainerFixture(request, authToken, projectId!, {
      containerNumber: container1,
    })
    expect(sc1).toBeTruthy()

    const sc2 = await createSeaContainerFixture(request, authToken, projectId!, {
      containerNumber: container2,
    })
    expect(sc2).toBeTruthy()
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should filter by partial container number and clear', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')

    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    // Wait for both items to load
    await expect(page.getByText(container1)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(container2)).toBeVisible({ timeout: 5_000 })

    // Search for container1 specifically
    await searchInput.fill(container1)
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)

    await expect(page.getByText(container1)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(container2)).toBeHidden()

    // Search for container2 specifically
    await searchInput.clear()
    await searchInput.fill(container2)
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)

    await expect(page.getByText(container2)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(container1)).toBeHidden()

    // Clear — both should reappear
    await searchInput.clear()
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)

    await expect(page.getByText(container1)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(container2)).toBeVisible({ timeout: 5_000 })
  })
})
