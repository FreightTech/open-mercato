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

export interface InvoiceTestData {
  content: string
  expectedFields: {
    invoiceNumber: string
    sellerName: string
    buyerName: string
    blNumber: string
    vesselName: string
    portOfLoading: string
    portOfDischarge: string
    currency: string
    totalGrossAmount: string
  }
}

/**
 * Creates a synthetic freight invoice document content.
 * The content mimics a real shipping invoice with extractable fields.
 */
export function createFreightInvoiceContent(
  timestamp: number = Date.now()
): InvoiceTestData {
  const invoiceNumber = `INV-E2E-${timestamp.toString().slice(-8)}`

  const content = `
FREIGHT INVOICE
===============

Invoice Number: ${invoiceNumber}
Invoice Date: ${new Date().toISOString().split('T')[0]}
Due Date: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}

SELLER
------
MSC Mediterranean Shipping Company S.A.
CHEMIN RIEU 12-14
CH-1208 GENEVA, SWITZERLAND
Tax ID: CHE-111954803 TVA

BUYER
-----
INF Shipping Solutions Sp. z o.o.
ul. Weglowa 12C/122
59-970 Gdynia, POLAND
Tax ID: PL6152069288

VESSEL DETAILS
--------------
Vessel: MSC AURORA
Voyage: QB552E
B/L Number: MEDUYK582433
Port of Loading: GDYNIA
Port of Discharge: CAUCEDO

LINE ITEMS
----------
No.  Description                  Qty     Rate    Currency    Total
1    SEAFREIGHT                   7 20DV  650.00  EUR         4,550.00
2    ISPS                         7 20DV  20.00   EUR         140.00
3    TERMINAL HANDLING CHARGE     7 20DV  145.00  EUR         1,015.00
4    BUNKER RECOVERY CHARGE       7 20DV  308.00  EUR         2,156.00
5    EMISSIONS TRADING SYSTEM     7 20DV  64.00   EUR         448.00
6    FUEL EU SURCHARGE            7 20DV  19.00   EUR         133.00
7    DOCUMENTATION FEE            1 BL    50.00   EUR         50.00

Total EUR: 8,492.00

Payment Terms: 14 days net
`

  return {
    content,
    expectedFields: {
      invoiceNumber,
      sellerName: 'MSC Mediterranean Shipping Company S.A.',
      buyerName: 'INF Shipping Solutions Sp. z o.o.',
      blNumber: 'MEDUYK582433',
      vesselName: 'MSC AURORA',
      portOfLoading: 'GDYNIA',
      portOfDischarge: 'CAUCEDO',
      currency: 'EUR',
      totalGrossAmount: '8492.00',
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
