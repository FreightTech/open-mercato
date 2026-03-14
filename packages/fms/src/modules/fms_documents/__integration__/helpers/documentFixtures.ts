import type { APIRequestContext } from '@playwright/test'
import { randomUUID } from 'crypto'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * Creates a minimal valid PDF file with the given text content.
 */
function createMinimalPdf(textContent: string): Buffer {
  const lines = textContent.split('\n').filter((line) => line.trim())
  const textObjects = lines
    .map((line, i) => {
      const y = 800 - i * 14
      const escaped = line.replace(/[()\\]/g, '\\$&')
      return `BT /F1 12 Tf 50 ${y} Td (${escaped}) Tj ET`
    })
    .join('\n')

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${textObjects.length} >>
stream
${textObjects}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
%%EOF`
  return Buffer.from(pdf, 'utf-8')
}

/**
 * Uploads a document directly via the FMS upload endpoint using native fetch.
 * Playwright's request.fetch doesn't handle multipart binary data correctly,
 * so we use native fetch instead.
 */
async function uploadDocumentDirect(
  _request: APIRequestContext,
  token: string,
  input: CreateDocumentInput
): Promise<DocumentRecord | null> {
  const pdfContent = createMinimalPdf(`Test document: ${input.name}\nGenerated at: ${new Date().toISOString()}`)
  
  // Create a multipart form with the file and metadata
  const boundary = `----WebKitFormBoundary${randomUUID().replace(/-/g, '')}`
  
  // Build form parts
  const parts: string[] = []
  
  // Add file
  parts.push(`--${boundary}`)
  parts.push(`Content-Disposition: form-data; name="file"; filename="${input.name}.pdf"`)
  parts.push('Content-Type: application/pdf')
  parts.push('')
  
  // We need to handle binary data separately
  const textBeforeFile = parts.join('\r\n') + '\r\n'
  
  // Build remaining form fields
  const fieldParts: string[] = []
  fieldParts.push(`\r\n--${boundary}`)
  fieldParts.push(`Content-Disposition: form-data; name="name"`)
  fieldParts.push('')
  fieldParts.push(input.name)
  
  if (input.category) {
    fieldParts.push(`--${boundary}`)
    fieldParts.push(`Content-Disposition: form-data; name="category"`)
    fieldParts.push('')
    fieldParts.push(input.category)
  }
  
  if (input.description) {
    fieldParts.push(`--${boundary}`)
    fieldParts.push(`Content-Disposition: form-data; name="description"`)
    fieldParts.push('')
    fieldParts.push(input.description)
  }
  
  fieldParts.push(`--${boundary}--`)
  fieldParts.push('')
  
  const textAfterFile = fieldParts.join('\r\n')
  
  // Combine: text before file + file content + text after file
  const beforeBuffer = Buffer.from(textBeforeFile, 'utf-8')
  const afterBuffer = Buffer.from(textAfterFile, 'utf-8')
  const body = Buffer.concat([beforeBuffer, pdfContent, afterBuffer])
  
  // Use native fetch instead of Playwright's request.fetch for multipart uploads
  const response = await fetch(`${BASE_URL}/api/fms_documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: body,
  })

  if (!response.ok) {
    console.error('Failed to upload document:', await response.text())
    return null
  }

  const result = (await response.json()) as { item?: DocumentRecord; document?: DocumentRecord; id?: string }
  if (result.item) return result.item
  if (result.document) return result.document
  if (result.id) return { ...input, id: result.id, name: input.name }
  return null
}

export type DocumentCategory =
  | 'invoice'
  | 'bill_of_lading'
  | 'delivery_note'
  | 'customs_declaration'
  | 'booking_confirmation'
  | 'packing_list'
  | 'vgm_certificate'
  | 'other'

export interface CreateDocumentInput {
  name: string
  category?: DocumentCategory
  description?: string
  documentNumber?: string
  blNumber?: string
  bookingNumber?: string
  vesselName?: string
  portOfLoading?: string
  portOfDischarge?: string
  sellerName?: string
  buyerName?: string
  totalGrossAmount?: number
  currency?: string
  // Linking fields
  relatedEntityId?: string
  relatedEntityType?: string
}

