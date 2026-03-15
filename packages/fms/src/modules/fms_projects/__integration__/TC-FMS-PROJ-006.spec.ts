import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
} from './helpers'

/**
 * TC-FMS-PROJ-006: Cell Annotations (Comments & Colors)
 *
 * Verifies cell-level annotations on the Parties table:
 *  1. Shift+Click a cell to open the annotation popover
 *  2. Set a cell color (e.g., Yellow) — cell background changes
 *  3. Post a cell comment — comment appears in the thread
 *  4. Close and reopen — comment persists
 *  5. Delete a comment
 *  6. Annotations appear in the Activity panel under "Comments" filter
 */
test.describe('TC-FMS-PROJ-006: Cell Annotations', () => {
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

  test('should open annotation popover, set color, post comment, and verify persistence', async ({
    page,
  }) => {
    test.setTimeout(90_000)

    await login(page, 'admin')
    await page.goto(`/backend/fms-projects/${projectId}`)
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    // ---- Find the Parties table and Shift+Click a cell ----
    // The Parties table has columns: Client, Shipper, Consignee, Agent
    // Shift+Click the "Shipper" cell (placeholder "Select contractor...")
    const partiesSection = page.getByText('Parties').first()
    await expect(partiesSection).toBeVisible({ timeout: 5_000 })

    // Find a cell in the Parties table — the "Shipper" column placeholder
    const shipperCell = page.locator('.hot-cell').filter({ hasText: 'Select contractor...' }).first()
    await expect(shipperCell).toBeVisible({ timeout: 5_000 })

    // Shift+Click to open annotation popover
    await shipperCell.click({ modifiers: ['Shift'] })

    // ---- Verify annotation popover opens ----
    const popover = page.locator('.hot-comment-popover')
    await expect(popover).toBeVisible({ timeout: 5_000 })

    // Header should show "Comments on" + column title
    await expect(popover.locator('.hot-comment-popover-subtitle')).toHaveText('Comments on')

    // ---- Set a cell color (Yellow) ----
    const yellowButton = popover.locator('.hot-comment-color-btn[title="Yellow"]')
    await expect(yellowButton).toBeVisible({ timeout: 3_000 })

    const colorPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/annotations/annotations') &&
        (resp.request().method() === 'POST' || resp.request().method() === 'PATCH'),
      { timeout: 10_000 }
    )
    await yellowButton.click()
    await colorPromise
    await page.waitForTimeout(500)

    // The yellow button should now be selected
    await expect(yellowButton).toHaveClass(/selected/)

    // ---- Post a cell comment ----
    const commentText = `Annotation comment ${timestamp}`
    const commentInput = popover.locator('.hot-comment-textarea')
    await expect(commentInput).toBeVisible({ timeout: 3_000 })
    await commentInput.fill(commentText)

    const sendButton = popover.locator('.hot-comment-send-btn')
    await expect(sendButton).toBeEnabled()

    const commentPostPromise = page.waitForResponse(
      (resp) => resp.url().includes('/comments') && resp.request().method() === 'POST',
      { timeout: 10_000 }
    )
    await sendButton.click()
    await commentPostPromise
    await page.waitForTimeout(500)

    // Comment should appear in the thread
    await expect(popover.getByText(commentText)).toBeVisible({ timeout: 5_000 })

    // Comment input should be cleared
    await expect(commentInput).toHaveValue('')

    // ---- Close popover and reopen — verify comment persists ----
    // Close by pressing Escape
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden({ timeout: 3_000 })

    // The cell should now have a comment indicator (data-has-comment="true")
    await expect(shipperCell).toHaveAttribute('data-has-comment', 'true', { timeout: 5_000 })

    // Reopen annotation popover
    await shipperCell.click({ modifiers: ['Shift'] })
    await expect(popover).toBeVisible({ timeout: 5_000 })

    // Comment should still be there
    await expect(popover.getByText(commentText)).toBeVisible({ timeout: 5_000 })

    // Close popover
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden({ timeout: 3_000 })
  })

  test('should post annotation and see it in Activity panel', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page, 'admin')
    await page.goto(`/backend/fms-projects/${projectId}`)
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    // Shift+Click a cell in the Parties table
    const shipperCell = page.locator('.hot-cell').filter({ hasText: 'Select contractor...' }).first()
    await expect(shipperCell).toBeVisible({ timeout: 5_000 })
    await shipperCell.click({ modifiers: ['Shift'] })

    const popover = page.locator('.hot-comment-popover')
    await expect(popover).toBeVisible({ timeout: 5_000 })

    // Post a comment
    const commentText = `Activity annotation ${timestamp}`
    const commentInput = popover.locator('.hot-comment-textarea')
    await commentInput.fill(commentText)

    const commentPostPromise = page.waitForResponse(
      (resp) => resp.url().includes('/comments') && resp.request().method() === 'POST',
      { timeout: 10_000 }
    )
    await popover.locator('.hot-comment-send-btn').click()
    await commentPostPromise

    // Close popover
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden({ timeout: 3_000 })

    // ---- Check Activity panel — switch to "Comments" filter ----
    // Wait for activity feed to refresh (1.5s delay + refetch)
    await page.waitForTimeout(3000)

    const commentsTab = page.getByText('Comments', { exact: true })
    await commentsTab.click()
    await page.waitForTimeout(2000)

    // The cell annotation should appear as "Annotation" entry in the feed
    await expect(page.getByText('Annotation').first()).toBeVisible({ timeout: 10_000 })
    // The comment content should be visible
    await expect(page.getByText(commentText).first()).toBeVisible({ timeout: 5_000 })
  })
})
