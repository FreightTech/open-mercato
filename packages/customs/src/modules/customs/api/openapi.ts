import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

const errorSchema = z.object({
  error: z.string(),
})

const okSchema = z.object({
  ok: z.literal(true),
})

const shipmentItemSchema = z.object({
  id: z.string(),
  status: z.enum(['uploading', 'parsing', 'ready', 'error']),
  blNumber: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  shipperName: z.string().nullable(),
  consigneeName: z.string().nullable(),
  loadingPort: z.string().nullable(),
  dischargePort: z.string().nullable(),
  vessel: z.string().nullable(),
  createdAt: z.string(),
})

const shipmentListResponseSchema = z.object({
  items: z.array(shipmentItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

const shipmentCreateResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
})

export const shipmentsListOpenApi: OpenApiRouteDoc = {
  summary: 'Customs shipment cases',
  description: 'Manage customs clearance cases with document upload, parsing, consistency checking, and HS classification.',
  methods: {
    GET: {
      summary: 'List customs shipment cases',
      description: 'Returns paginated list of customs shipment cases.',
      responses: [
        { status: 200, description: 'Shipment list', schema: shipmentListResponseSchema },
      ],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Create customs shipment case',
      description: 'Upload B/L, Invoice, and Packing List PDFs to create a new clearance case. Parsing and consistency checking trigger automatically.',
      requestBody: {
        contentType: 'multipart/form-data',
        schema: z.object({
          bl: z.string().describe('Bill of Lading PDF file'),
          invoice: z.string().describe('Commercial Invoice PDF file'),
          packingList: z.string().describe('Packing List PDF file'),
        }),
      },
      responses: [
        { status: 201, description: 'Case created, parsing in progress', schema: shipmentCreateResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Missing required files', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}

export const shipmentDetailOpenApi: OpenApiRouteDoc = {
  summary: 'Customs shipment detail',
  description: 'Get or delete a customs shipment case.',
  methods: {
    GET: {
      summary: 'Get shipment case details',
      description: 'Returns full case detail including parsed documents, consistency checks, and HS classifications.',
      responses: [
        { status: 200, description: 'Case details' },
      ],
      errors: [
        { status: 404, description: 'Case not found', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete shipment case',
      description: 'Soft-deletes a customs shipment case.',
      responses: [
        { status: 200, description: 'Case deleted', schema: okSchema },
      ],
      errors: [
        { status: 404, description: 'Case not found', schema: errorSchema },
      ],
    },
  },
}

export const reparseOpenApi: OpenApiRouteDoc = {
  summary: 'Re-parse shipment documents',
  methods: {
    POST: {
      summary: 'Re-parse documents',
      description: 'Re-run AI parsing on all documents in this shipment case.',
      responses: [
        { status: 200, description: 'Parsing restarted', schema: okSchema },
      ],
      errors: [
        { status: 404, description: 'Case not found', schema: errorSchema },
      ],
    },
  },
}

export const consistencyOpenApi: OpenApiRouteDoc = {
  summary: 'Consistency check results',
  methods: {
    GET: {
      summary: 'Get consistency check results',
      description: 'Returns cross-document consistency check results for a shipment case.',
      responses: [
        { status: 200, description: 'Consistency check results' },
      ],
      errors: [
        { status: 404, description: 'Case not found', schema: errorSchema },
      ],
    },
  },
}

export const classifyOpenApi: OpenApiRouteDoc = {
  summary: 'HS code classification',
  methods: {
    POST: {
      summary: 'Run HS classification',
      description: 'Runs AI-powered HS code classification for all product lines, enriched with ISZTAR4 tariff data.',
      responses: [
        { status: 200, description: 'Classification results' },
      ],
      errors: [
        { status: 404, description: 'Case not found', schema: errorSchema },
      ],
    },
  },
}

export const selectHsOpenApi: OpenApiRouteDoc = {
  summary: 'Select HS code for product line',
  methods: {
    POST: {
      summary: 'Select HS code',
      description: 'Agent selects an HS code for a specific product line.',
      responses: [
        { status: 200, description: 'HS code selected', schema: okSchema },
      ],
      errors: [
        { status: 404, description: 'Classification not found', schema: errorSchema },
      ],
    },
  },
}

export const batchUploadOpenApi: OpenApiRouteDoc = {
  summary: 'Batch upload shipment documents',
  description: 'Upload multiple PDFs at once. Auto-detects document types from filenames and groups them into shipment cases.',
  methods: {
    POST: {
      summary: 'Batch create shipment cases',
      description: 'Upload multiple B/L, Invoice, and Packing List PDFs. Files are auto-detected by filename patterns and grouped into shipments. Each group creates a separate clearance case.',
      requestBody: {
        contentType: 'multipart/form-data',
        schema: z.object({
          file_0: z.string().describe('First PDF file'),
          meta_0: z.string().describe('JSON metadata: { groupId, docType }'),
        }),
      },
      responses: [
        {
          status: 201,
          description: 'Batch created',
          schema: z.object({
            ok: z.literal(true),
            shipments: z.array(z.object({
              id: z.string(),
              groupId: z.string(),
              fileCount: z.number(),
            })),
            totalGroups: z.number(),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'No valid files or groups', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}

export const exportOpenApi: OpenApiRouteDoc = {
  summary: 'Export shipment summary',
  methods: {
    GET: {
      summary: 'Export case summary',
      description: 'Returns full case summary as JSON for downstream processing.',
      responses: [
        { status: 200, description: 'Export data' },
      ],
      errors: [
        { status: 404, description: 'Case not found', schema: errorSchema },
      ],
    },
  },
}

export const documentFileOpenApi: OpenApiRouteDoc = {
  summary: 'Get document PDF file data',
  methods: {
    GET: {
      summary: 'Get PDF file data for a parsed document',
      description: 'Returns the base64-encoded PDF file data for visual proof verification.',
      responses: [
        {
          status: 200,
          description: 'Document file data',
          schema: z.object({
            fileData: z.string(),
            fileName: z.string(),
            documentType: z.string(),
          }),
        },
      ],
      errors: [
        { status: 404, description: 'Document not found', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