export interface DocumentRecord {
  id: string
  name: string
  category?: DocumentCategory
  description?: string
  documentNumber?: string
  blNumber?: string
  bookingNumber?: string
  vesselName?: string
  portOfLoading?: string
  portOfDischarge?: string
  sellerName?: string
  buyerName?: string
  totalGrossAmount?: number
  currency?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Creates a document via API with an auto-generated PDF attachment.
 * Uses the FMS upload endpoint to create document with file, then updates extra fields via PATCH.
 */
export async function createDocumentFixture(
  request: APIRequestContext,
  token: string,
  input: CreateDocumentInput
): Promise<DocumentRecord | null> {
  // Upload document with basic fields (name, category, description)
  const doc = await uploadDocumentDirect(request, token, {
    name: input.name,
    category: input.category,
    description: input.description,
  })
  
  if (!doc) {
    return null
  }

  // If there are extracted data fields to set, update via PATCH
  // PATCH endpoint accepts: documentNumber, blNumber, bookingNumber, vesselName, etc.
  const patchFields: Record<string, unknown> = {}
  if (input.documentNumber) patchFields.documentNumber = input.documentNumber
  if (input.blNumber) patchFields.blNumber = input.blNumber
  if (input.bookingNumber) patchFields.bookingNumber = input.bookingNumber
  if (input.vesselName) patchFields.vesselName = input.vesselName
  if (input.portOfLoading) patchFields.portOfLoading = input.portOfLoading
  if (input.portOfDischarge) patchFields.portOfDischarge = input.portOfDischarge
  if (input.sellerName) patchFields.sellerName = input.sellerName
  if (input.buyerName) patchFields.buyerName = input.buyerName
  if (input.totalGrossAmount !== undefined) patchFields.totalGrossAmount = String(input.totalGrossAmount)
  if (input.currency) patchFields.currency = input.currency

  if (Object.keys(patchFields).length > 0) {
    const updated = await patchDocumentData(request, token, doc.id, patchFields)
    if (updated) {
      return { ...doc, ...input }  // Return input values since PATCH response is minimal
    }
  }

  return doc
}

export interface UpdateDocumentInput {
  name?: string
  category?: DocumentCategory
  description?: string | null
  relatedEntityId?: string | null
  relatedEntityType?: string | null
}

/**
 * Updates a document via API (PUT - for basic metadata like name, category, description).
 */
export async function updateDocumentFixture(
  request: APIRequestContext,
  token: string,
  documentId: string,
  updates: UpdateDocumentInput
): Promise<DocumentRecord | null> {
  const response = await request.fetch(
    `${BASE_URL}/api/fms_documents/documents/${documentId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(updates),
    }
  )

  if (!response.ok()) {
    console.error('Failed to update document:', await response.text())
    return null
  }

  const body = (await response.json()) as { item?: DocumentRecord }
  return body.item ?? null
}

/**
 * Patches document extracted data fields via PATCH API.
 * Use this for fields like: documentNumber, blNumber, vesselName, sellerName, etc.
 */
export async function patchDocumentData(
  request: APIRequestContext,
  token: string,
  documentId: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const response = await request.fetch(
    `${BASE_URL}/api/fms_documents/documents/${documentId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(data),
    }
  )

  if (!response.ok()) {
    console.error('Failed to patch document data:', await response.text())
    return false
  }

  return true
}

/**
 * Deletes a document by ID if it exists. Safe for use in cleanup/finally blocks.
 */
export async function deleteDocumentIfExists(
  request: APIRequestContext,
  token: string | null,
  documentId: string | null
): Promise<void> {
  if (!token || !documentId) return

  try {
    await request.fetch(`${BASE_URL}/api/fms_documents/documents/${documentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best-effort cleanup - ignore errors
  }
}

/**
 * Lists documents matching an optional search query.
 */
export async function listDocuments(
  request: APIRequestContext,
  token: string,
  options?: { search?: string; category?: string }
): Promise<Array<{ id: string; name: string; category?: string; bookingNumber?: string }>> {
  const params = new URLSearchParams()
  if (options?.search) params.set('search', options.search)
  if (options?.category) params.set('category', options.category)

  const queryString = params.toString()
  const url = `${BASE_URL}/api/fms_documents/documents${queryString ? `?${queryString}` : ''}`

  const response = await request.fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    return []
  }

  const body = (await response.json()) as {
    items?: Array<{ id: string; name: string; category?: string; bookingNumber?: string }>
  }
  return body.items ?? []
}

/**
 * Gets a document by ID.
 * The API returns the document directly (not wrapped in { item: ... }).
 */
export async function getDocumentById(
  request: APIRequestContext,
  token: string,
  documentId: string
): Promise<Record<string, unknown> | null> {
  const response = await request.fetch(
    `${BASE_URL}/api/fms_documents/documents/${documentId}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!response.ok()) {
    return null
  }

  // GET /documents/{id} returns document directly, not wrapped in { item: ... }
  const body = (await response.json()) as Record<string, unknown>
  // Check if it has an id field (valid document response)
  if (body && typeof body.id === 'string') {
    return body
  }
  return null
}

/**
 * Finds a document by name in the list.
 */
export async function findDocumentByName(
  request: APIRequestContext,
  token: string,
  documentName: string
): Promise<{ id: string; name: string } | null> {
  const documents = await listDocuments(request, token, { search: documentName })
  return documents.find((doc) => doc.name === documentName) ?? null
}

/**
 * Downloads a document file and returns the response.
 */
export async function downloadDocument(
  request: APIRequestContext,
  token: string,
  documentId: string
): Promise<{ ok: boolean; status: number; contentType?: string; body?: Buffer }> {
  const response = await request.fetch(
    `${BASE_URL}/api/fms_documents/documents/${documentId}/download`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  return {
    ok: response.ok(),
    status: response.status(),
    contentType: response.headers()['content-type'],
    body: response.ok() ? Buffer.from(await response.body()) : undefined,
  }
}

/**
 * Lists documents with pagination and sorting options.
 */
export async function listDocumentsWithPagination(
  request: APIRequestContext,
  token: string,
  options?: {
    search?: string
    category?: DocumentCategory
    page?: number
    limit?: number
    sortField?: string
    sortDir?: 'asc' | 'desc'
  }
): Promise<{
  items: DocumentRecord[]
  total: number
  page: number
  limit: number
}> {
  const params = new URLSearchParams()
  if (options?.search) params.set('search', options.search)
  if (options?.category) params.set('category', options.category)
  if (options?.page) params.set('page', options.page.toString())
  if (options?.limit) params.set('limit', options.limit.toString())
  if (options?.sortField) params.set('sortField', options.sortField)
  if (options?.sortDir) params.set('sortDir', options.sortDir)

  const queryString = params.toString()
  const url = `${BASE_URL}/api/fms_documents/documents${queryString ? `?${queryString}` : ''}`

  const response = await request.fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    return { items: [], total: 0, page: 1, limit: 20 }
  }

  const body = (await response.json()) as {
    items?: DocumentRecord[]
    total?: number
    page?: number
    pageSize?: number  // API returns pageSize, not limit
    limit?: number
  }

  return {
    items: body.items ?? [],
    total: body.total ?? 0,
    page: body.page ?? 1,
    limit: body.pageSize ?? body.limit ?? 20,  // Prefer pageSize (actual API response)
  }
}

/**
 * Deletes multiple documents. Useful for cleanup after batch operations.
 */
export async function deleteDocumentsIfExist(
  request: APIRequestContext,
  token: string | null,
  documentIds: string[]
): Promise<void> {
  if (!token) return
  for (const id of documentIds) {
    await deleteDocumentIfExists(request, token, id)
  }
}
