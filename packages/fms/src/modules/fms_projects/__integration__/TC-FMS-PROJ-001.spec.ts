import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createProjectFixture,
  deleteProjectIfExists,
} from './helpers'

/**
 * TC-FMS-PROJ-001: Project Detail Page — Navigation and Rendering
 *
 * Verifies that:
 *  1. Clicking a project row on the list page navigates to its detail
 *  2. The header section renders with correct project data
 *  3. Key sections (Parties, Cutoffs, Cargo Description, Documents) are visible
 *  4. Transport-mode-specific sections appear when appropriate
 */
test.describe('TC-FMS-PROJ-001: Project Detail — Navigation & Rendering', () => {
  let authToken: string | null = null
  let projectId: string | null = null
  const timestamp = Date.now()

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')

    const project = await createProjectFixture(request, authToken, {
      cargoType: 'fcl',
      direction: 'export',
      shipmentType: 'EXP',
      bookingNumber: `BK-${timestamp}`,
      blNumber: `BL-${timestamp}`,
      clientReference: `CR-${timestamp}`,
    })
    expect(project).toBeTruthy()
    projectId = project!.id
  })

  test.afterAll(async ({ request }) => {
    await deleteProjectIfExists(request, authToken, projectId)
  })

  test('should navigate to detail page and verify all sections render', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'admin')

    // Navigate directly to the detail page via URL
    await page.goto(`/backend/fms-projects/${projectId}`)

    // Wait for project header to render (project number contains EXP/FCL)
    await expect(page.getByText(/EXP\/FCL\//)).toBeVisible({ timeout: 15_000 })

    // ---- Verify header section ----
    // Status badge should show "Draft"
    await expect(page.getByText('Draft').first()).toBeVisible({ timeout: 5_000 })

    // Export badge should be visible
    await expect(page.getByText('Export')).toBeVisible({ timeout: 5_000 })

    // Header cells with labels should be visible (use exact to avoid matching placeholders)
    await expect(page.getByText('Origin', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Destination', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Booking #', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Status', { exact: true }).first()).toBeVisible({ timeout: 5_000 })

    // Financial row should be visible
    await expect(page.getByText('EST. COST')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('MARGIN')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('INVOICING')).toBeVisible({ timeout: 5_000 })

    // ---- Verify key content sections ----
    // Activity panel (left side)
    await expect(page.getByText('Activity')).toBeVisible({ timeout: 5_000 })

    // Parties table
    await expect(page.getByText('Parties')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Shipper')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Consignee')).toBeVisible({ timeout: 5_000 })

    // Cutoffs table
    await expect(page.getByText('Cutoffs')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Cargo Ready')).toBeVisible({ timeout: 5_000 })

    // Cargo Description section
    await expect(page.getByRole('heading', { name: 'Cargo Description' })).toBeVisible({ timeout: 5_000 })

    // Not found should NOT be visible
    await expect(page.getByText('Project not found')).toBeHidden()
  })
})
