/**
 * Test file generators for FMS Projects (Files) integration tests.
 * These generate synthetic documents with specific identifiers for testing
 * auto-creation and auto-linking flows.
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
    containerNumbers?: string[]
  }
}

export interface BillOfLadingTestData {
  content: string
  expectedFields: {
    blNumber: string
    bookingNumber: string
    vesselName: string
    voyageNumber: string
    portOfLoading: string
    portOfDischarge: string
    containerNumbers: string[]
  }
}

/**
 * Creates a booking confirmation with a unique booking number.
 * Used for testing auto-create-from-booking flow.
 */
export function createBookingConfirmationForAutoCreate(
  uniqueId: string = Date.now().toString()
): BookingConfirmationTestData {
  const bookingNumber = `BK${uniqueId.slice(-8)}`
  const vesselName = 'MSC INTEGRATION TEST'
  const voyageNumber = `IT${uniqueId.slice(-4)}E`
  const containerNumber = `MSKU${uniqueId.slice(-7)}`

  const etdDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const etaDate = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000)
  const etd = etdDate.toISOString().split('T')[0]
  const eta = etaDate.toISOString().split('T')[0]

  const content = `
BOOKING CONFIRMATION
====================

BOOKING NUMBER: ${bookingNumber}
DATE: ${new Date().toISOString().split('T')[0]}

VESSEL INFORMATION
------------------
Vessel: ${vesselName}
Voyage: ${voyageNumber}
Flag: Panama

ROUTING DETAILS
---------------
Port of Loading: SHANGHAI (CNSHA)
Port of Discharge: ROTTERDAM (NLRTM)
ETD: ${etd}
ETA: ${eta}

SHIPPER
-------
Name: Test Integration Shipper Co.
Address: 123 Test Road, Shanghai, China

CONTAINER DETAILS
-----------------
Container: ${containerNumber}
Type: 40HC
Weight: 22000 KGS

CARGO DESCRIPTION
-----------------
General Cargo - Integration Test Items

Booking Reference: ${bookingNumber}
`

  return {
    content,
    expectedFields: {
      bookingNumber,
      vesselName,
      voyageNumber,
      portOfLoading: 'SHANGHAI (CNSHA)',
      portOfDischarge: 'ROTTERDAM (NLRTM)',
      etd,
      eta,
      shipper: 'Test Integration Shipper Co.',
      containerNumbers: [containerNumber],
    },
  }
}

/**
 * Creates a Bill of Lading document that matches an existing project.
 * Used for testing auto-link flow.
 */
export function createBillOfLadingForAutoLink(
  bookingNumber: string,
  uniqueId: string = Date.now().toString()
): BillOfLadingTestData {
  const blNumber = `MSKU${uniqueId.slice(-8)}BL`
  const vesselName = 'MSC LINK TEST'
  const voyageNumber = `LT${uniqueId.slice(-4)}W`
  const containerNumber = `MSKU${uniqueId.slice(-7)}`

  const content = `
BILL OF LADING
==============

B/L NUMBER: ${blNumber}
BOOKING REF: ${bookingNumber}

VESSEL DETAILS
--------------
Vessel Name: ${vesselName}
Voyage No: ${voyageNumber}
Flag: Liberia

ROUTING
-------
Port of Loading: HAMBURG (DEHAM)
Port of Discharge: NEW YORK (USNYC)

CONTAINER
---------
Container No: ${containerNumber}
Type: 40GP
Seal: SEAL123456

SHIPPER
-------
Test Link Shipper Inc.
456 Link Street, Hamburg, Germany

CONSIGNEE
---------
Test Link Consignee LLC
789 Receive Ave, New York, USA

Bill of Lading Reference: ${blNumber}
Booking Reference: ${bookingNumber}
`

  return {
    content,
    expectedFields: {
      blNumber,
      bookingNumber,
      vesselName,
      voyageNumber,
      portOfLoading: 'HAMBURG (DEHAM)',
      portOfDischarge: 'NEW YORK (USNYC)',
      containerNumbers: [containerNumber],
    },
  }
}

/**
 * Creates a B/L with a specific BL number for matching tests.
 */
export function createBillOfLadingWithBlNumber(
  blNumber: string,
  uniqueId: string = Date.now().toString()
): BillOfLadingTestData {
  const vesselName = 'MSC BL MATCH TEST'
  const voyageNumber = `BM${uniqueId.slice(-4)}E`
  const containerNumber = `TCLU${uniqueId.slice(-7)}`

  const content = `
BILL OF LADING
==============

BILL OF LADING NUMBER: ${blNumber}

VESSEL
------
Name: ${vesselName}
Voyage: ${voyageNumber}

PORT OF LOADING: SINGAPORE (SGSIN)
PORT OF DISCHARGE: FELIXSTOWE (GBFXT)

CONTAINER: ${containerNumber}
TYPE: 20GP

B/L Reference: ${blNumber}
`

  return {
    content,
    expectedFields: {
      blNumber,
      bookingNumber: '',
      vesselName,
      voyageNumber,
      portOfLoading: 'SINGAPORE (SGSIN)',
      portOfDischarge: 'FELIXSTOWE (GBFXT)',
      containerNumbers: [containerNumber],
    },
  }
}

/**
 * Creates an invoice document (non-matching type for no-link test).
 */
export function createInvoiceDocument(
  uniqueId: string = Date.now().toString()
): { content: string; expectedFields: { invoiceNumber: string; amount: string } } {
  const invoiceNumber = `INV-${uniqueId.slice(-8)}`
  const amount = '15000.00'

  const content = `
COMMERCIAL INVOICE
==================

Invoice Number: ${invoiceNumber}
Date: ${new Date().toISOString().split('T')[0]}

SELLER
------
Test Seller Company
123 Seller Street

BUYER
-----
Test Buyer Company
456 Buyer Avenue

ITEMS
-----
1. Integration Test Goods - USD ${amount}

TOTAL: USD ${amount}

Invoice Ref: ${invoiceNumber}
`

  return {
    content,
    expectedFields: {
      invoiceNumber,
      amount,
    },
  }
}

/**
 * Creates a document with container numbers for matching.
 */
export function createDocumentWithContainerNumbers(
  containerNumbers: string[],
  uniqueId: string = Date.now().toString()
): { content: string; expectedFields: { containerNumbers: string[] } } {
  const containerList = containerNumbers.join(', ')

  const content = `
CONTAINER TRACKING DOCUMENT
===========================

Document ID: CTD-${uniqueId.slice(-8)}
Date: ${new Date().toISOString().split('T')[0]}

CONTAINERS
----------
${containerNumbers.map((cn, i) => `${i + 1}. Container: ${cn}`).join('\n')}

Container Numbers: ${containerList}

Tracking Reference: CTD-${uniqueId.slice(-8)}
`

  return {
    content,
    expectedFields: {
      containerNumbers,
    },
  }
}
