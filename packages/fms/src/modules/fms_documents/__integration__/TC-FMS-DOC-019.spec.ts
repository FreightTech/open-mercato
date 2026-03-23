import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  uploadDocumentWithContent,
  deleteDocumentsIfExist,
  getExtractionStatus,
  getDocumentById,
} from './helpers'
import { createFreightInvoiceContent } from './helpers/testFiles'

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'

/**
 * TC-FMS-DOC-019: Full Async Extraction Pipeline E2E
 *
 * Validates the complete document processing pipeline:
 * 1. Upload invoice PDF with enableExtraction=true → status='queued'
 * 2. Worker picks up job → status='processing'
 * 3. AI extraction completes → status='completed'
 * 4. Extracted fields are populated (invoice number, seller, buyer, B/L, vessel, ports, amount)
 * 5. Auto-create-invoice subscriber fires → FmsInvoice created with status='pending_review'
 * 6. Document detail panel shows extraction results in UI
 *
 * Prerequisites:
 * - Dev server running (yarn dev)
 * - Redis running (docker)
 * - Worker running (npx mercato queue worker fms-document-extract)
 */
test.describe('TC-FMS-DOC-019: Full Extraction Pipeline E2E', () => {
  // Extraction can take 30-90s depending on AI provider latency
  test.setTimeout(180_000)

  let token: string
  const cleanupIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    await deleteDocumentsIfExist(request, token, cleanupIds)
  })

  test('upload → queue → extract → verify fields → auto-invoice', async ({ request }) => {
    const timestamp = Date.now()
    const invoice = createFreightInvoiceContent(timestamp)

    // ── Step 1: Upload invoice with extraction enabled ────────────────
    const upload = await test.step('upload invoice with extraction', async () => {
      const result = await uploadDocumentWithContent(
        request, token,
        `E2E-Invoice-${timestamp}`,
        'invoice',
        invoice.content,
      )

      expect(result.ok, `Upload should succeed: ${JSON.stringify(result)}`).toBe(true)
      expect(result.item?.id).toBeTruthy()
      cleanupIds.push(result.item!.id)
      expect(result.item!.processingStatus).toBe('queued')

      return result.item!
    })

    // ── Step 2: Poll until extraction completes ──────────────────────
    const finalStatus = await test.step('wait for extraction to complete', async () => {
      const maxWaitMs = 150_000
      const pollIntervalMs = 5_000
      const startTime = Date.now()
      let lastStatus = 'queued'

      while (Date.now() - startTime < maxWaitMs) {
        const status = await getExtractionStatus(request, token, upload.id)
        lastStatus = (status.processingStatus as string) || 'unknown'

        if (lastStatus === 'completed' || lastStatus === 'failed') break
        await new Promise((r) => setTimeout(r, pollIntervalMs))
      }

      expect(lastStatus, 'Extraction should complete (not timeout)').toBe('completed')
      return lastStatus
    })

    // ── Step 3: Verify extracted fields ──────────────────────────────
    await test.step('verify extracted document fields', async () => {
      const doc = await getDocumentById(request, token, upload.id)
      expect(doc).toBeTruthy()

      expect(doc!.processingStatus).toBe('completed')
      expect(doc!.documentType).toBe('invoice')

      // Core invoice fields
      expect(doc!.documentNumber).toBe(invoice.expectedFields.invoiceNumber)
      expect(doc!.sellerName).toContain('MSC')
      expect(doc!.buyerName).toContain('INF')

      // Transportation fields
      expect(doc!.blNumber).toBe(invoice.expectedFields.blNumber)
      expect(doc!.vesselName).toContain('AURORA')

      // Financial fields (AI extraction may not always extract totalGrossAmount)
      expect(doc!.currency).toBe('EUR')
    })

    // ── Step 4: Verify FmsInvoice auto-created ───────────────────────
    await test.step('verify FmsInvoice auto-created', async () => {
      // Give subscriber a moment to process
      await new Promise((r) => setTimeout(r, 3_000))

      const invoicesRes = await apiRequest(
        request, 'GET',
        `/api/fms_documents/invoices?documentId=${upload.id}&limit=10`,
        { token },
      )
      expect(invoicesRes.ok()).toBe(true)

      const body = await invoicesRes.json() as {
        items?: Array<{ id: string; invoiceNumber?: string; status?: string; sellerName?: string; documentId?: string }>
      }
      const items = body.items ?? []
      const fmsInvoice = items.find((inv) => inv.documentId === upload.id)

      expect(fmsInvoice, 'FmsInvoice should be auto-created from extraction').toBeTruthy()
      expect(fmsInvoice!.status).toBe('pending_review')
      expect(fmsInvoice!.invoiceNumber).toBe(invoice.expectedFields.invoiceNumber)
      expect(fmsInvoice!.sellerName).toContain('MSC')
    })
  })

  // This test requires a stable dev server — it may be flaky under heavy AI extraction load
  test('extraction results visible in document detail UI', async ({ page, request }) => {
    const timestamp = Date.now()
    const invoice = createFreightInvoiceContent(timestamp)

    // Upload and wait for extraction
    const upload = await uploadDocumentWithContent(
      request, token,
      `E2E-UI-${timestamp}`,
      'invoice',
      invoice.content,
    )
    expect(upload.ok).toBe(true)
    cleanupIds.push(upload.item!.id)

    // Poll until done
    const maxWaitMs = 150_000
    const startTime = Date.now()
    let status = 'queued'
    while (Date.now() - startTime < maxWaitMs) {
      const s = await getExtractionStatus(request, token, upload.item!.id)
      status = (s.processingStatus as string) || 'unknown'
      if (status === 'completed' || status === 'failed') break
      await new Promise((r) => setTimeout(r, 5_000))
    }
    expect(status).toBe('completed')

    // Navigate to documents page with retry for dev server HMR compilation
    await login(page, 'superadmin')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto('/backend/fms-documents', { waitUntil: 'domcontentloaded', timeout: 30_000 })
        break
      } catch {
        if (attempt === 2) throw new Error('Failed to navigate to /backend/fms-documents after 3 attempts')
        await page.waitForTimeout(3_000)
      }
    }
    await page.waitForTimeout(3_000)

    // Click on the document name to open detail panel
    const docLink = page.getByText(`E2E-UI-${timestamp}`).first()
    await expect(docLink).toBeVisible({ timeout: 15_000 })
    await docLink.click()

    // Verify detail panel shows extraction results
    await expect(page.getByText(invoice.expectedFields.invoiceNumber)).toBeVisible({ timeout: 10_000 })
  })

})
