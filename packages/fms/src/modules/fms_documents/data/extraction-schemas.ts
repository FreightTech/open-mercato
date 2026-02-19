import { z } from 'zod'
import type { DocumentType } from './schema-types'

// ============================================================================
// Invoice Extraction Schema
// ============================================================================

export const invoiceExtractionSchema = z.object({
  invoice_number: z.string().optional().describe('Invoice number/identifier'),
  invoice_date: z.string().optional().describe('Date the invoice was issued (ISO format)'),
  due_date: z.string().optional().describe('Payment due date (ISO format)'),
  service_date: z.string().optional().describe('Date of service delivery (ISO format)'),

  seller: z.object({
    name: z.string().optional().describe('Company name'),
    tax_id: z.string().optional().describe('Tax identification number (NIP, VAT ID)'),
    address: z.string().optional().describe('Full address'),
  }).optional().describe('Seller/vendor information'),

  buyer: z.object({
    name: z.string().optional().describe('Company name'),
    tax_id: z.string().optional().describe('Tax identification number'),
    address: z.string().optional().describe('Full address'),
  }).optional().describe('Buyer/customer information'),

  line_items: z.array(z.object({
    description: z.string().describe('Description of the service/product/charge. For shipping invoices: the charge name like SEAFREIGHT, TERMINAL HANDLING CHARGE, BUNKER RECOVERY CHARGE, DOCUMENTATION FEE, ISPS, DEMURRAGE, etc. This field is REQUIRED for every line item.'),
    quantity: z.number().optional().describe('Quantity as a number. For shipping invoices with format "7 x 20DV", extract only the number (7). For "1 x BL", extract 1.'),
    unit: z.string().optional().describe('Unit of measure. For shipping invoices with format "7 x 20DV", extract the unit part (20DV, 40HC, BL, etc.)'),
    unit_price_net: z.number().optional().describe('Unit price/rate before tax. On shipping invoices this is the "Rate" column.'),
    vat_rate: z.number().optional().describe('VAT/tax rate percentage'),
    net_amount: z.number().optional().describe('Net amount for this line. On shipping invoices this may be the "Total" or "Total EUR" column.'),
    vat_amount: z.number().optional().describe('VAT/tax amount for this line'),
    gross_amount: z.number().optional().describe('Gross amount including tax'),
    currency: z.string().optional().describe('Currency code for this line item (ISO 4217, e.g. PLN, USD, EUR)'),
  })).optional().describe('Invoice line items/charges. IMPORTANT: Extract ALL line items with their full details including description, quantity, rate/unit_price, and amounts. Do not leave fields empty if the data is visible in the document.'),

  totals: z.object({
    net_amount: z.number().optional().describe('Total net amount'),
    vat_amount: z.number().optional().describe('Total VAT amount'),
    gross_amount: z.number().optional().describe('Total gross amount'),
    currency: z.string().optional().describe('Currency code of totals (ISO 4217)'),
  }).optional().describe('Invoice totals'),

  currency: z.string().optional().describe('Primary document currency code (ISO 4217, e.g. PLN, USD, EUR). Must be a single string, not an object'),
  payment_terms: z.string().optional().describe('Payment terms/conditions'),
  bank_account: z.string().optional().describe('Bank account for payment'),

  transportation: z.object({
    hbl_number: z.string().optional().describe('House Bill of Lading number (HBL)'),
    mbl_number: z.string().optional().describe('Master Bill of Lading number (MBL)'),
    booking_number: z.string().optional().describe('Booking reference number'),
    container_numbers: z.array(z.string()).optional().describe('Container numbers (e.g. WNGU2592024)'),
    vessel_name: z.string().optional().describe('Vessel/ship name'),
    voyage_number: z.string().optional().describe('Voyage number'),
    port_of_loading: z.string().optional().describe('Port of loading (POL)'),
    port_of_discharge: z.string().optional().describe('Port of discharge (POD)'),
    etd: z.string().optional().describe('Estimated time of departure (ISO date)'),
    eta: z.string().optional().describe('Estimated time of arrival (ISO date)'),
  }).optional().describe('Shipping/transportation references if present on the document'),
})

// ============================================================================
// Bill of Lading Extraction Schema
// ============================================================================

