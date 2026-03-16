import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  generatePdfFixture,
  validatePdfBuffer,
  deletePdfmeTemplateIfExists,
  createPdfmeTemplateFixture,
  extractPdfText,
  assertPdfContent,
  checkPdfContent,
} from './helpers'

/**
 * TC-PT-010: Verify Placeholder Substitution in Generated PDFs
 *
 * This test suite verifies that:
 * 1. Variable placeholders are correctly replaced with actual values
 * 2. No [object Object] appears in generated PDFs
 * 3. The fixDoubleBraceSyntax() function auto-corrects malformed templates
 * 4. Value sanitization prevents object/array artifacts
 *
 * These tests would have caught the {{variable}} vs {variable} bug
 * that caused [object Object] to appear in PDFs.
 */
test.describe('TC-PT-010: Verify Placeholder Substitution', () => {
  let authToken: string

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
  })

  test.afterAll(async ({ request }) => {
    // Clean up any test templates
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test('should replace placeholders with actual values in PDF content', async ({ request }) => {
    // Use unique test values that are easily searchable
    const testOfferNumber = `CONTENT-TEST-${Date.now()}`
    const testClientName = 'Acme Corporation Integration Test'
    const testValidUntil = 'December 31, 2026'

    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: testOfferNumber,
          clientName: testClientName,
          validUntil: testValidUntil,
        },
      ],
    })

    // Verify it's a valid PDF
    expect(validatePdfBuffer(pdfBuffer)).toBe(true)

    // Extract and verify content
    const pdfText = await extractPdfText(pdfBuffer)

    // Assert expected values appear in the PDF
    assertPdfContent(pdfText, {
      expectedValues: [testOfferNumber],
      // Also check for forbidden patterns automatically
    })
  })

  test('should not contain [object Object] in generated PDF', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'OBJECT-TEST-001',
          clientName: 'Test Client',
        },
      ],
    })

    const pdfText = await extractPdfText(pdfBuffer)

    // This is the critical assertion that would have caught the original bug
    expect(pdfText).not.toMatch(/\[object Object\]/)

    // Use the helper for comprehensive check
    const issues = checkPdfContent(pdfText)
    expect(issues.hasObjectObject).toBe(false)
    expect(issues.hasDoubleBracePlaceholders).toBe(false)
  })

  test('should handle template with double-brace syntax gracefully (auto-fix)', async ({ request }) => {
    // Create a template with intentionally WRONG syntax (double braces)
    // The fixDoubleBraceSyntax() function should auto-correct this at generation time
    const templateWithDoubleBraces = {
      basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
      schemas: [
        [
          {
            name: 'testField',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 100,
            height: 20,
            content: '{{testValue}}', // Wrong syntax - should be {testValue}
            readOnly: true,
          },
          {
            name: 'mixedField',
            type: 'text',
            position: { x: 10, y: 40 },
            width: 150,
            height: 20,
            content: 'Offer: {{offerNumber}} - Client: {{clientName}}', // Multiple wrong placeholders
            readOnly: true,
          },
        ],
      ],
    }

    const expectedValue = 'AUTO_FIX_TEST_VALUE'
    const expectedOfferNumber = 'AUTO-FIX-001'
    const expectedClientName = 'Auto Fix Test Client'

    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateJson: templateWithDoubleBraces,
      inputs: [
        {
          testValue: expectedValue,
          offerNumber: expectedOfferNumber,
          clientName: expectedClientName,
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)

    const pdfText = await extractPdfText(pdfBuffer)

    // Should contain actual values (fixDoubleBraceSyntax auto-corrects)
    expect(pdfText).toContain(expectedValue)
    expect(pdfText).toContain(expectedOfferNumber)
    expect(pdfText).toContain(expectedClientName)

    // Should NOT contain [object Object]
    expect(pdfText).not.toMatch(/\[object Object\]/)

    // Should NOT contain the original double-brace placeholders
    expect(pdfText).not.toContain('{{testValue}}')
    expect(pdfText).not.toContain('{{offerNumber}}')
  })

  test('should not produce [object Object] when object values are accidentally passed', async ({ request }) => {
    // Simulate a bug where an object is passed instead of a string
    // The sanitizeInputs() function should convert it to JSON, not [object Object]
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'SANITIZE-TEST-001',
          // Intentionally pass an object where a string is expected
          // Type assertion needed to bypass TypeScript
          clientName: { shouldBeSanitized: true, nested: { value: 'test' } } as unknown as string,
        },
      ],
    })

    const pdfText = await extractPdfText(pdfBuffer)

    // The critical check: [object Object] should NEVER appear
    expect(pdfText).not.toMatch(/\[object Object\]/)

    // The sanitized output should be JSON-like (contains the key names)
    // or an empty string, but never [object Object]
    const issues = checkPdfContent(pdfText)
    expect(issues.hasObjectObject).toBe(false)
  })

  test('should not produce [object Object] when array values are passed', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'ARRAY-TEST-001',
          // Pass an array where a string is expected
          clientName: ['Value 1', 'Value 2', 'Value 3'] as unknown as string,
        },
      ],
    })

    const pdfText = await extractPdfText(pdfBuffer)

    // Should not contain [object Object] or [Array]
    expect(pdfText).not.toMatch(/\[object Object\]/)
    expect(pdfText).not.toMatch(/\[Array\]/)
  })

  test('should handle empty and null values gracefully', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'NULL-TEST-001',
          clientName: '',
          clientAddress: null as unknown as string,
          validUntil: undefined as unknown as string,
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)

    const pdfText = await extractPdfText(pdfBuffer)

    // Should contain the offer number
    expect(pdfText).toContain('NULL-TEST-001')

    // Should NOT contain literal 'null' or 'undefined' strings
    // (unless they're part of intentional content)
    expect(pdfText).not.toMatch(/\bnull\b/)
    expect(pdfText).not.toMatch(/\bundefined\b/)

    // No [object Object]
    expect(pdfText).not.toMatch(/\[object Object\]/)
  })

  test('should verify saved custom template uses correct placeholder syntax', async ({ request }) => {
    // Clean up any existing template
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')

    // Create a custom template with correct single-brace syntax
    const correctTemplate = {
      basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
      schemas: [
        [
          {
            name: 'offerNumber',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 100,
            height: 20,
            content: 'Offer: {offerNumber}', // Correct single-brace syntax
            readOnly: true,
          },
          {
            name: 'clientDetails',
            type: 'text',
            position: { x: 10, y: 40 },
            width: 150,
            height: 30,
            content: 'Client: {clientName}\nValid: {validUntil}',
            readOnly: true,
          },
        ],
      ],
    }

    await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Correct Syntax Template',
      templateJson: correctTemplate,
      isActive: true,
    })

    // Generate PDF using the saved template
    const testOfferNumber = `SAVED-TEMPLATE-${Date.now()}`
    const testClientName = 'Saved Template Test Client'

    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: testOfferNumber,
          clientName: testClientName,
          validUntil: 'January 15, 2027',
        },
      ],
    })

    const pdfText = await extractPdfText(pdfBuffer)

    // Verify correct substitution
    expect(pdfText).toContain(testOfferNumber)
    expect(pdfText).toContain(testClientName)

    // No placeholder artifacts
    assertPdfContent(pdfText, {
      unexpectedPatterns: [/\[object Object\]/, /\{offerNumber\}/, /\{clientName\}/],
    })

    // Clean up
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test('comprehensive content verification with all input types', async ({ request }) => {
    const testData = {
      // String values
      offerNumber: `COMPREHENSIVE-${Date.now()}`,
      clientName: 'Comprehensive Test Corp',
      clientAddress: '123 Test Street\nTest City, TC 12345',
      
      // Date values
      validUntil: 'March 31, 2027',
      createdDate: 'March 15, 2026',
      
      // Currency/numeric-like strings
      currencyCode: 'EUR',
      
      // Labels
      labelOffer: 'QUOTATION',
      labelClient: 'CUSTOMER',
      
      // Empty values (should not cause issues)
      customerNotes: '',
      incoterms: 'FOB',
    }

    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [testData],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)

    const pdfText = await extractPdfText(pdfBuffer)

    // Comprehensive assertions
    assertPdfContent(pdfText, {
      expectedValues: [testData.offerNumber],
      unexpectedPatterns: [
        /\[object Object\]/,
        /\[Array\]/,
        /\{\{[a-zA-Z]+\}\}/, // No double-brace placeholders
      ],
    })

    // Additional sanity checks
    const issues = checkPdfContent(pdfText)
    expect(issues.issues).toHaveLength(0)
  })
})
