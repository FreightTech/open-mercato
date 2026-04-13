/**
 * Seed script for Set 4 demo data (JCB 455ZX Wheel Loaders, India → Gdynia)
 *
 * Run via: npx tsx apps/mercato/src/modules/customs/seed/seed-set4-demo.ts
 *
 * This script pre-populates a customs shipment case with:
 * - 3 parsed documents (B/L, Invoice, Packing List) with realistic extracted data
 * - Consistency checks with intentional mismatches (vessel, invoice ref, incoterms)
 * - HS classifications with AI suggestions and ISZTAR4 enrichment
 */

import type {
  NormalizedDocument,
  ProductLine,
  HsSuggestion,
  Isztar4EnrichedResult,
  ShipmentStatus,
  DocumentType,
  CheckStatus,
} from '../data/entities'

// ── Extracted data ──────────────────────────────────────────────────

const blExtracted: NormalizedDocument = {
  documentNumber: 'CMDU4567890',
  shipperName: 'JCB INDIA LIMITED',
  shipperAddress: 'Staffordshire, United Kingdom',
  consigneeName: 'UKRTRANSINVEST LLC',
  consigneeAddress: '04086 Kyiv, Ukraine',
  vessel: 'APL BARCELONA',
  voyageNumber: '0PEETW1MA',
  loadingPort: 'NHAVA SHEVA',
  dischargePort: 'GDYNIA',
  shippedOnBoard: '2026-03-15',
  containerNumbers: ['SEGU7625046', 'CRXU7686375'],
  totalGrossWeightKg: 35800,
  totalPackages: 2,
  incoterms: 'FREIGHT PREPAID',
  productLines: [
    {
      lineNumber: 1,
      description: 'JCB 455 I WHEELED LOADER',
      model: '455ZX',
      vinOrSerial: 'PUN455ZXKT3597405',
      engineNumber: 'U3273924',
      quantity: 1,
      unit: 'PIECE',
      grossWeightKg: 17900,
      hsCodeFromInvoice: '8429 51 00',
    },
    {
      lineNumber: 2,
      description: 'JCB 455 I WHEELED LOADER',
      model: '455ZX',
      vinOrSerial: 'PUN455ZXJT3597406',
      engineNumber: 'U2713825',
      quantity: 1,
      unit: 'PIECE',
      grossWeightKg: 17900,
      hsCodeFromInvoice: '8429 51 00',
    },
  ],
}

const invoiceExtracted: NormalizedDocument = {
  documentNumber: '98139446',
  documentDate: '2026-03-10',
  shipperName: 'JCB INDIA LIMITED',
  shipperAddress: 'Staffordshire, United Kingdom',
  consigneeName: 'UKRTRANSINVEST LLC',
  consigneeAddress: '04086 Kyiv, Ukraine',
  vessel: 'APL BARCELONA',
  loadingPort: 'NHAVA SHEVA',
  dischargePort: 'GDYNIA',
  incoterms: 'FOB',
  currency: 'GBP',
  totalValue: 183022,
  totalGrossWeightKg: 35800,
  totalNetWeightKg: 32000,
  totalPackages: 2,
  productLines: [
    {
      lineNumber: 1,
      description: 'JCB 455 I WHEELED LOADER',
      model: '455ZX',
      vinOrSerial: 'PUN455ZXKT3597405',
      engineNumber: 'U3273924',
      countryOfOrigin: 'India',
      quantity: 1,
      unit: 'PIECE',
      unitPrice: 91511,
      totalValue: 91511,
      currency: 'GBP',
      netWeightKg: 16000,
      grossWeightKg: 17900,
      hsCodeFromInvoice: '8429519900',
      incoterms: 'FOB',
    },
    {
      lineNumber: 2,
      description: 'JCB 455 I WHEELED LOADER',
      model: '455ZX',
      vinOrSerial: 'PUN455ZXJT3597406',
      engineNumber: 'U2713825',
      countryOfOrigin: 'India',
      quantity: 1,
      unit: 'PIECE',
      unitPrice: 91511,
      totalValue: 91511,
      currency: 'GBP',
      netWeightKg: 16000,
      grossWeightKg: 17900,
      hsCodeFromInvoice: '8429519900',
      incoterms: 'FOB',
    },
  ],
}

