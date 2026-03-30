import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  uploadDocumentWithExtraction,
  deleteDocumentsIfExist,
  triggerExtraction,
  getExtractionStatus,
  getDocumentById,
} from './helpers'

/**
 * TC-FMS-DOC-017: Async Document Extraction Pipeline
 *
 * Tests the full async document upload and extraction flow:
 * - Upload with enableExtraction → status='queued'
 * - Upload without extraction → status='pending'
 * - POST /extract on pending doc → 202, status='queued'
 * - POST /extract is idempotent on already-queued docs
 * - GET /extract returns current processing status
 * - POST /extract with invalid ID → 404
 * - Document detail API includes extraction fields
 */
test.describe('TC-FMS-DOC-017: Async Document Extraction', () => {
  test.setTimeout(60_000)

  let token: string
  const cleanupIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    await deleteDocumentsIfExist(request, token, cleanupIds)
  })

  test('upload with enableExtraction=true returns queued status', async ({ request }) => {
    const result = await uploadDocumentWithExtraction(
      request, token, `extract-on-${Date.now()}`, 'invoice', true,
    )

    expect(result.ok).toBe(true)
    expect(result.item?.id).toBeTruthy()
    cleanupIds.push(result.item!.id)
    expect(result.item!.processingStatus).toBe('queued')
  })

  test('upload without extraction returns pending status', async ({ request }) => {
    const result = await uploadDocumentWithExtraction(
      request, token, `no-extract-${Date.now()}`, 'other', false,
    )

    expect(result.ok).toBe(true)
    expect(result.item?.id).toBeTruthy()
    cleanupIds.push(result.item!.id)
    expect(result.item!.processingStatus).toBe('pending')
  })

  test('POST /extract on pending document returns 202 queued', async ({ request }) => {
    const upload = await uploadDocumentWithExtraction(
      request, token, `manual-extract-${Date.now()}`, 'invoice', false,
    )
    expect(upload.ok).toBe(true)
    cleanupIds.push(upload.item!.id)

    const { status, body } = await triggerExtraction(request, token, upload.item!.id)

    expect(status).toBe(202)
    expect(body.ok).toBe(true)
    expect(body.queued).toBe(true)
    expect(body.processingStatus).toBe('queued')
  })

  test('POST /extract on already-queued document is idempotent', async ({ request }) => {
    const upload = await uploadDocumentWithExtraction(
      request, token, `idempotent-${Date.now()}`, 'invoice', true,
    )
    expect(upload.ok).toBe(true)
    cleanupIds.push(upload.item!.id)

    const { status, body } = await triggerExtraction(request, token, upload.item!.id)

    expect(status).toBe(202)
    expect(body.ok).toBe(true)
    expect(body.message).toBe('Extraction already in progress')
  })

  test('GET /extract on queued document returns status', async ({ request }) => {
    const upload = await uploadDocumentWithExtraction(
      request, token, `status-check-${Date.now()}`, 'invoice', true,
    )
    expect(upload.ok).toBe(true)
    cleanupIds.push(upload.item!.id)

    const status = await getExtractionStatus(request, token, upload.item!.id)

    expect(typeof status.processingStatus).toBe('string')
    expect(status.extracted).toBe(false)
  })

  test('GET /extract on never-extracted document returns pending', async ({ request }) => {
    const upload = await uploadDocumentWithExtraction(
      request, token, `pending-${Date.now()}`, 'other', false,
    )
    expect(upload.ok).toBe(true)
    cleanupIds.push(upload.item!.id)

    const status = await getExtractionStatus(request, token, upload.item!.id)
    expect(status.processingStatus).toBe('pending')
  })

  test('POST /extract with invalid document ID returns 404', async ({ request }) => {
    const { status } = await triggerExtraction(
      request, token, '00000000-0000-0000-0000-000000000000',
    )
    expect(status).toBe(404)
  })

  test('multiple uploads with extraction all get queued', async ({ request }) => {
    for (let i = 0; i < 3; i++) {
      const result = await uploadDocumentWithExtraction(
        request, token, `batch-${Date.now()}-${i}`, 'invoice', true,
      )
      expect(result.ok).toBe(true)
      cleanupIds.push(result.item!.id)
      expect(result.item!.processingStatus).toBe('queued')
    }
  })

  test('document detail includes processingStatus and retryCount', async ({ request }) => {
    const upload = await uploadDocumentWithExtraction(
      request, token, `detail-fields-${Date.now()}`, 'invoice', false,
    )
    expect(upload.ok).toBe(true)
    cleanupIds.push(upload.item!.id)

    const doc = await getDocumentById(request, token, upload.item!.id)
    expect(doc).toBeTruthy()
    expect(doc!.processingStatus).toBe('pending')
    expect(doc!.retryCount).toBe(0)
  })
})

/**
 * TC-FMS-DOC-018: Document List UI — Status Column
 *
 * Tests that the documents list page shows processing status badges
 * and the upload dialog works.
 */
test.describe('TC-FMS-DOC-018: Document List UI', () => {
  test.setTimeout(30_000)

  let token: string
  const cleanupIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    await deleteDocumentsIfExist(request, token, cleanupIds)
  })

  test('documents page loads and shows upload button', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/backend/fms-documents')

    await expect(
      page.getByRole('button', { name: /Upload Document/i }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('uploaded document appears in list', async ({ page, request }) => {
    const name = `UI-Test-${Date.now()}`
    const result = await uploadDocumentWithExtraction(
      request, token, name, 'invoice', false,
    )
    expect(result.ok).toBe(true)
    cleanupIds.push(result.item!.id)

    await login(page, 'admin')
    await page.goto('/backend/fms-documents')
    await page.waitForTimeout(3000)

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })
  })
})
