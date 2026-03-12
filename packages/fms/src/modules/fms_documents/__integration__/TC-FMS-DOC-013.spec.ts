import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createDocumentFixture,
  deleteDocumentIfExists,
  getDocumentById,
  patchDocumentData,
} from './helpers'

/**
 * TC-FMS-DOC-013: Save Edited Extracted Data
 *
 * Tests updating extracted/shipping-related fields on documents via API.
 * These are fields that would typically be populated by AI extraction
 * but can also be manually edited.
 * 
 * Uses PATCH endpoint for extracted data fields:
 * documentNumber, blNumber, bookingNumber, vesselName, portOfLoading,
 * portOfDischarge, sellerName, buyerName, totalGrossAmount, currency, etc.
 */
test.describe('TC-FMS-DOC-013: Save Edited Extracted Data', () => {
  let authToken: string
  const testPrefix = `extracted-test-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')
  })

  test('should update BL number', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-bl-test`,
      category: 'bill_of_lading',
    })

    expect(doc).not.toBeNull()

    try {
      const success = await patchDocumentData(request, authToken, doc!.id, {
        blNumber: 'MAEU1234567890',
      })

      expect(success).toBe(true)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.blNumber).toBe('MAEU1234567890')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should update booking number', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-booking-test`,
      category: 'booking_confirmation',
    })

    expect(doc).not.toBeNull()

    try {
      const success = await patchDocumentData(request, authToken, doc!.id, {
        bookingNumber: 'BKG2024-001234',
      })

      expect(success).toBe(true)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.bookingNumber).toBe('BKG2024-001234')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should update vessel name', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-vessel-test`,
      category: 'bill_of_lading',
    })

    expect(doc).not.toBeNull()

    try {
      const success = await patchDocumentData(request, authToken, doc!.id, {
        vesselName: 'MSC MEDITERRANEAN',
      })

      expect(success).toBe(true)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.vesselName).toBe('MSC MEDITERRANEAN')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should update ports (POL and POD)', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-ports-test`,
      category: 'bill_of_lading',
    })

    expect(doc).not.toBeNull()

    try {
      const success = await patchDocumentData(request, authToken, doc!.id, {
        portOfLoading: 'SHANGHAI (CNSHA)',
        portOfDischarge: 'ROTTERDAM (NLRTM)',
      })

      expect(success).toBe(true)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.portOfLoading).toBe('SHANGHAI (CNSHA)')
      expect(fetched!.portOfDischarge).toBe('ROTTERDAM (NLRTM)')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should update invoice financial fields', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-financial-test`,
      category: 'invoice',
    })

    expect(doc).not.toBeNull()

    try {
      const success = await patchDocumentData(request, authToken, doc!.id, {
        sellerName: 'Acme Shipping Co.',
        buyerName: 'Global Import Ltd.',
        totalGrossAmount: '15750.50',
        currency: 'EUR',
        documentNumber: 'INV-2024-00123',
      })

      expect(success).toBe(true)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.sellerName).toBe('Acme Shipping Co.')
      expect(fetched!.buyerName).toBe('Global Import Ltd.')
      expect(String(fetched!.totalGrossAmount).startsWith('15750')).toBe(true)
      expect(fetched!.currency).toBe('EUR')
      expect(fetched!.documentNumber).toBe('INV-2024-00123')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should update all shipping fields at once', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-all-shipping`,
      category: 'bill_of_lading',
    })

    expect(doc).not.toBeNull()

    try {
      const success = await patchDocumentData(request, authToken, doc!.id, {
        blNumber: 'COSU9876543210',
        bookingNumber: 'BKG-TEST-999',
        vesselName: 'EVER GIVEN',
        portOfLoading: 'NINGBO (CNNGB)',
        portOfDischarge: 'FELIXSTOWE (GBFXT)',
      })

      expect(success).toBe(true)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.blNumber).toBe('COSU9876543210')
      expect(fetched!.bookingNumber).toBe('BKG-TEST-999')
      expect(fetched!.vesselName).toBe('EVER GIVEN')
      expect(fetched!.portOfLoading).toBe('NINGBO (CNNGB)')
      expect(fetched!.portOfDischarge).toBe('FELIXSTOWE (GBFXT)')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should clear extracted fields with null', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-clear-test`,
      category: 'bill_of_lading',
      blNumber: 'BL-TO-CLEAR',
      vesselName: 'VESSEL-TO-CLEAR',
    })

    expect(doc).not.toBeNull()

    try {
      // Clear the fields by setting null
      const success = await patchDocumentData(request, authToken, doc!.id, {
        blNumber: null,
        vesselName: null,
      })

      expect(success).toBe(true)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      // Should be cleared (null)
      expect(fetched!.blNumber).toBeNull()
      expect(fetched!.vesselName).toBeNull()
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should preserve unrelated fields when updating extracted data', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-preserve-extracted`,
      category: 'invoice',
      description: 'Important invoice description',
      sellerName: 'Original Seller',
      buyerName: 'Original Buyer',
    })

    expect(doc).not.toBeNull()

    try {
      // Only update buyer name
      const success = await patchDocumentData(request, authToken, doc!.id, {
        buyerName: 'New Buyer Corp',
      })

      expect(success).toBe(true)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.buyerName).toBe('New Buyer Corp')
      // Other fields should be preserved
      expect(fetched!.name).toBe(`${testPrefix}-preserve-extracted`)
      expect(fetched!.category).toBe('invoice')
      expect(fetched!.description).toBe('Important invoice description')
      expect(fetched!.sellerName).toBe('Original Seller')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })
})
