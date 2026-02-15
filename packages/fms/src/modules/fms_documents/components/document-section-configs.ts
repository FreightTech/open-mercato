import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'

export interface SectionConfig {
  id: string
  label: string
  dataPath: string
  type: 'object' | 'array' | 'flat'
  columns: ColumnDef[]
}

const readOnly = true

// ============================================================================
// Invoice Sections
// ============================================================================

const invoiceSections: SectionConfig[] = [
  {
    id: 'invoice-header',
    label: 'Invoice Details',
    dataPath: '',
    type: 'object',
    columns: [
      { data: 'invoice_number', title: 'Invoice Number', width: 180, readOnly },
      { data: 'invoice_date', title: 'Invoice Date', width: 130, readOnly },
      { data: 'due_date', title: 'Due Date', width: 130, readOnly },
      { data: 'service_date', title: 'Service Date', width: 130, readOnly },
      { data: 'currency', title: 'Currency', width: 100, readOnly },
    ],
  },
  {
    id: 'invoice-seller',
    label: 'Seller',
    dataPath: 'seller',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'tax_id', title: 'Tax ID', width: 150, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
    ],
  },
  {
    id: 'invoice-buyer',
    label: 'Buyer',
    dataPath: 'buyer',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'tax_id', title: 'Tax ID', width: 150, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
    ],
  },
  {
    id: 'invoice-totals',
    label: 'Totals',
    dataPath: 'totals',
    type: 'object',
    columns: [
      { data: 'net_amount', title: 'Net Amount', width: 150, readOnly, type: 'numeric' },
      { data: 'vat_amount', title: 'VAT Amount', width: 150, readOnly, type: 'numeric' },
      { data: 'gross_amount', title: 'Gross Amount', width: 150, readOnly, type: 'numeric' },
    ],
  },
  {
    id: 'invoice-line-items',
    label: 'Line Items',
    dataPath: 'line_items',
    type: 'array',
    columns: [
      { data: 'description', title: 'Description', width: 280, readOnly },
      { data: 'quantity', title: 'Qty', width: 80, readOnly, type: 'numeric' },
      { data: 'unit', title: 'Unit', width: 60, readOnly },
      { data: 'unit_price_net', title: 'Unit Price', width: 100, readOnly, type: 'numeric' },
      { data: 'vat_rate', title: 'VAT %', width: 70, readOnly, type: 'numeric' },
      { data: 'net_amount', title: 'Net', width: 110, readOnly, type: 'numeric' },
      { data: 'vat_amount', title: 'VAT', width: 100, readOnly, type: 'numeric' },
      { data: 'gross_amount', title: 'Gross', width: 110, readOnly, type: 'numeric' },
    ],
  },
  {
    id: 'invoice-transportation',
    label: 'Transportation',
    dataPath: 'transportation',
    type: 'object',
    columns: [
      { data: 'bl_number', title: 'B/L Number', width: 180, readOnly },
      { data: 'booking_number', title: 'Booking No.', width: 150, readOnly },
      { data: 'vessel_name', title: 'Vessel', width: 180, readOnly },
      { data: 'voyage_number', title: 'Voyage', width: 120, readOnly },
      { data: 'container_numbers', title: 'Containers', width: 200, readOnly },
    ],
  },
  {
    id: 'invoice-payment',
    label: 'Payment',
    dataPath: '',
    type: 'object',
    columns: [
      { data: 'payment_terms', title: 'Payment Terms', width: 250, readOnly },
      { data: 'bank_account', title: 'Bank Account', width: 300, readOnly },
    ],
  },
]

// ============================================================================
// Bill of Lading Sections
// ============================================================================

