/**
 * Test file generators for FMS Documents integration tests.
 */

export interface BookingConfirmationTestData {
  content: string
  expectedFields: {
    bookingNumber: string
    vesselName: string
    voyageNumber: string
    portOfLoading: string
    portOfDischarge: string
    etd: string
    eta: string
    shipper: string
  }
}

/**
 * Creates a synthetic booking confirmation document content.
 * The content mimics a real booking confirmation with extractable fields.
 */
export function createBookingConfirmationContent(
  timestamp: number = Date.now()
): BookingConfirmationTestData {
  const bookingNumber = `BK${timestamp.toString().slice(-8)}`
  const vesselName = 'MSC TEST VESSEL'
  const voyageNumber = `TV${timestamp.toString().slice(-4)}E`

  const content = `
BOOKING CONFIRMATION
====================

Booking Number: ${bookingNumber}
Date: ${new Date().toISOString().split('T')[0]}

VESSEL DETAILS
--------------
Vessel Name: ${vesselName}
Voyage Number: ${voyageNumber}
Flag: Panama

ROUTING
-------
Port of Loading (POL): Shanghai (CNSHA), China
Port of Discharge (POD): Rotterdam (NLRTM), Netherlands
ETD: ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
ETA: ${new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}

SHIPPER DETAILS
---------------
Company: Test Shipping Co. Ltd.
Address: 123 Test Street, Shanghai, China

CONSIGNEE DETAILS
-----------------
Company: Test Import BV
Address: 456 Test Avenue, Rotterdam, Netherlands

CARGO DETAILS
-------------
Description: General Cargo - Test Items
Container Type: 40' High Cube
Quantity: 1 x 40HC
Weight: 18,500 KGS
Volume: 65.00 CBM

TERMS
-----
Terms of Shipment: CIF Rotterdam
Payment Terms: Prepaid

This booking confirmation is subject to our standard terms and conditions.

---
Generated for integration testing purposes.
Booking Reference: ${bookingNumber}
`

  return {
    content,
    expectedFields: {
      bookingNumber,
      vesselName,
      voyageNumber,
      portOfLoading: 'Shanghai (CNSHA), China',
      portOfDischarge: 'Rotterdam (NLRTM), Netherlands',
      etd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      eta: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      shipper: 'Test Shipping Co. Ltd.',
    },
  }
}

/**
 * Creates a minimal booking confirmation for quick tests.
 */
export function createMinimalBookingConfirmation(
  bookingNumber: string = `BK${Date.now().toString().slice(-8)}`
): BookingConfirmationTestData {
  const content = `
BOOKING CONFIRMATION

Booking Number: ${bookingNumber}
Vessel: MSC QUICK TEST
POL: Hamburg (DEHAM)
POD: Singapore (SGSIN)
ETD: 2026-04-01
ETA: 2026-05-01
`

  return {
    content,
    expectedFields: {
      bookingNumber,
      vesselName: 'MSC QUICK TEST',
      voyageNumber: '',
      portOfLoading: 'Hamburg (DEHAM)',
      portOfDischarge: 'Singapore (SGSIN)',
      etd: '2026-04-01',
      eta: '2026-05-01',
      shipper: '',
    },
  }
}
