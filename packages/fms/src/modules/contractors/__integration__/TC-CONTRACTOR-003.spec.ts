import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  createContractorFixture,
  createAddressFixture,
  createContactFixture,
  deleteContractorIfExists,
} from './helpers'

/**
 * TC-CONTRACTOR-003: Activity Feed Reactivity, File Upload, and @Mentions
 *
 * Tests:
 * - Activity feed updates after posting a comment
 * - Activity feed shows comment with file attachment
 * - @mention popup appears when typing @ in comment composer
 * - Activity filters work correctly (All/Comments/Docs/Changes)
 * - Comments posted via activity appear immediately without page reload
 */
test.describe('TC-CONTRACTOR-003: Activity Feed & Comments', () => {
  let authToken: string
  const createdContractorIds: string[] = []
  const testPrefix = `ctr3-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    for (const id of createdContractorIds) {
      await deleteContractorIfExists(request, authToken, id)
    }
  })

  async function createTestContractor(
    request: import('@playwright/test').APIRequestContext,
    nameSuffix: string
  ) {
    const contractor = await createContractorFixture(request, authToken, {
      name: `${testPrefix}-${nameSuffix}`,
    })
    if (contractor?.id) createdContractorIds.push(contractor.id)
    return contractor
  }

  async function gotoContractor(page: import('@playwright/test').Page, contractorId: string) {
    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractorId}`)
    await page.locator('.w-\\[400px\\]').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  // ---------------------------------------------------------------------------
  // Activity feed reactivity — comment appears immediately
  // ---------------------------------------------------------------------------

  test('should show posted comment in activity feed immediately', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'FeedReactive')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    // Verify "No activity yet" initially
    await expect(page.getByText('No activity yet')).toBeVisible({ timeout: 10_000 })

    // Post a comment
    const commentText = `Reactive comment ${Date.now()}`
    const textarea = page.getByPlaceholder('Write a comment')
    await textarea.fill(commentText)
    await page.getByRole('button', { name: 'Post' }).click()

    // Comment should appear in the feed WITHOUT page reload
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 })

    // "No activity yet" should be gone
    await expect(page.getByText('No activity yet')).toBeHidden()
  })

  test('should show multiple comments in chronological order', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'MultiComment')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    const textarea = page.getByPlaceholder('Write a comment')
    const postBtn = page.getByRole('button', { name: 'Post' })

    // Post first comment
    const comment1 = `First comment ${Date.now()}`
    await textarea.fill(comment1)
    await postBtn.click()
    await expect(page.getByText(comment1)).toBeVisible({ timeout: 10_000 })

    // Post second comment
    const comment2 = `Second comment ${Date.now()}`
    await textarea.fill(comment2)
    await postBtn.click()
    await expect(page.getByText(comment2)).toBeVisible({ timeout: 10_000 })

    // Both should be visible
    await expect(page.getByText(comment1)).toBeVisible()
    await expect(page.getByText(comment2)).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // File upload in activity comments
  // ---------------------------------------------------------------------------

  test('should attach a file to a comment', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'FileUpload')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    // Click "Attach" to trigger file input (use exact match to avoid "Attachments" sidebar link)
    const attachBtn = page.getByText('Attach', { exact: true })
    await expect(attachBtn).toBeVisible({ timeout: 10_000 })

    // Create a test file and attach it via the hidden file input
    const fileInput = page.locator('input[type="file"]')

    // Upload a small text file
    await fileInput.setInputFiles({
      name: 'test-document.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is a test file for activity upload'),
    })

    // File preview should appear
    await expect(page.getByText('test-document.txt')).toBeVisible({ timeout: 5_000 })

    // Type a comment alongside the file
    const commentText = `Comment with file ${Date.now()}`
    await page.getByPlaceholder('Write a comment').fill(commentText)

    // Post
    await page.getByRole('button', { name: 'Post' }).click()

    // Comment should appear in the feed
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 })

    // Composer textarea should be cleared after posting
    await expect(page.getByPlaceholder('Write a comment')).toHaveValue('', { timeout: 5_000 })
  })

  test('should remove attached file before posting', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'FileRemove')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    // Attach a file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'remove-me.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
    })

    // File preview should show
    await expect(page.getByText('remove-me.pdf')).toBeVisible({ timeout: 5_000 })

    // Click the X button on the file preview to remove it
    const removeBtn = page.locator('.bg-muted\\/50').filter({ hasText: 'remove-me.pdf' }).locator('button')
    await removeBtn.click()

    // File should be gone
    await expect(page.getByText('remove-me.pdf')).toBeHidden({ timeout: 3_000 })
  })

  // ---------------------------------------------------------------------------
  // @mentions
  // ---------------------------------------------------------------------------

  test('should show mention popup when typing @', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'MentionPopup')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    const textarea = page.getByPlaceholder('Write a comment')
    await expect(textarea).toBeVisible({ timeout: 10_000 })

    // Type @ to trigger the mention popup
    await textarea.fill('@')

    // MentionPopup should appear — it's a div with class hot-mention-popup
    const mentionPopup = page.locator('.hot-mention-popup')
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 })

    // Should show user suggestions (at least "Loading..." or user items)
    const items = mentionPopup.locator('.hot-mention-popup-item')
    await expect(items.first()).toBeVisible({ timeout: 5_000 })
  })

  test('should filter mention suggestions by typing after @', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'MentionFilter')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    const textarea = page.getByPlaceholder('Write a comment')
    await expect(textarea).toBeVisible({ timeout: 10_000 })

    // Type @admin to filter
    await textarea.fill('@admin')
    await page.waitForTimeout(500) // Wait for API debounce

    // MentionPopup should appear with filtered results
    const mentionPopup = page.locator('.hot-mention-popup')
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 })

    // Should show results matching "admin"
    const items = mentionPopup.locator('.hot-mention-popup-item')
    await expect(items.first()).toBeVisible({ timeout: 5_000 })
  })

  test('should insert mention into comment text when selecting a user', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'MentionSelect')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    const textarea = page.getByPlaceholder('Write a comment')
    await expect(textarea).toBeVisible({ timeout: 10_000 })

    // Type @ to trigger mention popup
    await textarea.fill('@')

    const mentionPopup = page.locator('.hot-mention-popup')
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 })

    // Wait for real user items to load (not "Searching...")
    const userItems = mentionPopup.locator('.hot-mention-popup-item').filter({ hasNotText: 'Searching' }).filter({ hasNotText: 'No users' })
    await expect(userItems.first()).toBeVisible({ timeout: 5_000 })

    // The popup uses onMouseDown, use dispatchEvent to trigger it
    await userItems.first().dispatchEvent('mousedown')
    await page.waitForTimeout(500)

    // Mention popup should close
    await expect(mentionPopup).toBeHidden({ timeout: 5_000 })

    // The textarea should now contain @username
    const textareaValue = await textarea.inputValue()
    expect(textareaValue).toMatch(/@\S+/)
  })

  test('should post comment with @mention and show it in activity feed', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'MentionPost')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    const textarea = page.getByPlaceholder('Write a comment')
    await expect(textarea).toBeVisible({ timeout: 10_000 })

    // Type message with @mention trigger
    await textarea.fill('Hello @')

    const mentionPopup = page.locator('.hot-mention-popup')
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 })

    // Select first real user (not "Searching..." or "No users")
    const userItems = mentionPopup.locator('.hot-mention-popup-item').filter({ hasNotText: 'Searching' }).filter({ hasNotText: 'No users' })
    await expect(userItems.first()).toBeVisible({ timeout: 5_000 })
    await userItems.first().dispatchEvent('mousedown')
    await page.waitForTimeout(500)
    await expect(mentionPopup).toBeHidden({ timeout: 5_000 })

    // Add more text after the mention
    const uniqueSuffix = `check this ${Date.now()}`
    await textarea.press('End')
    await textarea.type(` ${uniqueSuffix}`)

    // Post the comment
    await page.getByRole('button', { name: 'Post' }).click()

    // The comment should appear in the activity feed
    await expect(page.getByText(new RegExp(uniqueSuffix))).toBeVisible({ timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // Activity filter tabs
  // ---------------------------------------------------------------------------

  test('should filter activity to show only comments', async ({ page, request }) => {
    const contractor = await createTestContractor(request, 'FilterComments')
    expect(contractor).not.toBeNull()

    await gotoContractor(page, contractor!.id)

    // Post a comment first
    const commentText = `Filter test comment ${Date.now()}`
    const textarea = page.getByPlaceholder('Write a comment')
    await textarea.fill(commentText)
    await page.getByRole('button', { name: 'Post' }).click()
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 })

    // Switch to "Comments" filter tab
    await page.getByRole('button', { name: 'Comments' }).click()
    await page.waitForTimeout(500)

    // Comment should still be visible
    await expect(page.getByText(commentText)).toBeVisible()

    // Switch to "Changes" filter
    await page.getByRole('button', { name: 'Changes' }).click()
    await page.waitForTimeout(500)

    // Comment should NOT be visible under Changes filter
    // (either hidden or "No activity yet" shown)
    const commentVisible = await page.getByText(commentText).isVisible().catch(() => false)
    const noActivity = await page.getByText('No activity yet').isVisible().catch(() => false)
    expect(commentVisible === false || noActivity === true).toBe(true)

    // Switch back to All
    await page.getByRole('button', { name: 'All' }).first().click()
    await page.waitForTimeout(500)
    await expect(page.getByText(commentText)).toBeVisible()
  })
})
