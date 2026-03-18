import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  generatePdfFixture,
  validatePdfBuffer,
  deletePdfmeTemplateIfExists,
  createPdfmeTemplateFixture,
  getPdfmeTemplateFixture,
  listPdfmeTemplatesFixture,
  createMinimalPdfmeTemplate,
  extractPdfText,
  assertPdfContent,
} from './helpers'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-PT-013: Error Handling and Edge Cases
 *
 * Verifies that the PDF templates API properly handles:
 * - Unauthorized access
 * - Invalid payloads and validation errors
 * - Missing required parameters
 * - Generation failures
 * - Special characters and unicode in template fields
 */
test.describe('TC-PT-013: Error Handling and Edge Cases', () => {
  let authToken: string

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
  })

  test.afterAll(async ({ request }) => {
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  // --- AUTH ERRORS ---

  test('GET should reject unauthenticated requests', async ({ request }) => {
    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme?type=offer`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        // No Authorization header
      }
    )

    expect(response.status()).toBeGreaterThanOrEqual(400)
  })

  test('PUT should reject unauthenticated requests', async ({ request }) => {
    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          templateType: 'offer',
          name: 'Unauthorized Template',
          templateJson: createMinimalPdfmeTemplate(),
        }),
      }
    )

    expect(response.status()).toBeGreaterThanOrEqual(400)
  })

  test('POST generate should reject unauthenticated requests', async ({ request }) => {
    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          templateType: 'offer',
          inputs: [{ offerNumber: 'TEST' }],
        }),
      }
    )

    expect(response.status()).toBeGreaterThanOrEqual(400)
  })

  test('DELETE should reject unauthenticated requests', async ({ request }) => {
    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme?type=offer`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    expect(response.status()).toBeGreaterThanOrEqual(400)
  })

  // --- VALIDATION ERRORS ---

  test('POST create should fail with invalid template JSON structure', async ({ request }) => {
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')

    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          templateType: 'offer',
          name: 'Invalid Template',
          templateJson: {
            // Missing basePdf — required field
            schemas: 'not an array', // Invalid — should be array
          },
        }),
      }
    )

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  test('POST create should fail without template name', async ({ request }) => {
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')

    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          templateType: 'offer',
          name: '', // Empty name — should fail validation
          templateJson: createMinimalPdfmeTemplate(),
        }),
      }
    )

    expect(response.status()).toBe(400)
  })

  test('generate should fail without templateId, templateType, or templateJson', async ({ request }) => {
    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          // No templateId, templateType, or templateJson
          inputs: [{ offerNumber: 'TEST-001' }],
        }),
      }
    )

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  test('generate should fail with non-existent templateId', async ({ request }) => {
    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          templateId: '00000000-0000-0000-0000-000000000000',
          inputs: [{ offerNumber: 'TEST-001' }],
        }),
      }
    )

    expect(response.status()).toBe(404)
  })

  test('DELETE should fail without type parameter', async ({ request }) => {
    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme`, // No ?type= parameter
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    expect(response.status()).toBe(400)
  })

  test('DELETE should return 404 for non-existent template', async ({ request }) => {
    // Ensure template is deleted
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')

    const response = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme?type=offer`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    expect(response.status()).toBe(404)
  })

  // --- EDGE CASES ---

  test('should handle unicode characters in template fields', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'UNICODE-001',
          clientName: 'Spółka z o.o. Łódź',
          clientAddress: '日本語テスト — Warszawa, Świętokrzyska 12',
          currencyCode: 'PLN',
          labelOffer: 'OFERTA',
          labelClient: 'KLIENT',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
    expect(pdfBuffer.length).toBeGreaterThan(1000)
  })

  test('should handle very long text values', async ({ request }) => {
    const longText = 'A'.repeat(5000)

    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'LONG-TEXT-001',
          routesContent: longText,
          customerNotes: longText,
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
  })

  test('should handle special characters in inputs', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'SPECIAL-<>&"\'001',
          clientName: 'Client & Partners "Inc"',
          clientAddress: '123 Main St.\n<script>alert("xss")</script>',
          footerHtml: 'Terms: 50% payment upfront; remaining upon delivery.',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)

    const pdfText = await extractPdfText(pdfBuffer)
    // Script tags should not be executable (just rendered as text)
    assertPdfContent(pdfText, {
      unexpectedPatterns: [/\[object Object\]/],
    })
  })

  test('should handle template with empty schemas array', async ({ request }) => {
    const emptyTemplate = {
      basePdf: {
        width: 210,
        height: 297,
        padding: [10, 10, 10, 10],
      },
      schemas: [
        [], // Empty page — no elements
      ],
    }

    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateJson: emptyTemplate,
      inputs: [{}],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
  })

  test('should generate PDF when inputs contain extra fields not in template', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'EXTRA-FIELDS-001',
          nonExistentField1: 'should be ignored',
          nonExistentField2: 'also ignored',
          anotherRandom: '12345',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
  })

  test('should handle concurrent template operations gracefully', async ({ request }) => {
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')

    // Create a template
    await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Concurrent Test',
      templateJson: createMinimalPdfmeTemplate(),
      isActive: true,
    })

    // Run multiple concurrent reads
    const results = await Promise.all([
      getPdfmeTemplateFixture(request, authToken, 'offer'),
      getPdfmeTemplateFixture(request, authToken, 'offer', { includeDefault: true }),
      getPdfmeTemplateFixture(request, authToken, 'offer', { includeVariables: true }),
      listPdfmeTemplatesFixture(request, authToken),
    ])

    // All should succeed
    expect(results[0]?.name).toBe('Concurrent Test')
    expect(results[1]?.name).toBe('Concurrent Test')
    expect(results[2]?.name).toBe('Concurrent Test')
    expect(results[3].items.length).toBeGreaterThanOrEqual(1)

    // Clean up
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test('should handle concurrent PDF generations', async ({ request }) => {
    const generateOpts = {
      templateType: 'offer' as const,
      inputs: [
        {
          offerNumber: `CONCURRENT-${Date.now()}`,
          clientName: 'Concurrent Test Client',
        },
      ],
    }

    // Run 3 concurrent PDF generations
    const [pdf1, pdf2, pdf3] = await Promise.all([
      generatePdfFixture(request, authToken, generateOpts),
      generatePdfFixture(request, authToken, generateOpts),
      generatePdfFixture(request, authToken, generateOpts),
    ])

    expect(validatePdfBuffer(pdf1)).toBe(true)
    expect(validatePdfBuffer(pdf2)).toBe(true)
    expect(validatePdfBuffer(pdf3)).toBe(true)
  })
})