export const billOfLadingExtractionSchema = z.object({
  bl_number: z.string().optional().describe('Bill of Lading number'),
  bl_type: z.enum(['original', 'copy', 'telex_release', 'sea_waybill', 'express']).optional().describe('Type of Bill of Lading'),
  issue_date: z.string().optional().describe('Date B/L was issued (ISO format)'),
  issue_place: z.string().optional().describe('Place of issue'),

  shipper: z.object({
    name: z.string().optional().describe('Shipper company name'),
    address: z.string().optional().describe('Full address'),
    contact: z.string().optional().describe('Contact information'),
  }).optional().describe('Shipper information'),

  consignee: z.object({
    name: z.string().optional().describe('Consignee company name'),
    address: z.string().optional().describe('Full address'),
    contact: z.string().optional().describe('Contact information'),
  }).optional().describe('Consignee information'),

  notify_party: z.object({
    name: z.string().optional().describe('Notify party name'),
    address: z.string().optional().describe('Full address'),
  }).optional().describe('Notify party information'),

  vessel: z.object({
    name: z.string().optional().describe('Vessel name'),
    imo_number: z.string().optional().describe('IMO number'),
    flag: z.string().optional().describe('Flag state'),
    voyage_number: z.string().optional().describe('Voyage number'),
  }).optional().describe('Vessel information'),

  routing: z.object({
    port_of_loading: z.string().optional().describe('Port of Loading (POL)'),
    port_of_discharge: z.string().optional().describe('Port of Discharge (POD)'),
    place_of_receipt: z.string().optional().describe('Place of receipt'),
    place_of_delivery: z.string().optional().describe('Final place of delivery'),
    transhipment_port: z.string().optional().describe('Transhipment port if any'),
  }).optional().describe('Port routing information'),

  dates: z.object({
    shipped_on_board: z.string().optional().describe('On board date (ISO format)'),
    etd: z.string().optional().describe('Estimated Time of Departure (ISO format)'),
    eta: z.string().optional().describe('Estimated Time of Arrival (ISO format)'),
  }).optional().describe('Shipping dates'),

  container_details: z.array(z.object({
    container_number: z.string().describe('Container number (ISO 6346)'),
    seal_number: z.string().optional().describe('Seal number'),
    container_type: z.string().optional().describe('Container type (20GP, 40HC, etc.)'),
    gross_weight: z.number().optional().describe('Gross weight in kg'),
    tare_weight: z.number().optional().describe('Tare weight in kg'),
    packages: z.number().optional().describe('Number of packages'),
    package_type: z.string().optional().describe('Type of packages'),
  })).optional().describe('Container details'),

  cargo_description: z.string().optional().describe('Description of goods'),

  freight_terms: z.enum(['prepaid', 'collect', 'third_party']).optional().describe('Freight payment terms'),

  carrier: z.object({
    name: z.string().optional().describe('Carrier company name'),
    scac_code: z.string().optional().describe('SCAC code'),
  }).optional().describe('Carrier information'),

  booking_number: z.string().optional().describe('Booking reference number'),
})

// ============================================================================
// Delivery Note Extraction Schema
// ============================================================================

export const deliveryNoteExtractionSchema = z.object({
  dn_number: z.string().optional().describe('Delivery Note number'),
  delivery_date: z.string().optional().describe('Date of delivery (ISO format)'),

  sender: z.object({
    name: z.string().optional().describe('Sender company name'),
    address: z.string().optional().describe('Warehouse/sender address'),
    contact: z.string().optional().describe('Contact information'),
  }).optional().describe('Sender/warehouse information'),

  receiver: z.object({
    name: z.string().optional().describe('Receiver company name'),
    address: z.string().optional().describe('Delivery address'),
    contact: z.string().optional().describe('Contact person'),
    signature: z.boolean().optional().describe('Whether receiver signature is present'),
  }).optional().describe('Receiver information'),

  items: z.array(z.object({
    description: z.string().describe('Item description'),
    sku: z.string().optional().describe('SKU/article number'),
    quantity: z.number().describe('Quantity delivered'),
    unit: z.string().optional().describe('Unit of measure'),
    weight: z.number().optional().describe('Weight in kg'),
    dimensions: z.string().optional().describe('Dimensions (LxWxH)'),
    package_type: z.string().optional().describe('Type of packaging'),
  })).optional().describe('Delivered items'),

  totals: z.object({
    total_packages: z.number().optional().describe('Total number of packages'),
    total_weight: z.number().optional().describe('Total weight in kg'),
    total_volume: z.number().optional().describe('Total volume in cbm'),
  }).optional().describe('Delivery totals'),

  references: z.object({
    bl_number: z.string().optional().describe('Bill of Lading reference'),
    container_number: z.string().optional().describe('Container number'),
    order_number: z.string().optional().describe('Purchase order reference'),
    invoice_number: z.string().optional().describe('Related invoice number'),
  }).optional().describe('Related document references'),

  vehicle: z.object({
    plate_number: z.string().optional().describe('Vehicle registration number'),
    driver_name: z.string().optional().describe('Driver name'),
    trailer_number: z.string().optional().describe('Trailer registration number'),
  }).optional().describe('Transport vehicle information'),

  notes: z.string().optional().describe('Additional notes or remarks'),
})

