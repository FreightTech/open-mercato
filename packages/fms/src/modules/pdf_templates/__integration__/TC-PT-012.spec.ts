import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createPdfmeTemplateFixture,
  upsertPdfmeTemplateFixture,
  getPdfmeTemplateFixture,
  listPdfmeTemplatesFixture,
  generatePdfFixture,
  validatePdfBuffer,
  deletePdfmeTemplateIfExists,
  createMinimalPdfmeTemplate,
  createTestOfferTemplate,
} from './helpers'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-PT-012: Template CRUD Lifecycle and Listing
 *
 * Full lifecycle tests for pdfme templates:
 * create → retrieve → list → update → delete → verify deleted.
 * Also covers edge cases: upsert when none exists, list with no templates.
 */
test.describe('TC-PT-012: Template CRUD Lifecycle', () => {
  let authToken: string

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
  })

  test.beforeEach(async ({ request }) => {
    // Clean slate for each test
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test.afterAll(async ({ request }) => {
    await deletePdfmeTemplateIfExists(request, authToken, 'offer')
  })

  test('full lifecycle: create → get → list → update → delete', async ({ request }) => {
    // 1. Create
    const created = await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Lifecycle Test Template',
      description: 'Testing full lifecycle',
      templateJson: createTestOfferTemplate(),
      isActive: true,
    })

    expect(created.id).toBeTruthy()
    expect(created.name).toBe('Lifecycle Test Template')
    expect(created.description).toBe('Testing full lifecycle')
    expect(created.isActive).toBe(true)

    // 2. Retrieve by type
    const retrieved = await getPdfmeTemplateFixture(request, authToken, 'offer')
    expect(retrieved).not.toBeNull()
    expect(retrieved?.id).toBe(created.id)
    expect(retrieved?.name).toBe('Lifecycle Test Template')
    expect(retrieved?.isDefault).toBe(false)

    // 3. List all templates
    const listed = await listPdfmeTemplatesFixture(request, authToken)
    expect(listed.items.length).toBeGreaterThanOrEqual(1)
    expect(listed.availableTypes).toContain('offer')
    const foundInList = listed.items.find(t => t.id === created.id)
    expect(foundInList).toBeTruthy()
    expect(foundInList?.name).toBe('Lifecycle Test Template')

    // 4. Update via upsert (PUT)
    const updated = await upsertPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Updated Lifecycle Template',
      description: 'Updated description',
      templateJson: createMinimalPdfmeTemplate(),
      isActive: true,
    })
    expect(updated.id).toBe(created.id)
    expect(updated.name).toBe('Updated Lifecycle Template')

    // 5. Delete
    const deleteResponse = await request.fetch(
      `${BASE_URL}/api/pdf_templates/pdfme?type=offer`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )
    expect(deleteResponse.ok()).toBe(true)

    // 6. Verify deleted — should return null templateJson
    const afterDelete = await getPdfmeTemplateFixture(request, authToken, 'offer')
    expect(afterDelete?.templateJson).toBeNull()
    expect(afterDelete?.isDefault).toBe(false)
  })

  test('upsert (PUT) should create when no template exists', async ({ request }) => {
    const result = await upsertPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Upsert Created Template',
      templateJson: createMinimalPdfmeTemplate(),
      isActive: true,
    })

    expect(result.id).toBeTruthy()
    expect(result.name).toBe('Upsert Created Template')

    // Verify it exists
    const retrieved = await getPdfmeTemplateFixture(request, authToken, 'offer')
    expect(retrieved?.id).toBe(result.id)
  })

  test('list should return empty items array when no templates exist', async ({ request }) => {
    const listed = await listPdfmeTemplatesFixture(request, authToken)
    // Items may contain templates from other types or be empty
    const offerTemplates = listed.items.filter(t => t.templateType === 'offer')
    expect(offerTemplates).toHaveLength(0)
    expect(listed.availableTypes).toContain('offer')
  })

  test('get with includeDefault should return default when none exists', async ({ request }) => {
    const result = await getPdfmeTemplateFixture(request, authToken, 'offer', {
      includeDefault: true,
    })

    expect(result).not.toBeNull()
    expect(result?.isDefault).toBe(true)
    expect(result?.templateJson).toBeTruthy()
    expect(result?.name).toContain('Default')
  })

  test('get without includeDefault should return null templateJson when none exists', async ({ request }) => {
    const result = await getPdfmeTemplateFixture(request, authToken, 'offer')

    expect(result).not.toBeNull()
    expect(result?.templateJson).toBeNull()
    expect(result?.isDefault).toBe(false)
  })

  test('should preserve templateJson structure through create and retrieve', async ({ request }) => {
    const originalTemplate = {
      basePdf: {
        width: 210,
        height: 297,
        padding: [10, 10, 10, 10],
      },
      schemas: [
        [
          {
            name: 'title',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 100,
            height: 20,
            fontSize: 24,
            fontWeight: 'bold',
            content: '{offerNumber}',
          },
          {
            name: 'logo',
            type: 'image',
            position: { x: 150, y: 10 },
            width: 50,
            height: 20,
          },
        ],
      ],
    }

    const created = await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Structure Test',
      templateJson: originalTemplate,
      isActive: true,
    })

    // Retrieve and verify structure
    const retrieved = await getPdfmeTemplateFixture(request, authToken, 'offer')
    const json = retrieved?.templateJson as typeof originalTemplate

    expect(json).toBeTruthy()
    expect(json.basePdf).toEqual(originalTemplate.basePdf)
    expect(json.schemas).toHaveLength(1)
    expect(json.schemas[0]).toHaveLength(2)

    // First element (text with content) should have readOnly set by normalizeTemplateForSave
    const titleElement = json.schemas[0][0] as Record<string, unknown>
    expect(titleElement.name).toBe('title')
    expect(titleElement.type).toBe('text')
    expect(titleElement.content).toBe('{offerNumber}')
    expect(titleElement.readOnly).toBe(true) // normalizeTemplateForSave marks content elements as readOnly

    // Image element without content should NOT have readOnly
    const logoElement = json.schemas[0][1] as Record<string, unknown>
    expect(logoElement.name).toBe('logo')
    expect(logoElement.type).toBe('image')
  })

  test('should generate PDF with custom template that has multiple pages', async ({ request }) => {
    const multiPageTemplate = {
      basePdf: {
        width: 210,
        height: 297,
        padding: [10, 10, 10, 10],
      },
      schemas: [
        // Page 1: Cover
        [
          {
            name: 'coverTitle',
            type: 'text',
            position: { x: 10, y: 100 },
            width: 190,
            height: 30,
            fontSize: 36,
            fontWeight: 'bold',
            alignment: 'center',
          },
          {
            name: 'coverSubtitle',
            type: 'text',
            position: { x: 10, y: 140 },
            width: 190,
            height: 20,
            fontSize: 18,
            alignment: 'center',
          },
        ],
        // Page 2: Content
        [
          {
            name: 'contentTitle',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 100,
            height: 15,
            fontSize: 16,
            fontWeight: 'bold',
          },
          {
            name: 'contentBody',
            type: 'text',
            position: { x: 10, y: 30 },
            width: 190,
            height: 200,
            fontSize: 10,
          },
        ],
        // Page 3: Terms
        [
          {
            name: 'termsTitle',
            type: 'text',
            position: { x: 10, y: 10 },
            width: 100,
            height: 15,
            fontSize: 16,
            fontWeight: 'bold',
          },
          {
            name: 'termsContent',
            type: 'text',
            position: { x: 10, y: 30 },
            width: 190,
            height: 250,
            fontSize: 9,
          },
        ],
      ],
    }

    // Save template via API
    await createPdfmeTemplateFixture(request, authToken, {
      templateType: 'offer',
      name: 'Multi-Page Offer',
      description: '3-page offer template',
      templateJson: multiPageTemplate,
      isActive: true,
    })

    // Generate PDF
    const pdfBuffer = await generatePdfFixture(request, authToken, {
      templateType: 'offer',
      inputs: [
        {
          coverTitle: 'FREIGHT OFFER',
          coverSubtitle: 'Prepared for ACME Corporation',
        },
        {
          contentTitle: 'Offer Details',
          contentBody: 'Route: Warsaw → Hamburg → Shanghai\nFreight: EUR 2,200.00',
        },
        {
          termsTitle: 'TERMS & CONDITIONS',
          termsContent: 'Standard freight terms apply. Payment within 30 days.',
        },
      ],
    })

    expect(validatePdfBuffer(pdfBuffer)).toBe(true)
    expect(pdfBuffer.length).toBeGreaterThan(2000)
  })
})
