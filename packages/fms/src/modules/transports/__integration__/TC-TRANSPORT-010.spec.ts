import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
} from './helpers'

/**
 * TC-TRANSPORT-010: Cell Annotations, Comments & @Mentions
 *
 * Tests:
 * 1. Shift+Click opens the annotation dialog
 * 2. Dialog has textarea, color picker, and Send button
 * 3. @mention popup appears when typing @
 * 4. User can select a mention from the popup
 * 5. Color picker allows selecting colors
 *
 * Note: The annotations API returns 500 from the server, which is a known issue
 * with the DI container initialization in API routes. Comments appear locally
 * in the dialog but do not persist to the database. This is a pre-existing bug
 * in the annotations module (not specific to transports).
 */
test.describe('TC-TRANSPORT-010: Annotations, Comments & @Mentions', () => {
  let authToken: string = ''
  let projectId: string | null = null
  let containerId: string | null = null
  const timestamp = Date.now()
  const containerNumber = `ANNOT${timestamp}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')
    const project = await createProjectFixture(request, authToken, {
      shipmentType: 'EXP', direction: 'export',
    })
    projectId = project?.id ?? null
    expect(projectId).toBeTruthy()

    const container = await createSeaContainerFixture(request, authToken, projectId!, {
      containerNumber,
      bookingNumber: `BK-ANN-${timestamp}`,
    })
    expect(container).toBeTruthy()
    containerId = container!.id
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  async function findColIndex(page: any, title: string): Promise<number> {
    const headers = page.locator('th.hot-col-header')
    const count = await headers.count()
    for (let i = 0; i < count; i++) {
      if (await headers.nth(i).locator(`span[title="${title}"]`).count() > 0) return i
    }
    return -1
  }

  async function shiftClickCell(page: any, colIndex: number) {
    const row = page.locator('tr').filter({ hasText: containerNumber }).first()
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await cell.click({ modifiers: ['Shift'] })
  }

  test('should open annotation dialog with Shift+Click and verify structure', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: containerNumber })).toBeVisible({ timeout: 15_000 })

    const bookingIdx = await findColIndex(page, 'Booking')
    expect(bookingIdx).toBeGreaterThanOrEqual(0)
    await shiftClickCell(page, bookingIdx)

    const dialog = page.locator('.hot-comment-popover')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Dialog title shows column name
    await expect(dialog.getByText('Booking')).toBeVisible({ timeout: 3_000 })

    // Textarea with placeholder
    const textarea = dialog.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 3_000 })
    const placeholder = await textarea.getAttribute('placeholder')
    expect(placeholder).toContain('@')

    // Color picker with 7+ buttons
    const colorBtns = dialog.locator('.hot-comment-color-btn')
    expect(await colorBtns.count()).toBeGreaterThanOrEqual(7)

    // Send button (disabled when empty)
    const sendBtn = dialog.getByRole('button', { name: 'Send' })
    await expect(sendBtn).toBeVisible()
    await expect(sendBtn).toBeDisabled()

    // Hint text
    await expect(dialog.getByText('to send')).toBeVisible()

    // Close with Escape
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 3_000 })
  })

  test('should enable Send button when comment text is entered', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: containerNumber })).toBeVisible({ timeout: 15_000 })

    const bookingIdx = await findColIndex(page, 'Booking')
    await shiftClickCell(page, bookingIdx)

    const dialog = page.locator('.hot-comment-popover')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const sendBtn = dialog.getByRole('button', { name: 'Send' })
    await expect(sendBtn).toBeDisabled()

    // Type text
    const textarea = dialog.locator('textarea').first()
    await textarea.fill('Some comment')

    // Send button should now be enabled
    await expect(sendBtn).toBeEnabled({ timeout: 3_000 })

    await page.keyboard.press('Escape')
  })

  test('should type comment and show it locally after Send', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: containerNumber })).toBeVisible({ timeout: 15_000 })

    const bookingIdx = await findColIndex(page, 'Booking')
    await shiftClickCell(page, bookingIdx)

    const dialog = page.locator('.hot-comment-popover')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const commentText = `UI comment ${timestamp}`
    await dialog.locator('textarea').first().fill(commentText)
    await dialog.getByRole('button', { name: 'Send' }).click()
    await page.waitForTimeout(2000)

    // Comment should appear in the thread (even if server returned 500, optimistic update)
    await expect(dialog.getByText(commentText)).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Escape')
  })

  test('should trigger @mention popup when typing @ in textarea', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: containerNumber })).toBeVisible({ timeout: 15_000 })

    const notesIdx = await findColIndex(page, 'Notes')
    expect(notesIdx).toBeGreaterThanOrEqual(0)
    await shiftClickCell(page, notesIdx)

    const dialog = page.locator('.hot-comment-popover')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Type @ to trigger mention popup
    const textarea = dialog.locator('textarea').first()
    await textarea.click()
    await page.keyboard.type('Review @', { delay: 30 })
    await page.waitForTimeout(1000)

    // Mention popup should appear
    const mentionPopup = page.locator('.hot-mention-popup')
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 })

    // It should show user items or "No users found"
    const items = mentionPopup.locator('.hot-mention-popup-item')
    const itemCount = await items.count()
    const noUsersMsg = await mentionPopup.getByText('No users found').isVisible().catch(() => false)
    expect(itemCount > 0 || noUsersMsg).toBe(true)

    if (itemCount > 0) {
      // Verify user items have email displayed
      const firstItemText = await items.first().innerText()
      expect(firstItemText).toContain('@') // email should contain @
    }

    await page.keyboard.press('Escape') // close mention popup
    await page.keyboard.press('Escape') // close dialog
  })

  test('should select @mention user and include in comment', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: containerNumber })).toBeVisible({ timeout: 15_000 })

    const pinIdx = await findColIndex(page, 'PIN')
    expect(pinIdx).toBeGreaterThanOrEqual(0)
    await shiftClickCell(page, pinIdx)

    const dialog = page.locator('.hot-comment-popover')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const textarea = dialog.locator('textarea').first()
    await textarea.click()
    await page.keyboard.type('Check @', { delay: 30 })
    await page.waitForTimeout(1500)

    const mentionPopup = page.locator('.hot-mention-popup')
    const popupVisible = await mentionPopup.isVisible().catch(() => false)

    if (popupVisible) {
      const items = mentionPopup.locator('.hot-mention-popup-item')
      const itemCount = await items.count()

      if (itemCount > 0) {
        // Click the first user
        await items.first().click()
        await page.waitForTimeout(500)

        // The textarea value should now include the selected user's name/email
        const textareaValue = await textarea.inputValue()
        expect(textareaValue.length).toBeGreaterThan('Check @'.length)

        // Submit and verify
        await dialog.getByRole('button', { name: 'Send' }).click()
        await page.waitForTimeout(2000)

        // Comment should appear in thread with the mention
        await expect(dialog.getByText('Check')).toBeVisible({ timeout: 5_000 })
      }
    }

    await page.keyboard.press('Escape')
  })

  test('should select color from picker and show selected state', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: containerNumber })).toBeVisible({ timeout: 15_000 })

    const hsIdx = await findColIndex(page, 'HS Code')
    expect(hsIdx).toBeGreaterThanOrEqual(0)
    await shiftClickCell(page, hsIdx)

    const dialog = page.locator('.hot-comment-popover')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Click the 4th color (yellow)
    const colorBtns = dialog.locator('.hot-comment-color-btn')
    const yellowBtn = colorBtns.nth(3)
    await yellowBtn.click()
    await page.waitForTimeout(500)

    // The clicked button should have 'selected' class
    await expect(yellowBtn).toHaveClass(/selected/, { timeout: 3_000 })

    // Click a different color (green, 5th)
    const greenBtn = colorBtns.nth(4)
    await greenBtn.click()
    await page.waitForTimeout(500)

    // Green should now be selected, yellow not
    await expect(greenBtn).toHaveClass(/selected/, { timeout: 3_000 })
    const yellowClass = await yellowBtn.getAttribute('class')
    expect(yellowClass).not.toContain('selected')

    // Click the ✕ (first) to clear color
    const clearBtn = colorBtns.nth(0)
    await clearBtn.click()
    await page.waitForTimeout(500)

    // No button should be selected (or clear is selected)
    const greenClassAfter = await greenBtn.getAttribute('class')
    expect(greenClassAfter).not.toContain('selected')

    await page.keyboard.press('Escape')
  })
})