const packingListExtracted: NormalizedDocument = {
  documentDate: '2026-03-10',
  invoiceReference: '139446',
  vessel: 'CONTAINERSHIPS VIII',
  loadingPort: 'NHAVA SHEVA',
  dischargePort: 'GDYNIA',
  totalPackages: 2,
  totalNetWeightKg: 32000,
  totalGrossWeightKg: 35800,
  productLines: [
    {
      lineNumber: 1,
      description: 'JCB 455 I WHEELED LOADER',
      model: '455ZX',
      vinOrSerial: 'PUN455ZXKT3597405',
      engineNumber: 'U3273924',
      quantity: 1,
      unit: 'PIECE',
      netWeightKg: 16000,
      grossWeightKg: 17900,
    },
    {
      lineNumber: 2,
      description: 'JCB 455 I WHEELED LOADER',
      model: '455ZX',
      vinOrSerial: 'PUN455ZXJT3597406',
      engineNumber: 'U2713825',
      quantity: 1,
      unit: 'PIECE',
      netWeightKg: 16000,
      grossWeightKg: 17900,
    },
  ],
}

// ── Consistency checks ──────────────────────────────────────────────

const consistencyChecks: Array<{
  field: string
  label: string
  sourceDoc1: string
  sourceDoc2: string
  value1: unknown
  value2: unknown
  status: CheckStatus
  discrepancy: string | null
}> = [
  {
    field: 'totalGrossWeightKg',
    label: 'Total gross weight (B/L vs Packing List)',
    sourceDoc1: 'B/L',
    sourceDoc2: 'Packing List',
    value1: 35800,
    value2: 35800,
    status: 'ok',
    discrepancy: null,
  },
  {
    field: 'totalGrossWeightKg',
    label: 'Total gross weight (B/L vs Invoice)',
    sourceDoc1: 'B/L',
    sourceDoc2: 'Invoice',
    value1: 35800,
    value2: 35800,
    status: 'ok',
    discrepancy: null,
  },
  {
    field: 'totalNetWeightKg',
    label: 'Total net weight',
    sourceDoc1: 'Packing List',
    sourceDoc2: 'Invoice',
    value1: 32000,
    value2: 32000,
    status: 'ok',
    discrepancy: null,
  },
  {
    field: 'totalPackages',
    label: 'Total packages',
    sourceDoc1: 'B/L',
    sourceDoc2: 'Packing List',
    value1: 2,
    value2: 2,
    status: 'ok',
    discrepancy: null,
  },
  {
    field: 'vessel',
    label: 'Vessel name',
    sourceDoc1: 'B/L',
    sourceDoc2: 'Packing List',
    value1: 'APL BARCELONA',
    value2: 'CONTAINERSHIPS VIII',
    status: 'mismatch',
    discrepancy: "B/L: 'APL BARCELONA' vs Packing List: 'CONTAINERSHIPS VIII'",
  },
  {
    field: 'shipperName',
    label: 'Shipper name',
    sourceDoc1: 'B/L',
    sourceDoc2: 'Invoice',
    value1: 'JCB INDIA LIMITED',
    value2: 'JCB INDIA LIMITED',
    status: 'ok',
    discrepancy: null,
  },
  {
    field: 'consigneeName',
    label: 'Consignee name',
    sourceDoc1: 'B/L',
    sourceDoc2: 'Invoice',
    value1: 'UKRTRANSINVEST LLC',
    value2: 'UKRTRANSINVEST LLC',
    status: 'ok',
    discrepancy: null,
  },
  {
    field: 'invoiceReference',
    label: 'Invoice reference',
    sourceDoc1: 'Invoice',
    sourceDoc2: 'Packing List',
    value1: '98139446',
    value2: '139446',
    status: 'mismatch',
    discrepancy: "Invoice: '98139446' vs Packing List: '139446'",
  },
  {
    field: 'loadingPort',
    label: 'Loading port',
    sourceDoc1: 'B/L',
    sourceDoc2: 'Invoice',
    value1: 'NHAVA SHEVA',
    value2: 'NHAVA SHEVA',
    status: 'ok',
    discrepancy: null,
  },
  {
    field: 'productLineCount',
    label: 'Product line count',
    sourceDoc1: 'Invoice',
    sourceDoc2: 'Packing List',
    value1: 2,
    value2: 2,
    status: 'ok',
    discrepancy: null,
  },
]