// ============================================================================
// Customs Declaration Extraction Schema
// ============================================================================

export const customsDeclarationExtractionSchema = z.object({
  mrn_number: z.string().optional().describe('Movement Reference Number'),
  declaration_type: z.enum(['import', 'export', 'transit', 'temporary_admission', 're-export']).optional().describe('Type of customs declaration'),
  declaration_date: z.string().optional().describe('Date of declaration (ISO format)'),
  acceptance_date: z.string().optional().describe('Date customs accepted the declaration (ISO format)'),
  release_date: z.string().optional().describe('Date goods were released (ISO format)'),

  declarant: z.object({
    name: z.string().optional().describe('Company name'),
    eori_number: z.string().optional().describe('EORI number'),
    tax_id: z.string().optional().describe('Tax identification number'),
    address: z.string().optional().describe('Company address'),
  }).optional().describe('Declarant/importer information'),

  exporter: z.object({
    name: z.string().optional().describe('Exporter company name'),
    country: z.string().optional().describe('Country of export'),
    address: z.string().optional().describe('Exporter address'),
  }).optional().describe('Exporter information'),

  customs_office: z.object({
    code: z.string().optional().describe('Customs office code'),
    name: z.string().optional().describe('Customs office name'),
  }).optional().describe('Customs office information'),

  goods: z.array(z.object({
    item_number: z.number().optional().describe('Item sequence number'),
    description: z.string().describe('Description of goods'),
    hs_code: z.string().describe('Harmonized System code'),
    country_of_origin: z.string().optional().describe('Country of origin code'),
    net_weight: z.number().optional().describe('Net weight in kg'),
    gross_weight: z.number().optional().describe('Gross weight in kg'),
    packages: z.number().optional().describe('Number of packages'),
    statistical_value: z.number().optional().describe('Statistical value'),
    customs_value: z.number().optional().describe('Customs value'),
    duty_amount: z.number().optional().describe('Duty amount'),
    vat_amount: z.number().optional().describe('VAT amount'),
  })).optional().describe('Goods declared'),

  totals: z.object({
    total_packages: z.number().optional().describe('Total packages'),
    total_gross_weight: z.number().optional().describe('Total gross weight'),
    total_customs_value: z.number().optional().describe('Total customs value'),
    total_duty: z.number().optional().describe('Total duty payable'),
    total_vat: z.number().optional().describe('Total VAT payable'),
    currency: z.string().optional().describe('Currency of values'),
  }).optional().describe('Declaration totals'),

  transportation: z.object({
    mode: z.enum(['sea', 'air', 'road', 'rail', 'multimodal']).optional().describe('Mode of transport'),
    bl_number: z.string().optional().describe('Bill of Lading number'),
    container_numbers: z.array(z.string()).optional().describe('Container numbers'),
    vessel_name: z.string().optional().describe('Vessel name'),
    voyage_number: z.string().optional().describe('Voyage/flight number'),
    awb_number: z.string().optional().describe('Air Waybill number'),
    cmr_number: z.string().optional().describe('CMR number (road transport)'),
  }).optional().describe('Transportation details'),

  previous_documents: z.array(z.object({
    type: z.string().describe('Document type (T1, T2, etc.)'),
    reference: z.string().describe('Document reference number'),
  })).optional().describe('Previous document references'),
})

// ============================================================================
// Booking Confirmation Extraction Schema
// ============================================================================