const billOfLadingSections: SectionConfig[] = [
  {
    id: 'bol-header',
    label: 'B/L Details',
    dataPath: '',
    type: 'object',
    columns: [
      { data: 'bl_number', title: 'B/L Number', width: 200, readOnly },
      { data: 'bl_type', title: 'B/L Type', width: 140, readOnly },
      { data: 'issue_date', title: 'Issue Date', width: 130, readOnly },
      { data: 'issue_place', title: 'Place of Issue', width: 180, readOnly },
      { data: 'booking_number', title: 'Booking No.', width: 150, readOnly },
      { data: 'freight_terms', title: 'Freight Terms', width: 120, readOnly },
    ],
  },
  {
    id: 'bol-shipper',
    label: 'Shipper',
    dataPath: 'shipper',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
      { data: 'contact', title: 'Contact', width: 200, readOnly },
    ],
  },
  {
    id: 'bol-consignee',
    label: 'Consignee',
    dataPath: 'consignee',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
      { data: 'contact', title: 'Contact', width: 200, readOnly },
    ],
  },
  {
    id: 'bol-notify-party',
    label: 'Notify Party',
    dataPath: 'notify_party',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
    ],
  },
  {
    id: 'bol-vessel',
    label: 'Vessel',
    dataPath: 'vessel',
    type: 'object',
    columns: [
      { data: 'name', title: 'Vessel Name', width: 200, readOnly },
      { data: 'imo_number', title: 'IMO Number', width: 130, readOnly },
      { data: 'flag', title: 'Flag', width: 100, readOnly },
      { data: 'voyage_number', title: 'Voyage', width: 130, readOnly },
    ],
  },
  {
    id: 'bol-routing',
    label: 'Routing',
    dataPath: 'routing',
    type: 'object',
    columns: [
      { data: 'port_of_loading', title: 'Port of Loading', width: 180, readOnly },
      { data: 'port_of_discharge', title: 'Port of Discharge', width: 180, readOnly },
      { data: 'place_of_receipt', title: 'Place of Receipt', width: 180, readOnly },
      { data: 'place_of_delivery', title: 'Place of Delivery', width: 180, readOnly },
      { data: 'transhipment_port', title: 'Transhipment', width: 150, readOnly },
    ],
  },
  {
    id: 'bol-dates',
    label: 'Dates',
    dataPath: 'dates',
    type: 'object',
    columns: [
      { data: 'shipped_on_board', title: 'On Board Date', width: 150, readOnly },
      { data: 'etd', title: 'ETD', width: 130, readOnly },
      { data: 'eta', title: 'ETA', width: 130, readOnly },
    ],
  },
  {
    id: 'bol-containers',
    label: 'Container Details',
    dataPath: 'container_details',
    type: 'array',
    columns: [
      { data: 'container_number', title: 'Container', width: 160, readOnly },
      { data: 'seal_number', title: 'Seal', width: 120, readOnly },
      { data: 'container_type', title: 'Type', width: 80, readOnly },
      { data: 'gross_weight', title: 'Gross Weight (kg)', width: 140, readOnly, type: 'numeric' },
      { data: 'tare_weight', title: 'Tare Weight (kg)', width: 140, readOnly, type: 'numeric' },
      { data: 'packages', title: 'Packages', width: 100, readOnly, type: 'numeric' },
      { data: 'package_type', title: 'Package Type', width: 120, readOnly },
    ],
  },
  {
    id: 'bol-carrier',
    label: 'Carrier',
    dataPath: 'carrier',
    type: 'object',
    columns: [
      { data: 'name', title: 'Carrier Name', width: 250, readOnly },
      { data: 'scac_code', title: 'SCAC Code', width: 120, readOnly },
    ],
  },
]

// ============================================================================
// Customs Declaration Sections
// ============================================================================

const customsDeclarationSections: SectionConfig[] = [
  {
    id: 'customs-header',
    label: 'Declaration Details',
    dataPath: '',
    type: 'object',
    columns: [
      { data: 'mrn_number', title: 'MRN Number', width: 200, readOnly },
      { data: 'declaration_type', title: 'Type', width: 130, readOnly },
      { data: 'declaration_date', title: 'Declaration Date', width: 140, readOnly },
      { data: 'acceptance_date', title: 'Acceptance Date', width: 140, readOnly },
      { data: 'release_date', title: 'Release Date', width: 140, readOnly },
    ],
  },
  {
    id: 'customs-declarant',
    label: 'Declarant',
    dataPath: 'declarant',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'eori_number', title: 'EORI', width: 150, readOnly },
      { data: 'tax_id', title: 'Tax ID', width: 150, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
    ],
  },
  {
    id: 'customs-exporter',
    label: 'Exporter',
    dataPath: 'exporter',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'country', title: 'Country', width: 120, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
    ],
  },
  {
    id: 'customs-office',
    label: 'Customs Office',
    dataPath: 'customs_office',
    type: 'object',
    columns: [
      { data: 'code', title: 'Office Code', width: 150, readOnly },
      { data: 'name', title: 'Office Name', width: 300, readOnly },
    ],
  },
  {
    id: 'customs-goods',
    label: 'Goods',
    dataPath: 'goods',
    type: 'array',
    columns: [
      { data: 'item_number', title: '#', width: 50, readOnly, type: 'numeric' },
      { data: 'description', title: 'Description', width: 250, readOnly },
      { data: 'hs_code', title: 'HS Code', width: 100, readOnly },
      { data: 'country_of_origin', title: 'Origin', width: 80, readOnly },
      { data: 'net_weight', title: 'Net (kg)', width: 100, readOnly, type: 'numeric' },
      { data: 'gross_weight', title: 'Gross (kg)', width: 100, readOnly, type: 'numeric' },
      { data: 'customs_value', title: 'Customs Value', width: 120, readOnly, type: 'numeric' },
      { data: 'duty_amount', title: 'Duty', width: 100, readOnly, type: 'numeric' },
      { data: 'vat_amount', title: 'VAT', width: 100, readOnly, type: 'numeric' },
    ],
  },
  {
    id: 'customs-totals',
    label: 'Totals',
    dataPath: 'totals',
    type: 'object',
    columns: [
      { data: 'total_packages', title: 'Packages', width: 100, readOnly, type: 'numeric' },
      { data: 'total_gross_weight', title: 'Gross Weight', width: 120, readOnly, type: 'numeric' },
      { data: 'total_customs_value', title: 'Customs Value', width: 130, readOnly, type: 'numeric' },
      { data: 'total_duty', title: 'Total Duty', width: 120, readOnly, type: 'numeric' },
      { data: 'total_vat', title: 'Total VAT', width: 120, readOnly, type: 'numeric' },
      { data: 'currency', title: 'Currency', width: 100, readOnly },
    ],
  },
  {
    id: 'customs-transportation',
    label: 'Transportation',
    dataPath: 'transportation',
    type: 'object',
    columns: [
      { data: 'mode', title: 'Mode', width: 100, readOnly },
      { data: 'bl_number', title: 'B/L Number', width: 180, readOnly },
      { data: 'vessel_name', title: 'Vessel', width: 180, readOnly },
      { data: 'voyage_number', title: 'Voyage', width: 120, readOnly },
      { data: 'awb_number', title: 'AWB', width: 150, readOnly },
      { data: 'cmr_number', title: 'CMR', width: 150, readOnly },
    ],
  },
  {
    id: 'customs-prev-docs',
    label: 'Previous Documents',
    dataPath: 'previous_documents',
    type: 'array',
    columns: [
      { data: 'type', title: 'Document Type', width: 150, readOnly },
      { data: 'reference', title: 'Reference', width: 300, readOnly },
    ],
  },
]

