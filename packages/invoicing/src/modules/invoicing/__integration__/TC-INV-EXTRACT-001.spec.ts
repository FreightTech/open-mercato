import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-INV-EXTRACT-001: Auto-create InvoicingInvoice from document extraction
 *
 * End-to-end flow:
 * 1. Enable autoImportFromDocuments setting
 * 2. Upload an invoice PDF via FMS Documents
 * 3. Trigger AI extraction
 * 4. Verify FmsInvoice is created (documents side)
 * 5. Verify InvoicingInvoice is auto-created with 'extracted' status
 * 6. Verify line items are copied
 * 7. Verify sourceDocumentId is set
 * 8. Verify no duplicate is created
 */
test.describe('TC-INV-EXTRACT-001: Document → Invoicing Auto-Extract', () => {
  // Increase timeout for AI extraction steps
  test.setTimeout(180_000)

  let token: string
  let documentId: string | null = null
  let fmsInvoiceId: string | null = null
  let invoicingInvoiceId: string | null = null

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    if (invoicingInvoiceId) {
      await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${invoicingInvoiceId}`, { token }).catch(() => {})
    }
    if (fmsInvoiceId) {
      await apiRequest(request, 'DELETE', `/api/fms_documents/invoices/${fmsInvoiceId}`, { token }).catch(() => {})
    }
    if (documentId) {
      await apiRequest(request, 'DELETE', `/api/fms_documents/documents/${documentId}`, { token }).catch(() => {})
    }
  })

  test('full extraction → invoicing pipeline', async ({ page, request }) => {
    const timestamp = Date.now()

    // ── Step 1: Enable auto-import setting ───────────────────────────
    await test.step('enable autoImportFromDocuments setting', async () => {
      const res = await apiRequest(request, 'PATCH', '/api/invoicing/settings', {
        token,
        data: { autoImportFromDocuments: true },
      })
      expect(res.ok(), `Settings update failed: ${res.status()}`).toBe(true)
    })

    // ── Step 2: Upload invoice document ──────────────────────────────
    await test.step('upload invoice document via FMS Documents', async () => {
      const invoiceContent = createInvoicePdfContent(`INV-TEST-${timestamp}`, timestamp)
      const pdfBuffer = createMinimalPdf(invoiceContent)
      const docName = `Test Invoice ${timestamp}`

      const doc = await uploadDocument(token, docName, 'invoice', pdfBuffer)
      expect(doc, 'Document upload should succeed').toBeTruthy()

      documentId = doc!.id

      const getRes = await apiRequest(request, 'GET', `/api/fms_documents/documents/${documentId}`, { token })
      expect(getRes.ok()).toBe(true)
      const docData = await getRes.json()
      expect(docData.category).toBe('invoice')
    })

    // ── Step 3: Trigger AI extraction and wait for completion ────────
    // In dev, queue uses 'local' strategy (synchronous), so the POST
    // may take 30-90+ seconds. We use native fetch with AbortController
    // to avoid Playwright's default timeout.
    await test.step('trigger AI extraction', async () => {
      const controller = new AbortController()
      const extractTimeout = setTimeout(() => controller.abort(), 150_000)

      try {
        const extractRes = await fetch(`${BASE_URL}/api/fms_documents/documents/${documentId}/extract`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        })
        expect([200, 201, 202].includes(extractRes.status), `Extraction trigger failed: ${extractRes.status}`).toBe(true)
      } catch (fetchErr: any) {
        // If fetch fails (timeout, socket close), the extraction may still be processing in background
        console.warn('Extraction fetch error (may still be processing):', fetchErr.message)
      } finally {
        clearTimeout(extractTimeout)
      }

      // Poll until processing completes (up to 2 minutes)
      const maxWait = 120_000
      const pollInterval = 3_000
      const startTime = Date.now()
      let processingStatus = 'pending'

      while (Date.now() - startTime < maxWait) {
        const statusRes = await apiRequest(request, 'GET', `/api/fms_documents/documents/${documentId}/extract`, { token })
        if (statusRes.ok()) {
          const data = await statusRes.json()
          processingStatus = data.processingStatus || 'unknown'
          if (processingStatus === 'completed' || processingStatus === 'failed') break
        }
        await new Promise((r) => setTimeout(r, pollInterval))
      }

      expect(processingStatus, 'Document extraction should complete').toBe('completed')
    })

    // ── Step 4: Verify FmsInvoice was auto-created ───────────────────
    await test.step('verify FmsInvoice created', async () => {
      // Give subscriber time to run
      await new Promise((r) => setTimeout(r, 3_000))

      const invoicesRes = await apiRequest(
        request, 'GET',
        `/api/fms_documents/invoices?documentId=${documentId}&limit=10`,
        { token }
      )
      expect(invoicesRes.ok()).toBe(true)

      const body = await invoicesRes.json() as { items?: Array<{ id: string; documentId?: string; status?: string }> }
      const items = body.items ?? []
      const fmsInvoice = items.find((inv) => inv.documentId === documentId)

      expect(fmsInvoice, 'FmsInvoice should be created from extraction').toBeTruthy()
      fmsInvoiceId = fmsInvoice!.id
      expect(fmsInvoice!.status).toBe('pending_review')
    })

    // ── Step 5: Verify InvoicingInvoice auto-created with extracted status ──
    await test.step('verify InvoicingInvoice created with extracted status', async () => {
      // Give event subscriber chain time to complete
      await new Promise((r) => setTimeout(r, 5_000))

      // Find the InvoicingInvoice linked to our FmsInvoice
      const listRes = await apiRequest(
        request, 'GET',
        `/api/invoicing/invoices?sourceType=document_extraction&limit=50`,
        { token }
      )
      expect(listRes.ok()).toBe(true)

      const listBody = await listRes.json() as { items?: Array<Record<string, unknown>> }
      const items = listBody.items ?? []

      // Search by detail (need sourceDocumentInvoiceId which is not in list response)
      let foundInvoice: Record<string, unknown> | undefined
      for (const inv of items) {
        const detailRes = await apiRequest(request, 'GET', `/api/invoicing/invoices/${inv.id}`, { token })
        if (detailRes.ok()) {
          const detail = await detailRes.json()
          if (detail.sourceDocumentInvoiceId === fmsInvoiceId) {
            foundInvoice = detail
            break
          }
        }
      }

      expect(foundInvoice, 'InvoicingInvoice should be auto-created from extraction').toBeTruthy()
      invoicingInvoiceId = foundInvoice!.id as string
      expect(foundInvoice!.status).toBe('extracted')
      expect(foundInvoice!.sourceType).toBe('document_extraction')
      expect(foundInvoice!.direction).toBe('incoming')
    })

    // ── Step 6: Verify line items and sourceDocumentId ───────────────
    await test.step('verify line items and sourceDocumentId', async () => {
      const detailRes = await apiRequest(request, 'GET', `/api/invoicing/invoices/${invoicingInvoiceId}`, { token })
      expect(detailRes.ok()).toBe(true)

      const detail = await detailRes.json()
      expect(detail.sourceDocumentId).toBe(documentId)
      expect(detail.sourceDocumentInvoiceId).toBe(fmsInvoiceId)
      expect(detail.attachmentId).toBeTruthy()

      const lineItems = detail.lineItems as Array<Record<string, unknown>>
      expect(lineItems.length, 'Line items should be copied').toBeGreaterThan(0)
      expect(lineItems[0].description).toBeTruthy()
      expect(lineItems[0].lineNumber).toBe(1)
    })

    // ── Step 7: Verify no duplicate ──────────────────────────────────
    await test.step('verify no duplicate InvoicingInvoice', async () => {
      const listRes = await apiRequest(
        request, 'GET',
        `/api/invoicing/invoices?sourceType=document_extraction&limit=100`,
        { token }
      )
      expect(listRes.ok()).toBe(true)

      const body = await listRes.json() as { items?: Array<Record<string, unknown>> }
      const items = body.items ?? []

      let matchCount = 0
      for (const inv of items) {
        const d = await apiRequest(request, 'GET', `/api/invoicing/invoices/${inv.id}`, { token })
        if (d.ok()) {
          const detail = await d.json()
          if (detail.sourceDocumentInvoiceId === fmsInvoiceId) matchCount++
        }
      }
      expect(matchCount, 'Should have exactly 1 InvoicingInvoice per FmsInvoice').toBe(1)
    })

    // ── Step 8: Verify UI — invoice list shows extracted badge ───────
    await test.step('verify extracted badge in invoicing list UI', async () => {
      await login(page, 'admin')
      await page.goto('/backend/invoicing')
      await page.waitForURL('**/backend/invoicing')

      // Wait for table to render
      await page.waitForTimeout(3000)

      const extractedBadge = page.locator('text=extracted').first()
      await expect(extractedBadge).toBeVisible({ timeout: 10_000 })
    })

    // ── Step 9: Verify UI — edit page shows "Verify Invoice" ────────
    await test.step('verify edit page shows Verify Invoice title', async () => {
      await page.goto(`/backend/invoicing/${invoicingInvoiceId}/edit`)

      await expect(page.getByText('Verify Invoice')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('Source Document')).toBeVisible({ timeout: 10_000 })
    })
  })
})

// ========================================
// Helper functions
// ========================================

function createInvoicePdfContent(invoiceNumber: string, _timestamp: number): string {
  return `
INVOICE
=======

Invoice Number: ${invoiceNumber}
Invoice Date: ${new Date().toISOString().split('T')[0]}
Due Date: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}

SELLER
------
MSC Mediterranean Shipping Company S.A.
CHEMIN RIEU 12-14
CH-1208 GENEVA
SWITZERLAND
Tax ID: CHE-111954803 TVA

BUYER
-----
INF SHIPPING SOLUTIONS SP. Z O.O.
UL. WEGLOWA 12C/12259-970, Gdynia, 81-341
POLAND
Tax ID: PL6152069288

VESSEL DETAILS
--------------
Vessel: MSC AURORA
Voyage: QB552E
POL: GDYNIA
POD: CAUCEDO
B/L No: MEDUYK582433

LINE ITEMS
----------
No.  Description                  Qty     Rate    Currency    Total
1    SEAFREIGHT                   7 20DV  650.00  EUR         4,550.00
2    ISPS                         7 20DV  20.00   EUR         140.00
3    TERMINAL HANDLING CHARGE     7 20DV  145.00  EUR         1,015.00
4    BUNKER RECOVERY CHARGE       7 20DV  308.00  EUR         2,156.00
5    EMISSIONS TRADING SYSTEM     7 20DV  64.00   EUR         448.00
6    FUEL EU SURCHARGE            7 20DV  19.00   EUR         133.00
7    DOCUMENTATION FEE            1 BL    50.00   EUR         50.00

Total EUR: 8,492.00

Payment Terms: 14 days net
Client No: 1001531334
`
}

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

async function uploadDocument(
  token: string,
  name: string,
  category: string,
  pdfBuffer: Buffer
): Promise<{ id: string } | null> {
  const { randomUUID } = await import('crypto')
  const boundary = `----WebKitFormBoundary${randomUUID().replace(/-/g, '')}`

  const parts: string[] = []
  parts.push(`--${boundary}`)
  parts.push(`Content-Disposition: form-data; name="file"; filename="${name}.pdf"`)
  parts.push('Content-Type: application/pdf')
  parts.push('')

  const textBeforeFile = parts.join('\r\n') + '\r\n'

  const fieldParts: string[] = []
  fieldParts.push(`\r\n--${boundary}`)
  fieldParts.push(`Content-Disposition: form-data; name="name"`)
  fieldParts.push('')
  fieldParts.push(name)
  fieldParts.push(`--${boundary}`)
  fieldParts.push(`Content-Disposition: form-data; name="category"`)
  fieldParts.push('')
  fieldParts.push(category)
  fieldParts.push(`--${boundary}--`)
  fieldParts.push('')

  const textAfterFile = fieldParts.join('\r\n')

  const beforeBuffer = Buffer.from(textBeforeFile, 'utf-8')
  const afterBuffer = Buffer.from(textAfterFile, 'utf-8')
  const body = Buffer.concat([beforeBuffer, pdfBuffer, afterBuffer])

  const response = await fetch(`${BASE_URL}/api/fms_documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  if (!response.ok) {
    console.error('Upload failed:', await response.text())
    return null
  }

  const result = (await response.json()) as Record<string, unknown>
  const id = (result.item as Record<string, unknown>)?.id ??
    (result.document as Record<string, unknown>)?.id ??
    result.id

  return id ? { id: id as string } : null
}
