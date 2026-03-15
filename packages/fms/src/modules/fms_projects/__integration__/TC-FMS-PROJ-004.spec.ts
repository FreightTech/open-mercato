import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
} from './helpers'

/**
 * TC-FMS-PROJ-004: Activity Panel — Comments, Filters, and Change Log
 *
 * Verifies the activity panel on the project detail page:
 *  1. Post a text comment and verify it appears in the feed
 *  2. Post a second comment via Cmd+Enter and verify feed order (newest first)
 *  3. Edit a field and verify the change appears under "Changes" filter
 *  4. Filter tabs work: "Comments" / "Changes" / "All"
 */
test.describe('TC-FMS-PROJ-004: Activity Panel', () => {
  let authToken: string | null = null
  let projectId: string | null = null
  const timestamp = Date.now()

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')

    const project = await createProjectFixture(request, authToken, {
      cargoType: 'fcl',
      direction: 'export',
      shipmentType: 'EXP',
    })
    expect(project).toBeTruthy()
    projectId = project!.id
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should post comments, verify feed, and test filter tabs', async ({ page }) => {
    test.setTimeout(120_000)

    await login(page, 'admin')
    await page.goto(`/backend/fms-projects/${projectId}`)
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    // ---- Verify activity panel structure ----
    await expect(page.getByText('Activity')).toBeVisible({ timeout: 5_000 })
    const commentInput = page.getByPlaceholder('Write a comment... (type @ to mention)')
    await expect(commentInput).toBeVisible({ timeout: 5_000 })
    const postButton = page.getByRole('button', { name: 'Post' })
    await expect(postButton).toBeDisabled()

    // ---- Post first comment ----
    const comment1 = `First comment ${timestamp}`
    await commentInput.fill(comment1)
    await expect(postButton).toBeEnabled()

    const postPromise1 = page.waitForResponse(
      (resp) => resp.url().includes('/notes') && resp.request().method() === 'POST',
      { timeout: 10_000 }
    )
    await postButton.click()
    const postResp1 = await postPromise1
    expect(postResp1.status()).toBe(201)

    // Comment should appear in the feed
    await expect(page.getByText(comment1)).toBeVisible({ timeout: 15_000 })

    // Input should be cleared
    await expect(commentInput).toHaveValue('')

    // ---- Post second comment via Cmd+Enter ----
    const comment2 = `Second comment ${timestamp}`
    await commentInput.fill(comment2)

    const postPromise2 = page.waitForResponse(
      (resp) => resp.url().includes('/notes') && resp.request().method() === 'POST',
      { timeout: 10_000 }
    )
    await commentInput.press('Meta+Enter')
    const postResp2 = await postPromise2
    expect(postResp2.status()).toBe(201)

    // Second comment should appear
    await expect(page.getByText(comment2)).toBeVisible({ timeout: 15_000 })

    // Verify order: newest (comment2) should appear before oldest (comment1)
    const feedContainer = page.locator('.flex-1.overflow-auto').first()
    const feedText = await feedContainer.innerText()
    const idx1 = feedText.indexOf(comment1)
    const idx2 = feedText.indexOf(comment2)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeLessThan(idx1) // newest first

    // ---- Edit booking number to create a field_change entry ----
    const bookingNum = `ACT-BK-${timestamp}`
    await page.getByText('Enter booking #').click()
    const bookingInput = page.locator('input[placeholder="Enter booking #"]')
    await expect(bookingInput).toBeVisible({ timeout: 3_000 })

    const savePutPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/fms_projects/projects/${projectId}`) &&
        resp.request().method() === 'PUT',
      { timeout: 10_000 }
    )
    await bookingInput.fill(bookingNum)
    await bookingInput.press('Enter')
    await savePutPromise

    // Wait for ActionLog to be written + activity feed refresh
    await page.waitForTimeout(3000)

    // ---- Test "Changes" filter tab ----
    const changesTab = page.getByText('Changes', { exact: true })
    await changesTab.click()
    await page.waitForTimeout(2000)

    // Field change for booking number should be visible
    await expect(page.getByText('Booking Number').first()).toBeVisible({ timeout: 10_000 })

    // Comments should NOT be visible under Changes filter
    await expect(page.getByText(comment1)).toBeHidden({ timeout: 3_000 })
    await expect(page.getByText(comment2)).toBeHidden({ timeout: 3_000 })

    // ---- Test "Comments" filter tab ----
    const commentsTab = page.getByText('Comments', { exact: true })
    await commentsTab.click()
    await page.waitForTimeout(2000)

    // Both comments should be visible
    await expect(page.getByText(comment1)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(comment2)).toBeVisible({ timeout: 5_000 })

    // Field change should NOT be visible under Comments filter
    await expect(page.getByText('Booking Number').first()).toBeHidden({ timeout: 3_000 })

    // ---- Test "All" filter tab ----
    const allTab = page.getByText('All', { exact: true }).first()
    await allTab.click()
    await page.waitForTimeout(2000)

    // Everything should be visible
    await expect(page.getByText(comment1)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(comment2)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Booking Number').first()).toBeVisible({ timeout: 5_000 })
  })
})