export const bookingConfirmationExtractionSchema = z.object({
  booking_number: z.string().optional().describe('Booking reference number'),

  carrier: z.object({
    name: z.string().optional().describe('Carrier company name'),
    scac_code: z.string().optional().describe('SCAC code'),
  }).optional().describe('Carrier information'),

  vessel: z.object({
    name: z.string().optional().describe('Vessel name'),
    voyage_number: z.string().optional().describe('Voyage number'),
    service_code: z.string().optional().describe('Service/route code'),
    flag: z.string().optional().describe('Vessel flag state'),
  }).optional().describe('Vessel information'),

  routing: z.object({
    place_of_receipt: z.string().optional().describe('Place of receipt'),
    port_of_loading: z.string().optional().describe('Port of Loading'),
    port_of_discharge: z.string().optional().describe('Port of Discharge'),
    place_of_delivery: z.string().optional().describe('Final place of delivery'),
  }).optional().describe('Routing information'),

  dates: z.object({
    etd: z.string().optional().describe('Estimated Time of Departure (ISO format)'),
    eta: z.string().optional().describe('Estimated Time of Arrival (ISO format)'),
    cutoff_vgm: z.string().optional().describe('VGM cutoff date/time (ISO format)'),
    cutoff_si: z.string().optional().describe('Shipping Instructions cutoff (ISO format)'),
    cutoff_cy: z.string().optional().describe('Container Yard cutoff (ISO format)'),
  }).optional().describe('Key dates'),

  containers: z.array(z.object({
    type: z.string().describe('Container size/type as ISO code: 20GP, 40GP, 40HC, 45HC, 20RF, 40RF, 40OT, 20OT, 20FR, 40FR. Normalize from text like "40\' Hi-Cube" to "40HC", "20\' Standard" to "20GP", "40\' Reefer" to "40RF"'),
    quantity: z.number().describe('Number of containers of this type'),
  })).optional().describe('Booked containers by type'),

  cargo: z.object({
    nature: z.string().optional().describe('Cargo nature (e.g. General, Dangerous, Reefer)'),
    description: z.string().optional().describe('Cargo description'),
    weight_kg: z.number().optional().describe('Total cargo weight in kilograms'),
    traffic_mode: z.string().optional().describe('Traffic mode (e.g. FCL/FCL, LCL/LCL)'),
    soc_indicator: z.string().optional().describe('Shipper Owned Container indicator (Y/N)'),
  }).optional().describe('Cargo information'),

  shipper: z.object({
    name: z.string().optional().describe('Shipper name'),
    address: z.string().optional().describe('Shipper address'),
  }).optional().describe('Shipper information'),

  consignee: z.object({
    name: z.string().optional().describe('Consignee name'),
    address: z.string().optional().describe('Consignee address'),
  }).optional().describe('Consignee information'),

  cargo_description: z.string().optional().describe('Description of cargo (legacy, prefer cargo.description)'),
  booking_party: z.string().optional().describe('Party who made the booking'),
  special_instructions: z.string().optional().describe('Special handling instructions'),
})

// ============================================================================
// Packing List Extraction Schema
// ============================================================================

export const packingListExtractionSchema = z.object({
  packing_list_number: z.string().optional().describe('Packing list number/reference'),
  date: z.string().optional().describe('Packing list date (ISO format)'),

  shipper: z.object({
    name: z.string().optional().describe('Shipper name'),
    address: z.string().optional().describe('Shipper address'),
  }).optional().describe('Shipper/exporter information'),

  consignee: z.object({
    name: z.string().optional().describe('Consignee name'),
    address: z.string().optional().describe('Consignee address'),
  }).optional().describe('Consignee information'),

  invoice_reference: z.string().optional().describe('Related invoice number'),

  containers: z.array(z.object({
    container_number: z.string().optional().describe('Container number (ISO 6346)'),
    seal_number: z.string().optional().describe('Seal number'),
    items: z.array(z.object({
      description: z.string().describe('Item description'),
      quantity: z.number().optional().describe('Quantity'),
      unit: z.string().optional().describe('Unit of measure'),
      gross_weight: z.number().optional().describe('Gross weight in kg'),
      net_weight: z.number().optional().describe('Net weight in kg'),
      package_type: z.string().optional().describe('Package type'),
      packages: z.number().optional().describe('Number of packages'),
    })).optional().describe('Items in this container'),
  })).optional().describe('Container details with packed items'),

  totals: z.object({
    total_packages: z.number().optional().describe('Total number of packages'),
    total_gross_weight: z.number().optional().describe('Total gross weight in kg'),
    total_net_weight: z.number().optional().describe('Total net weight in kg'),
    total_volume: z.number().optional().describe('Total volume in cbm'),
  }).optional().describe('Packing list totals'),

  delivery_terms: z.string().optional().describe('Delivery/Incoterms'),
  etd: z.string().optional().describe('Estimated Time of Departure (ISO format)'),
  eta: z.string().optional().describe('Estimated Time of Arrival (ISO format)'),
})

