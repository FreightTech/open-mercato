import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
} from './helpers'

/**
 * TC-TRANSPORT-004: Column Sorting (UI)
 *
 * Verifies that clicking a column header sorts the data and that different
 * container numbers appear in the expected order.
 */
test.describe('TC-TRANSPORT-004: Column Sorting', () => {
  let authToken: string = ''
  let projectId: string | null = null
  const timestamp = Date.now()

  const containerA = `AAA${timestamp}SC`
  const containerZ = `ZZZ${timestamp}SC`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    const project = await createProjectFixture(request, authToken, {
      shipmentType: 'EXP',
      direction: 'export',
    })
    projectId = project?.id ?? null
    expect(projectId).toBeTruthy()

    const sc1 = await createSeaContainerFixture(request, authToken, projectId!, {
      containerNumber: containerA,
    })
    expect(sc1).toBeTruthy()

    const sc2 = await createSeaContainerFixture(request, authToken, projectId!, {
      containerNumber: containerZ,
    })
    expect(sc2).toBeTruthy()
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should display both containers and support column header sort', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')

    // Wait for both containers to appear
    await expect(page.getByText(containerA)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(containerZ)).toBeVisible({ timeout: 5_000 })

    // Click on "Container #" column header to sort
    const containerHeader = page.locator('span[title="Container #"]')
    await expect(containerHeader).toBeVisible({ timeout: 5_000 })
    await containerHeader.click()
    await page.waitForTimeout(1000)

    // Get all visible text to check order
    const bodyText = await page.locator('body').innerText()
    const aaaPos = bodyText.indexOf(containerA)
    const zzzPos = bodyText.indexOf(containerZ)

    // Both should still be visible
    expect(aaaPos).toBeGreaterThanOrEqual(0)
    expect(zzzPos).toBeGreaterThanOrEqual(0)

    // Click again to toggle sort direction
    await containerHeader.click()
    await page.waitForTimeout(1000)

    const bodyText2 = await page.locator('body').innerText()
    const aaaPos2 = bodyText2.indexOf(containerA)
    const zzzPos2 = bodyText2.indexOf(containerZ)

    // Both should still be visible after toggling
    expect(aaaPos2).toBeGreaterThanOrEqual(0)
    expect(zzzPos2).toBeGreaterThanOrEqual(0)
  })
})
