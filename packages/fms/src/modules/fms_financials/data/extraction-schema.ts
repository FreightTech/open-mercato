/**
 * JSON Schema for structured invoice data extraction via Mistral OCR
 *
 * This schema is passed to Mistral's document_annotation_format parameter
 * to extract structured data from invoice PDFs.
 */
export const INVOICE_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    invoice_number: {
      type: 'string',
      description: 'The invoice number or document number (e.g., "FV/2026/01/001", "INV-12345")',
    },
    invoice_date: {
      type: 'string',
      description: 'The invoice issue date in ISO 8601 format (YYYY-MM-DD)',
    },
    due_date: {
      type: 'string',
      description: 'The payment due date in ISO 8601 format (YYYY-MM-DD)',
    },
    service_date: {
      type: 'string',
      description: 'The service/delivery date or period in ISO 8601 format (YYYY-MM-DD)',
    },
    seller: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full company name of the seller/supplier',
        },
        tax_id: {
          type: 'string',
          description: 'Tax identification number (NIP in Poland, VAT ID, etc.)',
        },
        address: {
          type: 'string',
          description: 'Full address of the seller including street, city, postal code, country',
        },
      },
    },
    buyer: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full company name of the buyer/recipient',
        },
        tax_id: {
          type: 'string',
          description: 'Tax identification number of the buyer',
        },
        address: {
          type: 'string',
          description: 'Full address of the buyer',
        },
      },
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line_number: {
            type: 'integer',
            description: 'Sequential line number (1, 2, 3...)',
          },
          description: {
            type: 'string',
            description: 'Full description of the product or service',
          },
          quantity: {
            type: 'string',
            description: 'Quantity as a decimal string (e.g., "1", "2.5", "100")',
          },
          unit: {
            type: 'string',
            description: 'Unit of measure (e.g., "szt.", "kg", "m3", "hours", "pcs")',
          },
          unit_price_net: {
            type: 'string',
            description: 'Unit price before VAT as decimal string (e.g., "100.00")',
          },
          vat_rate: {
            type: 'string',
            description: 'VAT rate as percentage string (e.g., "23", "8", "0")',
          },
          net_amount: {
            type: 'string',
            description: 'Line total before VAT as decimal string',
          },
          vat_amount: {
            type: 'string',
            description: 'VAT amount for this line as decimal string',
          },
          gross_amount: {
            type: 'string',
            description: 'Line total including VAT as decimal string',
          },
        },
        required: ['description'],
      },
      description: 'Array of invoice line items/positions',
    },
    totals: {
      type: 'object',
      properties: {
        net_amount: {
          type: 'string',
          description: 'Total net amount (before VAT) as decimal string',
        },
        vat_amount: {
          type: 'string',
          description: 'Total VAT amount as decimal string',
        },
        gross_amount: {
          type: 'string',
          description: 'Total gross amount (including VAT) as decimal string',
        },
      },
    },
    currency: {
      type: 'string',
      description: 'Currency code in ISO 4217 format (e.g., "PLN", "EUR", "USD")',
    },
    payment_terms: {
      type: 'string',
      description: 'Payment terms or conditions mentioned on the invoice',
    },
    bank_account: {
      type: 'string',
      description: 'Bank account number for payment (IBAN or local format)',
    },
    reference_numbers: {
      type: 'array',
      items: {
        type: 'string',
      },
      description: 'Any reference numbers like PO number, booking reference, BL number, container number',
    },
  },
  required: ['line_items'],
}

/**
 * Type definition for the extracted data matching the schema
 */
export interface MistralExtractedInvoice {
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  service_date?: string
  seller?: {
    name?: string
    tax_id?: string
    address?: string
  }
  buyer?: {
    name?: string
    tax_id?: string
    address?: string
  }
  line_items: Array<{
    line_number?: number
    description: string
    quantity?: string
    unit?: string
    unit_price_net?: string
    vat_rate?: string
    net_amount?: string
    vat_amount?: string
    gross_amount?: string
  }>
  totals?: {
    net_amount?: string
    vat_amount?: string
    gross_amount?: string
  }
  currency?: string
  payment_terms?: string
  bank_account?: string
  reference_numbers?: string[]
}