// ============================================================================
// VGM Certificate Extraction Schema
// ============================================================================

export const vgmCertificateExtractionSchema = z.object({
  container_number: z.string().optional().describe('Container number (ISO 6346)'),
  seal_number: z.string().optional().describe('Seal number'),

  verified_gross_mass_kg: z.number().optional().describe('Verified Gross Mass in kg'),
  tare_weight_kg: z.number().optional().describe('Container tare weight in kg'),
  cargo_weight_kg: z.number().optional().describe('Cargo/payload weight in kg'),

  weighing_method: z.enum(['1', '2']).optional().describe('SOLAS weighing method (1 = weigh whole container, 2 = weigh all cargo + tare)'),
  weighing_date: z.string().optional().describe('Date of weighing (ISO format)'),

  submitting_company: z.object({
    name: z.string().optional().describe('Company name'),
    address: z.string().optional().describe('Company address'),
  }).optional().describe('Company submitting the VGM'),

  authorized_person: z.object({
    name: z.string().optional().describe('Person name'),
    title: z.string().optional().describe('Job title'),
  }).optional().describe('Authorized signatory'),

  booking_number: z.string().optional().describe('Booking reference number'),
  vessel_name: z.string().optional().describe('Vessel name'),
  voyage_number: z.string().optional().describe('Voyage number'),
})

// ============================================================================
// Schema Registry
// ============================================================================

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>
export type BillOfLadingExtraction = z.infer<typeof billOfLadingExtractionSchema>
export type DeliveryNoteExtraction = z.infer<typeof deliveryNoteExtractionSchema>
export type CustomsDeclarationExtraction = z.infer<typeof customsDeclarationExtractionSchema>
export type BookingConfirmationExtraction = z.infer<typeof bookingConfirmationExtractionSchema>
export type PackingListExtraction = z.infer<typeof packingListExtractionSchema>
export type VgmCertificateExtraction = z.infer<typeof vgmCertificateExtractionSchema>

const schemaMap: Record<string, z.ZodType> = {
  invoice: invoiceExtractionSchema,
  bill_of_lading: billOfLadingExtractionSchema,
  delivery_note: deliveryNoteExtractionSchema,
  customs_declaration: customsDeclarationExtractionSchema,
  booking_confirmation: bookingConfirmationExtractionSchema,
  packing_list: packingListExtractionSchema,
  vgm_certificate: vgmCertificateExtractionSchema,
}

export function getExtractionSchema(documentType: DocumentType): z.ZodType | null {
  return schemaMap[documentType] ?? null
}

export function zodSchemaToJsonDescription(schema: z.ZodType, indent = 0): string {
  const pad = '  '.repeat(indent)
  const innerPad = '  '.repeat(indent + 1)

  // Unwrap optional/nullable wrappers
  let inner: any = schema
  while (inner?._def?.innerType) {
    inner = inner._def.innerType
  }

  const zodObject = inner as z.ZodObject<z.ZodRawShape>
  if (!zodObject.shape) return '{}'

  const fields: string[] = []
  for (const [key, fieldSchema] of Object.entries(zodObject.shape)) {
    let unwrapped: any = fieldSchema
    while (unwrapped?._def?.innerType) {
      unwrapped = unwrapped._def.innerType
    }

    const desc = (fieldSchema as any)._def?.description || key

    // Check if it's a nested ZodObject
    if (unwrapped?.shape && typeof unwrapped.shape === 'object') {
      const nested = zodSchemaToJsonDescription(unwrapped, indent + 1)
      fields.push(`${innerPad}"${key}": ${nested}  // ${desc}`)
    }
    // Check if it's a ZodArray with object items
    else if (unwrapped?._def?.type?.shape) {
      const nested = zodSchemaToJsonDescription(unwrapped._def.type, indent + 1)
      fields.push(`${innerPad}"${key}": [${nested}]  // ${desc}`)
    }
    else {
      fields.push(`${innerPad}"${key}": ${desc}`)
    }
  }
  return `{\n${fields.join(',\n')}\n${pad}}`
}