// ── HS Classifications ──────────────────────────────────────────────

const aiSuggestions: HsSuggestion[] = [
  {
    hsCode: '8429510000',
    description: 'Front-end shovel loaders',
    reasoning: 'JCB 455ZX is a wheeled loader (front-end shovel loader). HS 8429.51 covers front-end shovel loaders. Declared by exporter as 8429 51 00.',
    confidence: 'high',
  },
  {
    hsCode: '8429520000',
    description: 'Machinery with a 360 degree revolving superstructure',
    reasoning: 'Alternative classification if the machine has 360-degree rotation capability, but JCB 455ZX is a standard wheel loader without full rotation.',
    confidence: 'low',
  },
  {
    hsCode: '8429590000',
    description: 'Other self-propelled mechanical shovels, excavators and shovel loaders',
    reasoning: 'Catch-all for self-propelled mechanical shovels not elsewhere classified. Less specific than 8429.51.',
    confidence: 'low',
  },
]

const isztar4Results: Isztar4EnrichedResult[] = [
  {
    code: '8429510000',
    description: 'Section XVI - Machinery and mechanical appliances; electrical equipment: NUCLEAR REACTORS, BOILERS, MACHINERY AND MECHANICAL APPLIANCES; PARTS THEREOF: Other moving, grading, levelling, scraping, excavating, tamping, compacting, extracting or boring machinery, for earth, minerals or ores; pile-drivers and pile-extractors; snow-ploughs and snow-blowers: - Mechanical shovels, excavators and shovel loaders: - - Front-end shovel loaders',
    dutyAmount: '0%',
    supplementaryUnit: 'p/st',
    valid: true,
  },
  {
    code: '8429520000',
    description: 'Machinery with a 360 degree revolving superstructure',
    dutyAmount: '0%',
    supplementaryUnit: 'p/st',
    valid: true,
  },
  {
    code: '8429590000',
    description: 'Other self-propelled mechanical shovels, excavators and shovel loaders',
    dutyAmount: '0%',
    supplementaryUnit: 'p/st',
    valid: true,
  },
]

// ── Export seed data structure ──────────────────────────────────────

export interface SeedShipment {
  status: ShipmentStatus
  blNumber: string
  invoiceNumber: string
  shipperName: string
  consigneeName: string
  loadingPort: string
  dischargePort: string
  vessel: string
  shippedOnBoard: string
  productLines: ProductLine[]
}

export interface SeedDocument {
  documentType: DocumentType
  fileName: string
  extracted: NormalizedDocument
}

export const seedShipment: SeedShipment = {
  status: 'ready',
  blNumber: 'CMDU4567890',
  invoiceNumber: '98139446',
  shipperName: 'JCB INDIA LIMITED',
  consigneeName: 'UKRTRANSINVEST LLC',
  loadingPort: 'NHAVA SHEVA',
  dischargePort: 'GDYNIA',
  vessel: 'APL BARCELONA',
  shippedOnBoard: '2026-03-15',
  productLines: invoiceExtracted.productLines ?? [],
}

export const seedDocuments: SeedDocument[] = [
  {
    documentType: 'bill_of_lading',
    fileName: 'set4-sea-waybill.pdf',
    extracted: blExtracted,
  },
  {
    documentType: 'commercial_invoice',
    fileName: 'set4-commercial-invoice.pdf',
    extracted: invoiceExtracted,
  },
  {
    documentType: 'packing_list',
    fileName: 'set4-packing-list.pdf',
    extracted: packingListExtracted,
  },
]

export const seedConsistencyChecks = consistencyChecks
export const seedAiSuggestions = aiSuggestions
export const seedIsztar4Results = isztar4Results
