import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  createContractorFixture,
  createContactFixture,
  createAddressFixture,
  deleteContractorIfExists,
} from './helpers'

/**
 * TC-CONTRACTOR-001: Contractor Detail Page
 *
 * Tests the contractor detail page UI:
 * - Page loads and displays contractor data correctly
 * - Header highlights section shows all fields
 * - Primary contact and address displayed in header
 * - All 4 sections render: People & Places, SOP, Operations, Financials
 * - Activity panel visible on left
 * - Inline editing of name, shortName, taxId, regon
 * - Active/Inactive badge display
 */
test.describe('TC-CONTRACTOR-001: Contractor Detail Page', () => {
  let authToken: string
  const createdContractorIds: string[] = []
  const testPrefix = `ctr-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    for (const id of createdContractorIds) {
      await deleteContractorIfExists(request, authToken, id)
    }
  })

  // Helper: create a contractor with optional contact and address
  async function createFullContractor(
    request: import('@playwright/test').APIRequestContext,
    overrides?: Partial<Parameters<typeof createContractorFixture>[2]>
  ) {
    const contractor = await createContractorFixture(request, authToken, {
      name: `${testPrefix}-TestCorp`,
      shortName: 'TC',
      officialName: 'Test Corporation LLC',
      taxId: '1234567890',
      regon: '12345678901234',
      krs: '0000123456',
      ...overrides,
    })

    if (contractor?.id) {
      createdContractorIds.push(contractor.id)

      // Add primary contact
      await createContactFixture(request, authToken, {
        contractorId: contractor.id,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@testcorp.com',
        phone: '+1-555-0100',
        isPrimary: true,
      })

      // Add primary address via fms_locations unified API
      await createAddressFixture(request, authToken, {
        contractorId: contractor.id,
        type: 'contractor_office',
        name: 'Main Office',
        addressLine1: '123 Main Street',
        city: 'New York',
        postalCode: '10001',
        country: 'US',
        isPrimary: true,
      })
    }

    return contractor
  }

  // ---------------------------------------------------------------------------
  // Page load and header tests
  // ---------------------------------------------------------------------------

  test('should load contractor detail page and display header data', async ({ page, request }) => {
    const contractor = await createFullContractor(request)
    expect(contractor).not.toBeNull()

    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractor!.id}`)

    // Wait for page to load (contractor name should be visible)
    await expect(page.getByText(contractor!.name)).toBeVisible({ timeout: 15_000 })

    // Active badge (use first() because "Active" text appears in multiple places)
    await expect(page.getByText('Active').first()).toBeVisible()

    // Header highlight fields (Row 1)
    await expect(page.getByText('Short Name').first()).toBeVisible()
    await expect(page.getByText('Official Name').first()).toBeVisible()
    await expect(page.getByText('Tax ID (NIP)').first()).toBeVisible()
    await expect(page.getByText('REGON').first()).toBeVisible()
    await expect(page.getByText('KRS').first()).toBeVisible()
    await expect(page.getByText('Since').first()).toBeVisible()

    // Field values
    await expect(page.getByText('TC', { exact: true })).toBeVisible() // shortName
    await expect(page.getByText('Test Corporation LLC')).toBeVisible() // officialName
    await expect(page.getByText('1234567890', { exact: true })).toBeVisible() // taxId
    await expect(page.getByText('12345678901234', { exact: true })).toBeVisible() // regon
    await expect(page.getByText('0000123456', { exact: true })).toBeVisible() // krs

    // Header highlight fields (Row 2) — contact & address
    await expect(page.getByText('Email').first()).toBeVisible()
    await expect(page.getByText('Phone').first()).toBeVisible()
    await expect(page.getByText('Address').first()).toBeVisible()
    await expect(page.getByText('ID').first()).toBeVisible()

    // Contact values (appear in both header and contacts table, use .first())
    await expect(page.getByText('john.doe@testcorp.com').first()).toBeVisible()
    await expect(page.getByText('+1-555-0100').first()).toBeVisible()

    // Address value
    await expect(page.getByText(/123 Main Street.*New York/)).toBeVisible()
  })

  test('should display all 4 content sections', async ({ page, request }) => {
    const contractor = await createFullContractor(request, {
      name: `${testPrefix}-SectionsCorp`,
    })
    expect(contractor).not.toBeNull()

    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractor!.id}`)
    await expect(page.getByText(contractor!.name)).toBeVisible({ timeout: 15_000 })

    // Section 1: People & Places
    await expect(page.getByText('People & Places')).toBeVisible()

    // Section 2: Standard Operating Procedures
    await expect(page.getByText('Standard Operating Procedures')).toBeVisible()

    // Section 3: Operations
    await expect(page.getByText('Operations')).toBeVisible()

    // Section 4: Financials
    await expect(page.getByText('Financials')).toBeVisible()
  })

  test('should display activity panel on the left', async ({ page, request }) => {
    const contractor = await createFullContractor(request, {
      name: `${testPrefix}-ActivityCorp`,
    })
    expect(contractor).not.toBeNull()

    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractor!.id}`)
    await expect(page.getByText(contractor!.name)).toBeVisible({ timeout: 15_000 })

    // Activity section should be visible (it shows timeline/comments area)
    // Look for the activity panel content - typically has a text area or activity items
    const activityPanel = page.locator('.w-\\[400px\\]').first()
    await expect(activityPanel).toBeVisible({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // Contact and address display in People & Places section
  // ---------------------------------------------------------------------------

  test('should display contacts in People & Places section', async ({ page, request }) => {
    const contractor = await createFullContractor(request, {
      name: `${testPrefix}-ContactsCorp`,
    })
    expect(contractor).not.toBeNull()

    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractor!.id}`)
    await expect(page.getByText(contractor!.name)).toBeVisible({ timeout: 15_000 })

    // Contact data should be visible in the People & Places section table
    await expect(page.getByText('John').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Doe').first()).toBeVisible()
    await expect(page.getByText('john.doe@testcorp.com').first()).toBeVisible()
  })

  test('should display addresses in People & Places section', async ({ page, request }) => {
    const contractor = await createFullContractor(request, {
      name: `${testPrefix}-AddressCorp`,
    })
    expect(contractor).not.toBeNull()

    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractor!.id}`)
    await expect(page.getByText(contractor!.name)).toBeVisible({ timeout: 15_000 })

    // Address data should be visible in the locations table
    await expect(page.getByText('123 Main Street').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('New York').first()).toBeVisible()
    await expect(page.getByText('10001').first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Inline editing tests
  // ---------------------------------------------------------------------------

  test('should inline-edit contractor name', async ({ page, request }) => {
    const contractor = await createFullContractor(request, {
      name: `${testPrefix}-EditNameCorp`,
    })
    expect(contractor).not.toBeNull()

    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractor!.id}`)

    // Wait for name to appear in the header (InlineEditField renders as a clickable <div>)
    const nameDisplay = page.getByText(`${testPrefix}-EditNameCorp`).first()
    await expect(nameDisplay).toBeVisible({ timeout: 15_000 })

    // Click to enter edit mode — InlineEditField replaces <div> with <input>
    await nameDisplay.click()

    // The InlineEditField renders an <input> with the same className (text-xl font-bold)
    // Find it by its current value
    const nameInput = page.locator(`input[value="${testPrefix}-EditNameCorp"]`).first()
      .or(page.locator('input.text-xl').first())
    await expect(nameInput).toBeVisible({ timeout: 5_000 })

    const updatedName = `${testPrefix}-RenamedCorp`
    await nameInput.fill(updatedName)
    await nameInput.press('Enter')

    // Wait for save (spinner disappears, new name appears)
    await expect(page.getByText(updatedName).first()).toBeVisible({ timeout: 10_000 })

    // Verify via API
    const fetched = await request.fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/api/contractors/contractors/${contractor!.id}`,
      { method: 'GET', headers: { Authorization: `Bearer ${authToken}` } }
    )
    const body = await fetched.json()
    expect(body.name).toBe(updatedName)
  })

  // ---------------------------------------------------------------------------
  // Error state test
  // ---------------------------------------------------------------------------

  test('should show error state for non-existent contractor', async ({ page }) => {
    await login(page, 'superadmin')
    await page.goto('/backend/contractors/00000000-0000-0000-0000-000000000000')

    // Should show not found state
    await expect(page.getByText('Contractor not found')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Back to Contractors')).toBeVisible()
  })

  test('should navigate back to list via "Back to Contractors" button', async ({ page }) => {
    await login(page, 'superadmin')
    await page.goto('/backend/contractors/00000000-0000-0000-0000-000000000000')

    await expect(page.getByText('Back to Contractors')).toBeVisible({ timeout: 15_000 })
    await page.getByText('Back to Contractors').click()

    await page.waitForURL(/\/backend\/contractors$/, { timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // Delete flow
  // ---------------------------------------------------------------------------

  test('should delete contractor via delete button', async ({ page, request }) => {
    const contractor = await createContractorFixture(request, authToken, {
      name: `${testPrefix}-DeleteMe`,
    })
    expect(contractor).not.toBeNull()
    // Don't add to cleanup list since we're deleting it

    await login(page, 'superadmin')
    await page.goto(`/backend/contractors/${contractor!.id}`)
    await expect(page.getByText(`${testPrefix}-DeleteMe`)).toBeVisible({ timeout: 15_000 })

    // Set up dialog handler before clicking delete
    page.on('dialog', (dialog) => dialog.accept())

    // Click delete button
    await page.locator('button:has-text("Delete")').first().click()

    // Should redirect to contractors list
    await page.waitForURL(/\/backend\/contractors$/, { timeout: 10_000 })
  })
})
