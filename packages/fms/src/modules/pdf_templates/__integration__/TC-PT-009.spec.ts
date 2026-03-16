import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createPdfmeTemplateFixture,
  upsertPdfmeTemplateFixture,
  getPdfmeTemplateFixture,
  generatePdfFixture,
  validatePdfBuffer,
  deletePdfmeTemplateIfExists,
  createMinimalPdfmeTemplate,
  createTestOfferTemplate,
} from './helpers'

/**
 * TC-PT-009: Generate PDF with Custom Template
 *
 * Verifies that PDF generation works with custom saved templates
 * and inline templateJson.
 */
test.describe('TC-PT-009: Generate PDF with Custom Template', () => {
  let authToken: string

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
  })

  test.afterAll(async ({ request }) => {
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test('should create a custom pdfme template', async ({ request }) => {
    // Clean up first
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')

    const template = await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Custom Offer Template',
      description: 'A custom template for testing',
      templateJson: createTestOfferTemplate(),
      isActive: true,
    })

    expect(template.id).toBeTruthy()
    expect(template.templateType).toBe('offer')
    expect(template.name).toBe('Custom Offer Template')
    expect(template.isActive).toBe(true)
  })

  test('should upsert (update) an existing template', async ({ request }) => {
    // Create first
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
    await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Original Template',
      templateJson: createMinimalPdfmeTemplate(),
      isActive: true,
    })

    // Update via upsert
    const updated = await upsertPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Updated Template Name',
      templateJson: createTestOfferTemplate(),
      isActive: true,
    })

    expect(updated.name).toBe('Updated Template Name')
    expect(updated.id).toBeTruthy()
  })

  test('should generate PDF using custom saved template', async ({ request }) => {
    // First create a custom template
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
    const template = await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Custom PDF Template',
      templateJson: createTestOfferTemplate(),
      isActive: true,
    })

    expect(template.id).toBeTruthy()

    // Generate PDF using the saved template (by type)
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'CUSTOM-001',
          clientName: 'Custom Template Test Client',
          validUntil: 'May 1, 2026',
          totalAmount: 'EUR 15,000.00',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
    expect(pdfBuffer.length).toBeGreaterThan(500)
  })

  test('should generate PDF using inline templateJson', async ({ request }) => {
    const inlineTemplate = createMinimalPdfmeTemplate()

    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateJson: inlineTemplate,
      inputs: [
        {
          testField: 'Inline Template Value',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
    expect(pdfBuffer.length).toBeGreaterThan(500)
  })

  test('should retrieve template with default fallback', async ({ request }) => {
    // Delete custom template
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')

    // Get template with includeDefault=true
    const result = await getPdfmeTemplateFixture(request, authToken, 'offer', {
      includeDefault: true,
    })

    expect(result).not.toBeNull()
    expect(result?.isDefault).toBe(true)
    expect(result?.templateJson).toBeTruthy()
    expect(result?.name).toContain('Default')
  })

  test('should retrieve template with variables list', async ({ request }) => {
    const result = await getPdfmeTemplateFixture(request, authToken, 'offer', {
      includeDefault: true,
      includeVariables: true,
    })

    expect(result).not.toBeNull()
    expect(result?.variables).toBeDefined()
    expect(Array.isArray(result?.variables)).toBe(true)
    
    if (result?.variables) {
      expect(result.variables.length).toBeGreaterThan(0)
      
      // Should include essential variables
      const variableNames = result.variables.map((v) => v.name)
      expect(variableNames).toContain('offerNumber')
      expect(variableNames).toContain('clientName')
      expect(variableNames).toContain('companyName')
    }
  })

  test('should return 409 conflict when creating duplicate template type', async ({ request }) => {
    // Ensure a template exists
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
    await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'First Template',
      templateJson: createMinimalPdfmeTemplate(),
      isActive: true,
    })

    // Try to create another one (should fail with 409)
    const response = await request.fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/api/pdf_templates/pdfme`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          templateType: 'offer',
          name: 'Duplicate Template',
          templateJson: createMinimalPdfmeTemplate(),
          isActive: true,
        }),
      }
    )

    expect(response.status()).toBe(409)
    const body = await response.json()
    expect(body.error).toContain('already exists')
  })

  test('should soft delete template', async ({ request }) => {
    // Create a template
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
    await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'To Be Deleted',
      templateJson: createMinimalPdfmeTemplate(),
      isActive: true,
    })

    // Delete it
    const deleteResponse = await request.fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/api/pdf_templates/pdfme?type=offer`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    expect(deleteResponse.ok()).toBe(true)
    const deleteBody = await deleteResponse.json()
    expect(deleteBody.ok).toBe(true)

    // Verify it's gone (without includeDefault)
    const result = await getPdfmeTemplateFixture(request, authToken, 'offer')
    expect(result?.templateJson).toBeNull()
    expect(result?.isDefault).toBe(false)
  })

  test('should generate PDF with complex template having multiple pages', async ({ request }) => {
    const multiPageTemplate = {
      basePdf: {
        width: 210,
        height: 297,
        padding: [10, 10, 10, 10],
      },
      schemas: [
        // Page 1
        [
          {
            name: 'page1Title',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 100,
            height: 20,
            fontSize: 24,
          },
          {
            name: 'page1Content',
            type: 'text',
            position: { x: 10, y: 40 },
            width: 190,
            height: 200,
            fontSize: 12,
          },
        ],
        // Page 2
        [
          {
            name: 'page2Title',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 100,
            height: 20,
            fontSize: 18,
          },
        ],
      ],
    }

    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateJson: multiPageTemplate,
      inputs: [
        {
          page1Title: 'Cover Page',
          page1Content: 'This is the main content of page 1',
        },
        {
          page2Title: 'Second Page',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
    expect(pdfBuffer.length).toBeGreaterThan(1000) // Multi-page should be larger
  })
})
