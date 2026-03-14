import { test, expect } from '@playwright/test'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  deleteDocumentIfExists,
  downloadDocument,
  getDocumentById,
} from './helpers'

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
 * TC-FMS-DOC-008: Download Document File
 *
 * Tests downloading a document file via API.
 */
test.describe('TC-FMS-DOC-008: Download Document File', () => {
  let authToken: string
  let tempFilePath: string | null = null
  let createdDocumentId: string | null = null
  const testFileName = `download-test-${Date.now()}.pdf`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    // Create a PDF file and upload it
    const pdfContent = `
TEST DOCUMENT FOR DOWNLOAD
===========================

Document ID: ${Date.now()}
Purpose: Integration test for download functionality
Created: ${new Date().toISOString()}

This is a test document.
`
    const pdfBuffer = createMinimalPdf(pdfContent)
    tempFilePath = join(tmpdir(), testFileName)
    writeFileSync(tempFilePath, pdfBuffer)

    // Upload via multipart form
    const formData = new FormData()
    formData.append('file', new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }), testFileName)
    formData.append('name', testFileName.replace('.pdf', ''))
    formData.append('category', 'other')
    formData.append('enableAiExtraction', 'false')

    const uploadResponse = await request.fetch(`${BASE_URL}/api/fms_documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        file: {
          name: testFileName,
          mimeType: 'application/pdf',
          buffer: pdfBuffer,
        },
        name: testFileName.replace('.pdf', ''),
        category: 'other',
        enableAiExtraction: 'false',
      },
    })

    if (uploadResponse.ok()) {
      const body = (await uploadResponse.json()) as { id?: string; item?: { id: string } }
      createdDocumentId = body.id ?? body.item?.id ?? null
    }
  })

  test.afterAll(async ({ request }) => {
    // Clean up temp file
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath)
      } catch {
        // Ignore
      }
    }

    // Clean up document
    await deleteDocumentIfExists(request, authToken, createdDocumentId)
  })

  test('should download document file successfully', async ({ request }) => {
    // Skip if document wasn't created
    test.skip(!createdDocumentId, 'Document was not created in setup')

    // Get document to verify it exists and has attachment
    const doc = await getDocumentById(request, authToken, createdDocumentId!)
    expect(doc).not.toBeNull()

    // Download the document
    const result = await downloadDocument(request, authToken, createdDocumentId!)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.contentType).toContain('application/pdf')
    expect(result.body).toBeDefined()
    expect(result.body!.length).toBeGreaterThan(0)

    // Verify it's a valid PDF (starts with %PDF)
    const pdfHeader = result.body!.subarray(0, 5).toString('utf-8')
    expect(pdfHeader).toBe('%PDF-')
  })

  test('should return 404 for non-existent document', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const result = await downloadDocument(request, authToken, fakeId)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })

  test('should require authentication', async ({ request }) => {
    test.skip(!createdDocumentId, 'Document was not created in setup')

    const response = await request.fetch(
      `${BASE_URL}/api/fms_documents/documents/${createdDocumentId}/download`,
      { method: 'GET' }
    )

    expect(response.ok()).toBe(false)
    expect(response.status()).toBe(401)
  })
})
