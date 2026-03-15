import { test, expect } from '@playwright/test'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
} from './helpers'

/**
 * TC-FMS-PROJ-005: Activity — File Attachments and @Mentions
 *
 * Verifies:
 *  1. Attaching a file to a comment — file preview shows, Post sends multipart
 *  2. Removing an attached file before posting
 *  3. Posting a comment with a file — comment + attachment appear in feed
 *  4. @mention popup — type @ to trigger, search users, select a user
 *  5. Posting a comment with @mention — mention is rendered in the feed
 */
test.describe('TC-FMS-PROJ-005: File Attachments & @Mentions', () => {
  let authToken: string | null = null
  let projectId: string | null = null
  const timestamp = Date.now()
  let tempFilePath: string | null = null

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')

    const project = await createProjectFixture(request, authToken, {
      cargoType: 'fcl',
      direction: 'export',
      shipmentType: 'EXP',
    })
    expect(project).toBeTruthy()
    projectId = project!.id

    // Create a small temp file for attachment testing
    tempFilePath = join(tmpdir(), `test-attachment-${timestamp}.txt`)
    writeFileSync(tempFilePath, `Test file content ${timestamp}`)
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
    if (tempFilePath) {
      try { unlinkSync(tempFilePath) } catch { /* ignore */ }
    }
  })

  test('should attach a file, see preview, remove it, re-attach, then post', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page, 'admin')
    await page.goto(`/backend/fms-projects/${projectId}`)
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    const commentInput = page.getByPlaceholder('Write a comment... (type @ to mention)')
    await expect(commentInput).toBeVisible({ timeout: 5_000 })

    // ---- Attach a file ----
    const attachButton = page.getByRole('button', { name: 'Attach' })
    await expect(attachButton).toBeVisible()

    // The "Attach" button triggers a hidden file input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(tempFilePath!)

    // File preview should appear with filename
    const fileName = `test-attachment-${timestamp}.txt`
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 3_000 })

    // Post button should be enabled (file alone is enough)
    const postButton = page.getByRole('button', { name: 'Post' })
    await expect(postButton).toBeEnabled()

    // ---- Remove the file ----
    // The remove button is an X icon next to the file preview
    const removeFileButton = page.locator('button').filter({
      has: page.locator('svg.lucide-x'),
    }).first()
    await removeFileButton.click()

    // File preview should disappear
    await expect(page.getByText(fileName)).toBeHidden({ timeout: 3_000 })

    // Post button should be disabled again (no text and no file)
    await expect(postButton).toBeDisabled()

    // ---- Re-attach and post with text + file ----
    await fileInput.setInputFiles(tempFilePath!)
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 3_000 })

    const commentText = `Comment with file ${timestamp}`
    await commentInput.fill(commentText)

    const postPromise = page.waitForResponse(
      (resp) => resp.url().includes('/notes') && resp.request().method() === 'POST',
      { timeout: 10_000 }
    )
    await postButton.click()
    const postResp = await postPromise
    expect(postResp.status()).toBe(201)

    // Comment should appear in the feed
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 15_000 })

    // File attachment indicator should show in the feed entry
    // (the ActivityItem renders attachment info — filename link)
    await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 5_000 })
  })

  test('should trigger @mention popup, select a user, and post', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page, 'admin')
    await page.goto(`/backend/fms-projects/${projectId}`)
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    const commentInput = page.getByPlaceholder('Write a comment... (type @ to mention)')
    await expect(commentInput).toBeVisible({ timeout: 5_000 })

    // ---- Type @ to trigger mention popup ----
    // Type "Hello " first, then "@" to trigger the popup with empty query (returns all users)
    await commentInput.fill('Hello ')
    await commentInput.pressSequentially('@')

    // The mention popup should appear
    const mentionPopup = page.locator('.hot-mention-popup')
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 })

    // Wait for real user results (avatar element means it's a user, not a status message)
    const realUserItem = mentionPopup.locator('.hot-mention-popup-avatar')
    await expect(realUserItem.first()).toBeVisible({ timeout: 10_000 })

    // ---- Select the first user by clicking ----
    await mentionPopup.locator('.hot-mention-popup-item').first().click()

    // Mention popup should close
    await expect(mentionPopup).toBeHidden({ timeout: 3_000 })

    // The textarea should contain the @mention
    const inputValue = await commentInput.inputValue()
    expect(inputValue).toContain('@')

    // ---- Post the comment with mention ----
    const postPromise = page.waitForResponse(
      (resp) => resp.url().includes('/notes') && resp.request().method() === 'POST',
      { timeout: 10_000 }
    )
    await commentInput.press('Meta+Enter')
    const postResp = await postPromise
    expect(postResp.status()).toBe(201)

    // The comment should appear in the feed with the mention text
    // The mention renders as @UserName in the activity entry
    await expect(page.getByText(/Hello @/).first()).toBeVisible({ timeout: 15_000 })
  })

  test('should select @mention via keyboard (Enter)', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page, 'admin')
    await page.goto(`/backend/fms-projects/${projectId}`)
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    const commentInput = page.getByPlaceholder('Write a comment... (type @ to mention)')
    await expect(commentInput).toBeVisible({ timeout: 5_000 })

    // Type @ to open mention popup
    await commentInput.pressSequentially('CC @')

    const mentionPopup = page.locator('.hot-mention-popup')
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 })

    // Wait for user results
    await expect(
      mentionPopup.locator('.hot-mention-popup-item').first()
    ).toBeVisible({ timeout: 5_000 })

    // Press Enter to select the highlighted (first) user
    await page.keyboard.press('Enter')

    // Popup should close
    await expect(mentionPopup).toBeHidden({ timeout: 3_000 })

    // Textarea should contain the mention
    const inputValue = await commentInput.inputValue()
    expect(inputValue).toContain('@')

    // Add more text after the mention and post
    await commentInput.pressSequentially(' please review')

    const postPromise = page.waitForResponse(
      (resp) => resp.url().includes('/notes') && resp.request().method() === 'POST',
      { timeout: 10_000 }
    )
    await commentInput.press('Meta+Enter')
    const postResp = await postPromise
    expect(postResp.status()).toBe(201)

    // Should appear in feed
    await expect(page.getByText(/CC @/).first()).toBeVisible({ timeout: 15_000 })
  })
})
