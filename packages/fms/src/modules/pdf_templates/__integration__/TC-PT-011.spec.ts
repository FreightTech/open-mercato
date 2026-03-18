import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  deletePdfmeTemplateIfExists,
  createPdfmeTemplateFixture,
  getPdfmeTemplateFixture,
  listPdfmeTemplatesFixture,
  createMinimalPdfmeTemplate,
  createTestOfferTemplate,
} from './helpers'

/**
 * TC-PT-011: PDF Designer Page — UI Navigation and Layout
 *
 * Verifies the PDF designer page loads correctly, displays
 * template metadata, toolbar buttons, and the pdfme field list.
 * Also tests the "Edit Details" dialog and back navigation.
 */
test.describe('TC-PT-011: PDF Designer Page UI', () => {
  let authToken: string

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
    // Start from a clean state — use default template
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test.afterAll(async ({ request }) => {
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test('should load the designer page with default template', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('input[name="email"], input[type="email"]', 'superadmin@acme.com')
    await page.fill('input[name="password"], input[type="password"]', 'secret')
    await page.click('button:has-text("Sign in")')
    await page.waitForURL(/\/backend/, { timeout: 10000 })

    // Navigate to PDF designer
    await page.goto('/backend/pdf-designer?type=offer')
    await page.waitForSelector('text=Template settings', { timeout: 15000 })

    // Verify header elements
    await expect(page.locator('text=Default offer template')).toBeVisible()
    await expect(page.locator('text=Default Template')).toBeVisible()
    await expect(page.locator('text=No description')).toBeVisible()

    // Verify toolbar buttons
    await expect(page.locator('button:has-text("Insert Variable")')).toBeVisible()
    await expect(page.locator('button:has-text("Preview PDF")')).toBeVisible()
    await expect(page.locator('button:has-text("Edit Details")')).toBeVisible()
    await expect(page.locator('button:has-text("Saved")')).toBeVisible()
    await expect(page.locator('button:has-text("Saved")')).toBeDisabled()

    // Verify the pdfme field list sidebar shows schema fields
    await expect(page.locator('text=Field List')).toBeVisible()
    await expect(page.locator('text=companyLogo')).toBeVisible()
    await expect(page.locator('text=offerTitle')).toBeVisible()
    await expect(page.locator('text=offerNumber')).toBeVisible()
    await expect(page.locator('text=clientName')).toBeVisible()
    await expect(page.locator('text=routesPlaceholder')).toBeVisible()
    await expect(page.locator('text=footerHtml')).toBeVisible()
  })

  test('should open and close Edit Details dialog', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"], input[type="email"]', 'superadmin@acme.com')
    await page.fill('input[name="password"], input[type="password"]', 'secret')
    await page.click('button:has-text("Sign in")')
    await page.waitForURL(/\/backend/, { timeout: 10000 })

    await page.goto('/backend/pdf-designer?type=offer')
    await page.waitForSelector('text=Template settings', { timeout: 15000 })

    // Click Edit Details
    await page.click('button:has-text("Edit Details")')

    // Verify dialog opens with correct fields
    await expect(page.locator('text=Template Name')).toBeVisible()
    await expect(page.locator('text=Description')).toBeVisible()
    await expect(page.locator('input#templateName')).toBeVisible()
    await expect(page.locator('textarea#templateDescription')).toBeVisible()

    // Close dialog via Cancel
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('input#templateName')).not.toBeVisible()
  })

  test('should open Insert Variable popover and list variables', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"], input[type="email"]', 'superadmin@acme.com')
    await page.fill('input[name="password"], input[type="password"]', 'secret')
    await page.click('button:has-text("Sign in")')
    await page.waitForURL(/\/backend/, { timeout: 10000 })

    await page.goto('/backend/pdf-designer?type=offer')
    await page.waitForSelector('text=Template settings', { timeout: 15000 })

    // Click Insert Variable to open the popover
    await page.click('button:has-text("Insert Variable")')

    // Verify variable list appears with key variables
    await expect(page.locator('text={companyLogo}')).toBeVisible()
    await expect(page.locator('text={offerNumber}')).toBeVisible()
    await expect(page.locator('text={clientName}')).toBeVisible()
    await expect(page.locator('text={currencyCode}')).toBeVisible()
    await expect(page.locator('text={routesContent}')).toBeVisible()

    // Verify descriptions are shown
    await expect(page.locator('text=Offer/quote number')).toBeVisible()
    await expect(page.locator('text=Client company name')).toBeVisible()
  })

  test('should redirect invalid template type to offer', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"], input[type="email"]', 'superadmin@acme.com')
    await page.fill('input[name="password"], input[type="password"]', 'secret')
    await page.click('button:has-text("Sign in")')
    await page.waitForURL(/\/backend/, { timeout: 10000 })

    // Navigate with invalid type
    await page.goto('/backend/pdf-designer?type=invalid_type')

    // Should redirect to offer type
    await page.waitForURL(/type=offer/, { timeout: 10000 })
  })

  test('should navigate back to template settings', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"], input[type="email"]', 'superadmin@acme.com')
    await page.fill('input[name="password"], input[type="password"]', 'secret')
    await page.click('button:has-text("Sign in")')
    await page.waitForURL(/\/backend/, { timeout: 10000 })

    await page.goto('/backend/pdf-designer?type=offer')
    await page.waitForSelector('text=Template settings', { timeout: 15000 })

    // Click back to template settings
    await page.click('button:has-text("Template settings")')

    // Should navigate to the config templates page
    await page.waitForURL(/\/backend\/config\/templates/, { timeout: 10000 })
  })

  test('should show custom template name when one exists', async ({ page, request }) => {
    // Create a custom template via API
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
    await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'My Custom Offer',
      description: 'Custom template for integration testing',
      templateJson: createTestOfferTemplate(),
      isActive: true,
    })

    await page.goto('/login')
    await page.fill('input[name="email"], input[type="email"]', 'superadmin@acme.com')
    await page.fill('input[name="password"], input[type="password"]', 'secret')
    await page.click('button:has-text("Sign in")')
    await page.waitForURL(/\/backend/, { timeout: 10000 })

    await page.goto('/backend/pdf-designer?type=offer')
    await page.waitForSelector('text=Template settings', { timeout: 15000 })

    // Verify custom template name is shown
    await expect(page.locator('text=My Custom Offer')).toBeVisible()
    await expect(page.locator('text=Custom template for integration testing')).toBeVisible()

    // Should NOT show "Default Template" badge
    await expect(page.locator('text=Default Template')).not.toBeVisible()

    // Clean up
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })
})
