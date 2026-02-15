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
    description: z.string().describe('Description of the service/product'),
    quantity: z.number().optional().describe('Quantity'),
    unit: z.string().optional().describe('Unit of measure'),
    unit_price_net: z.number().optional().describe('Unit price before tax'),
    vat_rate: z.number().optional().describe('VAT/tax rate percentage'),
    net_amount: z.number().optional().describe('Net amount for this line'),
    vat_amount: z.number().optional().describe('VAT/tax amount for this line'),
    gross_amount: z.number().optional().describe('Gross amount including tax'),
  })).optional().describe('Invoice line items/charges'),

  totals: z.object({
    net_amount: z.number().optional().describe('Total net amount'),
    vat_amount: z.number().optional().describe('Total VAT amount'),
    gross_amount: z.number().optional().describe('Total gross amount'),
  }).optional().describe('Invoice totals'),

  currency: z.string().optional().describe('Currency code (ISO 4217)'),
  payment_terms: z.string().optional().describe('Payment terms/conditions'),
  bank_account: z.string().optional().describe('Bank account for payment'),

  transportation: z.object({
    bl_number: z.string().optional().describe('Bill of Lading number'),
    container_numbers: z.array(z.string()).optional().describe('Container numbers'),
    booking_number: z.string().optional().describe('Booking reference'),
    vessel_name: z.string().optional().describe('Vessel name'),
    voyage_number: z.string().optional().describe('Voyage number'),
  }).optional().describe('Transportation references if present'),
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
// Schema Registry
// ============================================================================

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>
export type BillOfLadingExtraction = z.infer<typeof billOfLadingExtractionSchema>
export type DeliveryNoteExtraction = z.infer<typeof deliveryNoteExtractionSchema>
export type CustomsDeclarationExtraction = z.infer<typeof customsDeclarationExtractionSchema>

const schemaMap: Record<string, z.ZodType> = {
  invoice: invoiceExtractionSchema,
  bill_of_lading: billOfLadingExtractionSchema,
  delivery_note: deliveryNoteExtractionSchema,
  customs_declaration: customsDeclarationExtractionSchema,
}

export function getExtractionSchema(documentType: DocumentType): z.ZodType | null {
  return schemaMap[documentType] ?? null
}

export function zodSchemaToJsonDescription(schema: z.ZodType): string {
  const zodObject = schema as z.ZodObject<z.ZodRawShape>
  if (!zodObject.shape) return '{}'

  const fields: string[] = []
  for (const [key, fieldSchema] of Object.entries(zodObject.shape)) {
    const desc = (fieldSchema as z.ZodType)._def?.description || key
    fields.push(`  "${key}": ${desc}`)
  }
  return `{\n${fields.join(',\n')}\n}`
}
