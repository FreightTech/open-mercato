import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  generatePdfFixture,
  validatePdfBuffer,
  deletePdfmeTemplateIfExists,
} from './helpers'

/**
 * TC-PT-008: Generate PDF with Default Template
 *
 * Verifies that PDF generation works with the default offer template
 * when no custom template exists.
 */
test.describe('TC-PT-008: Generate PDF with Default Template', () => {
  let authToken: string

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
    // Ensure no custom template exists (use default)
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test('should generate PDF using default offer template', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'TEST-001',
          companyName: 'Test Company',
          clientName: 'Test Client',
          validUntil: 'April 1, 2026',
          currencyCode: 'EUR',
        },
      ],
    })

    // Verify PDF was generated
    expect(pdfBuffer.length).toBeGreaterThan(1000) // Reasonable minimum size
    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
  })

  test('should generate PDF with minimal inputs', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: `QA-${Date.now()}`,
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
    expect(pdfBuffer.length).toBeGreaterThan(500)
  })

  test('should generate PDF with branding variables', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'BRAND-001',
          companyName: 'Acme Freight',
          primaryColor: '#ff5500',
          accentColor: '#0055ff',
          labelOffer: 'QUOTATION',
          labelClient: 'CUSTOMER',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
  })

  test('should generate PDF with client data', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'CLIENT-001',
          clientName: 'Global Shipping Inc',
          clientAddress: '123 Port Street\nShipping City, SC 12345',
          clientTaxId: 'TAX-12345678',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
    expect(pdfBuffer.length).toBeGreaterThan(1000)
  })

  test('should generate PDF with shipping details', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'SHIP-001',
          incoterms: 'FOB',
          cargoDescription: 'Electronics equipment',
          cargoType: 'General cargo',
          currencyCode: 'USD',
          paymentTerms: 'Net 30',
          customerNotes: 'Handle with care - fragile items',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
  })

  test('should generate PDF with all variable types', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          // Offer identification
          offerNumber: 'FULL-001',
          version: '2',
          status: 'sent',
          createdDate: 'March 15, 2026',
          validUntil: 'April 15, 2026',
          isExpired: 'false',
          
          // Company/Branding
          companyName: 'Acme Freight',
          companyLogo: '', // Empty for no logo
          primaryColor: '#1a365d',
          accentColor: '#f7fafc',
          
          // Client
          clientName: 'Global Shipping Inc',
          clientAddress: '123 Port Street\nShipping City, SC 12345',
          clientTaxId: 'TAX-12345678',
          
          // Offer details
          incoterms: 'CFR',
          cargoDescription: 'Mixed consumer goods',
          cargoType: 'Containerized',
          currencyCode: 'USD',
          paymentTerms: 'Net 30 days',
          customerNotes: 'Preferred pickup dates: Mon-Fri',
          
          // Labels
          labelOffer: 'OFFER',
          labelClient: 'CLIENT',
          labelValidity: 'Valid Until',
          labelCurrency: 'Currency',
          
          // Routes content (formatted text)
          routesContent: '=== Shanghai → Rotterdam ===\nOcean Freight: USD 1,500.00',
          
          // Footer
          footerHtml: 'Thank you for your business!',
        },
      ],
    })

    expect(pdfBuffer.length).toBeGreaterThan(2000) // Larger with more content
    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
  })

  test('should handle empty string values gracefully', async ({ request }) => {
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          offerNumber: 'EMPTY-001',
          clientName: '',
          clientAddress: '',
          incoterms: '',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
  })
})
