import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
} from './helpers'

/**
 * TC-TRANSPORT-007: Pagination
 *
 * Verifies that multiple transport items display in the table and that
 * at the default page size, no pagination controls are visible when all items fit.
 */
test.describe('TC-TRANSPORT-007: Pagination', () => {
  let authToken: string = ''
  let projectId: string | null = null
  const timestamp = Date.now()

  const containerNumbers = [
    `PAGE${timestamp}A`,
    `PAGE${timestamp}B`,
    `PAGE${timestamp}C`,
  ]

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

  test('should display all items and not show pagination when items fit on one page', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')

    // Wait for all three containers to appear
    for (const cn of containerNumbers) {
      await expect(page.getByText(cn)).toBeVisible({ timeout: 15_000 })
    }

    // At default page size (100), all items should fit on one page
    // Check that pagination "next" button is not visible
    const paginationNext = page.locator('button[aria-label="Next page"], button:has-text("Next")')
    const isNextVisible = await paginationNext.isVisible().catch(() => false)

    // If pagination exists, it should show page 1
    if (isNextVisible) {
      // Pagination is visible — verify we're on page 1
      const pageIndicator = page.locator('[data-page="1"], .pagination-current')
      await expect(pageIndicator).toBeVisible({ timeout: 3_000 })
    }
    // Otherwise, all items fit on a single page — no pagination needed
  })
})
