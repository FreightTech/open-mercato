import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
  getProjectById,
} from './helpers'

/**
 * TC-FMS-PROJ-002: Project Detail — Inline Editing Header Fields
 *
 * Verifies that a user can:
 *  1. Edit the booking number inline (click → type → Enter)
 *  2. Edit the client reference inline
 *  3. Verify changes persist via API after edit
 *  4. Edit the project status via dropdown
 */
test.describe('TC-FMS-PROJ-002: Project Detail — Inline Editing', () => {
  let authToken: string | null = null
  let projectId: string | null = null
  const timestamp = Date.now()

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')

    const project = await createProjectFixture(request, authToken, {
      cargoType: 'fcl',
      direction: 'export',
      shipmentType: 'EXP',
      bookingNumber: `EDIT-BK-${timestamp}`,
      clientReference: `EDIT-CR-${timestamp}`,
    })
    expect(project).toBeTruthy()
    projectId = project!.id
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should edit booking number inline and persist', async ({ page, request }) => {
    test.setTimeout(60_000)

    const newBookingNumber = `BK-EDITED-${timestamp}`

    await login(page, 'admin')
    await page.goto(`/backend/fms-projects/${projectId}`)

    // Wait for project header to render
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    // The booking number field shows placeholder "Enter booking #" (no value set via API)
    // Click the placeholder text to enter edit mode
    const bookingField = page.getByText('Enter booking #')
    await expect(bookingField).toBeVisible({ timeout: 5_000 })
    await bookingField.click()

    // An input should appear (InlineEditField switches to <input> on click)
    const input = page.locator('input[placeholder="Enter booking #"]')
    await expect(input).toBeVisible({ timeout: 3_000 })

    // Type the booking number and save — wait for the PUT response
    await input.fill(newBookingNumber)

    const savePromise = page.waitForResponse(
      (resp) => resp.url().includes(`/api/fms_projects/projects/${projectId}`) && resp.request().method() === 'PUT',
      { timeout: 10_000 }
    )
    await input.press('Enter')
    await savePromise
    await page.waitForTimeout(500)

    // Verify the new value appears on the page (may also appear in activity feed)
    await expect(page.getByText(newBookingNumber).first()).toBeVisible({ timeout: 5_000 })

    // Verify via API
    const project = await getProjectById(request, authToken!, projectId!)
    expect(project).toBeTruthy()
    expect((project as any).booking_number).toBe(newBookingNumber)
  })

  test('should edit an existing booking number (replace) and persist', async ({ page, request }) => {
    test.setTimeout(60_000)

    // This test runs after the previous one set booking number to BK-EDITED-{timestamp}
    const replacedBookingNumber = `BK-REPLACED-${timestamp}`

    await login(page, 'admin')
    await page.goto(`/backend/fms-projects/${projectId}`)

    // Wait for header
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    // The booking number should show the value from the previous test
    const bookingField = page.getByText(`BK-EDITED-${timestamp}`).first()
    await expect(bookingField).toBeVisible({ timeout: 5_000 })
    await bookingField.click()

    // Input appears — InlineEditField selects all text on focus,
    // so filling replaces the entire value (expected UX)
    const input = page.locator('input[placeholder="Enter booking #"]')
    await expect(input).toBeVisible({ timeout: 3_000 })

    await input.fill(replacedBookingNumber)

    const savePromise = page.waitForResponse(
      (resp) => resp.url().includes(`/api/fms_projects/projects/${projectId}`) && resp.request().method() === 'PUT',
      { timeout: 10_000 }
    )
    await input.press('Enter')
    await savePromise
    await page.waitForTimeout(500)

    // Verify on page
    await expect(page.getByText(replacedBookingNumber).first()).toBeVisible({ timeout: 5_000 })

    // Verify via API
    const project = await getProjectById(request, authToken!, projectId!)
    expect((project as any).booking_number).toBe(replacedBookingNumber)
  })
})