// ============================================================================
// Delivery Note Sections
// ============================================================================

const deliveryNoteSections: SectionConfig[] = [
  {
    id: 'dn-header',
    label: 'Delivery Note Details',
    dataPath: '',
    type: 'object',
    columns: [
      { data: 'dn_number', title: 'D/N Number', width: 200, readOnly },
      { data: 'delivery_date', title: 'Delivery Date', width: 140, readOnly },
      { data: 'notes', title: 'Notes', width: 400, readOnly },
    ],
  },
  {
    id: 'dn-sender',
    label: 'Sender',
    dataPath: 'sender',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
      { data: 'contact', title: 'Contact', width: 200, readOnly },
    ],
  },
  {
    id: 'dn-receiver',
    label: 'Receiver',
    dataPath: 'receiver',
    type: 'object',
    columns: [
      { data: 'name', title: 'Name', width: 250, readOnly },
      { data: 'address', title: 'Address', width: 300, readOnly },
      { data: 'contact', title: 'Contact', width: 200, readOnly },
    ],
  },
  {
    id: 'dn-items',
    label: 'Items',
    dataPath: 'items',
    type: 'array',
    columns: [
      { data: 'description', title: 'Description', width: 250, readOnly },
      { data: 'sku', title: 'SKU', width: 120, readOnly },
      { data: 'quantity', title: 'Qty', width: 80, readOnly, type: 'numeric' },
      { data: 'unit', title: 'Unit', width: 60, readOnly },
      { data: 'weight', title: 'Weight (kg)', width: 110, readOnly, type: 'numeric' },
      { data: 'dimensions', title: 'Dimensions', width: 130, readOnly },
      { data: 'package_type', title: 'Package Type', width: 120, readOnly },
    ],
  },
  {
    id: 'dn-totals',
    label: 'Totals',
    dataPath: 'totals',
    type: 'object',
    columns: [
      { data: 'total_packages', title: 'Packages', width: 120, readOnly, type: 'numeric' },
      { data: 'total_weight', title: 'Weight (kg)', width: 120, readOnly, type: 'numeric' },
      { data: 'total_volume', title: 'Volume (cbm)', width: 120, readOnly, type: 'numeric' },
    ],
  },
  {
    id: 'dn-references',
    label: 'References',
    dataPath: 'references',
    type: 'object',
    columns: [
      { data: 'bl_number', title: 'B/L Number', width: 180, readOnly },
      { data: 'container_number', title: 'Container', width: 160, readOnly },
      { data: 'order_number', title: 'Order No.', width: 150, readOnly },
      { data: 'invoice_number', title: 'Invoice No.', width: 150, readOnly },
    ],
  },
  {
    id: 'dn-vehicle',
    label: 'Vehicle',
    dataPath: 'vehicle',
    type: 'object',
    columns: [
      { data: 'plate_number', title: 'Plate Number', width: 150, readOnly },
      { data: 'driver_name', title: 'Driver', width: 200, readOnly },
      { data: 'trailer_number', title: 'Trailer', width: 150, readOnly },
    ],
  },
]

// ============================================================================
// Registry
// ============================================================================

const sectionsByType: Record<string, SectionConfig[]> = {
  invoice: invoiceSections,
  bill_of_lading: billOfLadingSections,
  customs_declaration: customsDeclarationSections,
  delivery_note: deliveryNoteSections,
}

export function getSectionsForType(documentType: string | null | undefined): SectionConfig[] | null {
  if (!documentType || documentType === 'unknown') return null
  return sectionsByType[documentType] ?? null
}

export function buildFlatSections(data: Record<string, unknown>): SectionConfig[] {
  return [
    {
      id: 'flat-data',
      label: 'Extracted Data',
      dataPath: '',
      type: 'flat',
      columns: [
        { data: 'field', title: 'Field', width: 200, readOnly: true },
        { data: 'value', title: 'Value', width: 400, readOnly: true },
      ],
    },
  ]
}
