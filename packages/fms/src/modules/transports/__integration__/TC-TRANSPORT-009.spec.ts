import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  createSeaContainerFixture,
  getTransportById,
} from './helpers'

/**
 * TC-TRANSPORT-009: Tab-navigation multi-cell editing on non-first rows
 *
 * Creates 8 sea containers so the table has enough rows to pick a row
 * in the middle / bottom. Edits cells by scrolling to the correct column,
 * double-clicking, typing, and pressing Tab. Verifies persistence via API.
 */
test.describe('TC-TRANSPORT-009: Tab-chained editing on middle rows', () => {
  let authToken: string = ''
  let projectId: string | null = null
  const timestamp = Date.now()

  const containers = Array.from({ length: 8 }, (_, i) => ({
    containerNumber: `TABN${timestamp}${String.fromCharCode(65 + i)}`,
    bookingNumber: `BK-T9-${timestamp}-${i}`,
    notes: `Row ${i + 1} notes`,
    id: null as string | null,
  }))

  const middleTarget = containers[4] // row 5 of 8
  const lastTarget = containers[7]   // row 8 of 8

  async function findColIndex(page: any, columnTitle: string): Promise<number> {
    const allHeaders = page.locator('th.hot-col-header')
    const count = await allHeaders.count()
    for (let i = 0; i < count; i++) {
      const span = allHeaders.nth(i).locator(`span[title="${columnTitle}"]`)
      if (await span.count() > 0) return i
    }
    return -1
  }

  async function dblclickCellInRow(page: any, row: any, colIndex: number) {
    const cell = row.locator('td.hot-cell').nth(colIndex)
    await cell.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await cell.dblclick()
  }

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    const project = await createProjectFixture(request, authToken, {
      shipmentType: 'EXP',
      direction: 'export',
    })
    projectId = project?.id ?? null
    expect(projectId).toBeTruthy()

    for (const c of containers) {
      const result = await createSeaContainerFixture(request, authToken, projectId!, {
        containerNumber: c.containerNumber,
        bookingNumber: c.bookingNumber,
        notes: c.notes,
      })
      expect(result).toBeTruthy()
      c.id = result!.id
    }
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should edit booking in a middle row (row 5 of 8) and verify via API', async ({ page, request }) => {
    test.setTimeout(90_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: middleTarget.containerNumber })).toBeVisible({ timeout: 15_000 })

    // Verify we have multiple rows visible
    await expect(page.getByRole('button', { name: containers[0].containerNumber })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: containers[7].containerNumber })).toBeVisible({ timeout: 5_000 })

    const bookingIdx = await findColIndex(page, 'Booking')
    expect(bookingIdx).toBeGreaterThanOrEqual(0)

    const targetRow = page.locator('tr').filter({ hasText: middleTarget.containerNumber }).first()
    await dblclickCellInRow(page, targetRow, bookingIdx)

    const editor = page.locator('.hot-cell-editor').first()
    await expect(editor).toBeVisible({ timeout: 5_000 })

    const newBooking = `BK-MID5-${timestamp}`
    await editor.fill(newBooking)
    await editor.press('Tab')
    await page.waitForTimeout(2000)

    // Verify UI
    await expect(page.getByText(newBooking)).toBeVisible({ timeout: 5_000 })

    // Verify API
    const transport = await getTransportById(request, authToken, middleTarget.id!)
    expect(transport).toBeTruthy()
    expect(transport!.bookingNumber).toBe(newBooking)
  })

  test('should Tab from Booking to next cell and verify Booking saved', async ({ page, request }) => {
    test.setTimeout(120_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: middleTarget.containerNumber })).toBeVisible({ timeout: 15_000 })

    const bookingIdx = await findColIndex(page, 'Booking')
    expect(bookingIdx).toBeGreaterThanOrEqual(0)

    const targetRow = page.locator('tr').filter({ hasText: middleTarget.containerNumber }).first()
    await dblclickCellInRow(page, targetRow, bookingIdx)

    // Edit booking
    let editor = page.locator('.hot-cell-editor').first()
    await expect(editor).toBeVisible({ timeout: 5_000 })

    const chainBooking = `BK-TAB-${timestamp}`
    await editor.fill(chainBooking)

    // Tab → saves booking, auto-opens next editable cell
    await editor.press('Tab')
    await page.waitForTimeout(1500)

    // Verify the editor auto-opened on the next cell
    editor = page.locator('.hot-cell-editor').first()
    const nextEditorVisible = await editor.isVisible().catch(() => false)
    expect(nextEditorVisible).toBe(true)

    // Escape the next editor (we just wanted to prove Tab chaining works)
    await editor.press('Escape')
    await page.waitForTimeout(500)

    // Verify booking was saved via API
    const transport = await getTransportById(request, authToken, middleTarget.id!)
    expect(transport).toBeTruthy()
    expect(transport!.bookingNumber).toBe(chainBooking)

    // Verify booking visible in UI
    await expect(page.getByText(chainBooking)).toBeVisible({ timeout: 5_000 })
  })

  test('should edit notes in the last row (row 8 of 8) and verify via API', async ({ page, request }) => {
    test.setTimeout(90_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: lastTarget.containerNumber })).toBeVisible({ timeout: 15_000 })

    const notesIdx = await findColIndex(page, 'Notes')
    expect(notesIdx).toBeGreaterThanOrEqual(0)

    const lastRow = page.locator('tr').filter({ hasText: lastTarget.containerNumber }).first()
    await dblclickCellInRow(page, lastRow, notesIdx)

    const editor = page.locator('.hot-cell-editor').first()
    await expect(editor).toBeVisible({ timeout: 5_000 })

    const newNotes = `Bottom row edited ${timestamp}`
    await editor.fill(newNotes)
    await editor.press('Tab')
    await page.waitForTimeout(2000)

    // Verify UI
    await expect(page.getByText(newNotes)).toBeVisible({ timeout: 5_000 })

    // Verify API
    const transport = await getTransportById(request, authToken, lastTarget.id!)
    expect(transport).toBeTruthy()
    expect(transport!.notes).toBe(newNotes)
  })

  test('should edit PIN and Notes back-to-back via scrolling in a middle row', async ({ page, request }) => {
    test.setTimeout(120_000)

    await login(page, 'superadmin')
    await page.goto('/backend/transports')
    await expect(page.getByRole('button', { name: middleTarget.containerNumber })).toBeVisible({ timeout: 15_000 })

    const targetRow = page.locator('tr').filter({ hasText: middleTarget.containerNumber }).first()

    // Edit PIN
    const pinIdx = await findColIndex(page, 'PIN')
    expect(pinIdx).toBeGreaterThanOrEqual(0)
    await dblclickCellInRow(page, targetRow, pinIdx)

    let editor = page.locator('.hot-cell-editor').first()
    await expect(editor).toBeVisible({ timeout: 5_000 })

    const newPin = `PIN-MID-${timestamp}`
    await editor.fill(newPin)
    await editor.press('Enter')
    await page.waitForTimeout(2000)

    // Now edit Notes (different column, same row)
    const notesIdx = await findColIndex(page, 'Notes')
    expect(notesIdx).toBeGreaterThanOrEqual(0)
    await dblclickCellInRow(page, targetRow, notesIdx)

    editor = page.locator('.hot-cell-editor').first()
    await expect(editor).toBeVisible({ timeout: 5_000 })

    const newNotes = `Notes after PIN ${timestamp}`
    await editor.fill(newNotes)
    await editor.press('Enter')
    await page.waitForTimeout(2000)

    // Verify both edits in UI
    await expect(page.getByText(newPin)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(newNotes)).toBeVisible({ timeout: 5_000 })

    // Verify both via API
    const transport = await getTransportById(request, authToken, middleTarget.id!)
    expect(transport).toBeTruthy()
    expect(transport!.pinCode).toBe(newPin)
    expect(transport!.notes).toBe(newNotes)
  })
})
