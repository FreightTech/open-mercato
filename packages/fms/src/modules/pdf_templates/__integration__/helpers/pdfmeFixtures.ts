import type { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export type PdfTemplateType = 'offer'

export interface PdfmeTemplateInput {
  templateType: PdfTemplateType
  name: string
  description?: string
  templateJson: unknown
  previewImageUrl?: string
  isActive?: boolean
}

export interface PdfmeTemplateResponse {
  id: string
  templateType: string
  name: string
  description?: string | null
  templateJson: unknown
  previewImageUrl?: string | null
  isActive: boolean
  isDefault?: boolean
  createdAt?: string
  updatedAt?: string
  variables?: Array<{ name: string; type: string; description?: string }>
}

export interface PdfGenerateInput {
  templateId?: string
  templateType?: PdfTemplateType
  templateJson?: unknown
  inputs: Array<Record<string, unknown>>
}

/**
 * Creates a new pdfme template via API (POST).
 */
export async function createPdfmeTemplateFixture(
  request: APIRequestContext,
  token: string,
  data: PdfmeTemplateInput
): Promise<PdfmeTemplateResponse> {
  const response = await request.fetch(`${BASE_URL}/api/pdf_templates/pdfme`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })

  if (!response.ok()) {
    const error = await response.text()
    throw new Error(`Failed to create pdfme template: ${response.status()} - ${error}`)
  }

  return response.json()
}

/**
 * Updates or creates a pdfme template via API (PUT - upsert).
 */
export async function upsertPdfmeTemplateFixture(
  request: APIRequestContext,
  token: string,
  data: PdfmeTemplateInput
): Promise<PdfmeTemplateResponse> {
  const response = await request.fetch(`${BASE_URL}/api/pdf_templates/pdfme`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })

  if (!response.ok()) {
    const error = await response.text()
    throw new Error(`Failed to upsert pdfme template: ${response.status()} - ${error}`)
  }

  return response.json()
}

/**
 * Gets a pdfme template by type.
 */
export async function getPdfmeTemplateFixture(
  request: APIRequestContext,
  token: string,
  templateType: PdfTemplateType,
  options?: { includeDefault?: boolean; includeVariables?: boolean }
): Promise<PdfmeTemplateResponse | null> {
  const params = new URLSearchParams({ type: templateType })
  if (options?.includeDefault) params.set('includeDefault', 'true')
  if (options?.includeVariables) params.set('includeVariables', 'true')

  const response = await request.fetch(`${BASE_URL}/api/pdf_templates/pdfme?${params}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    return null
  }

  return response.json()
}

/**
 * Lists all pdfme templates.
 */
export async function listPdfmeTemplatesFixture(
  request: APIRequestContext,
  token: string
): Promise<{ items: PdfmeTemplateResponse[]; availableTypes: string[] }> {
  const response = await request.fetch(`${BASE_URL}/api/pdf_templates/pdfme`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    throw new Error(`Failed to list pdfme templates: ${response.status()}`)
  }

  return response.json()
}

/**
 * Deletes a pdfme template by type. Safe for cleanup - ignores errors.
 */
export async function deletePdfmeTemplateIfExists(
  request: APIRequestContext,
  token: string | null,
  templateType: PdfTemplateType
): Promise<void> {
  if (!token) return

  try {
    await request.fetch(`${BASE_URL}/api/pdf_templates/pdfme?type=${templateType}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Generates a PDF using the pdfme generate endpoint.
 */
export async function generatePdfFixture(
  request: APIRequestContext,
  token: string,
  data: PdfGenerateInput
): Promise<Buffer> {
  const response = await request.fetch(`${BASE_URL}/api/pdf_templates/pdfme/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })

  if (!response.ok()) {
    const error = await response.text()
    throw new Error(`Failed to generate PDF: ${response.status()} - ${error}`)
  }

  return Buffer.from(await response.body())
}

/**
 * Validates that a buffer is a valid PDF file.
 * PDF files start with "%PDF-" header.
 */
export function validatePdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 5) return false
  const header = buffer.subarray(0, 5).toString('utf-8')
  return header === '%PDF-'
}

/**
 * Creates a minimal valid pdfme template JSON for testing.
 */
export function createMinimalPdfmeTemplate(): unknown {
  return {
    basePdf: {
      width: 210,
      height: 297,
      padding: [10, 10, 10, 10],
    },
    schemas: [
      [
        {
          name: 'testField',
          type: 'text',
          position: { x: 10, y: 10 },
          width: 100,
          height: 20,
          fontSize: 12,
        },
      ],
    ],
  }
}

/**
 * Creates a pdfme template with multiple fields for testing.
 */
export function createTestOfferTemplate(): unknown {
  return {
    basePdf: {
      width: 210,
      height: 297,
      padding: [10, 10, 10, 10],
    },
    schemas: [
      [
        {
          name: 'offerNumber',
          type: 'text',
          position: { x: 10, y: 10 },
          width: 100,
          height: 15,
          fontSize: 18,
          fontWeight: 'bold',
        },
        {
          name: 'clientName',
          type: 'text',
          position: { x: 10, y: 30 },
          width: 150,
          height: 10,
          fontSize: 12,
        },
        {
          name: 'validUntil',
          type: 'text',
          position: { x: 10, y: 45 },
          width: 100,
          height: 10,
          fontSize: 10,
        },
        {
          name: 'totalAmount',
          type: 'text',
          position: { x: 10, y: 60 },
          width: 80,
          height: 15,
          fontSize: 14,
          fontWeight: 'bold',
        },
      ],
    ],
  }
}
