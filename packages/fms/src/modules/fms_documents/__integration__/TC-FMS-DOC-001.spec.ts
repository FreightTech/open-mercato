import { test, expect } from '@playwright/test'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createBookingConfirmationContent,
  deleteDocumentIfExists,
  findDocumentByName,
  listDocuments,
} from './helpers'

/**
 * Creates a minimal valid PDF file with the given text content.
 * This generates a bare-bones PDF that can be parsed.
 */
function createMinimalPdf(textContent: string): Buffer {
  const lines = textContent.split('\n').filter(line => line.trim())
  const textObjects = lines.map((line, i) => {
    const y = 800 - (i * 14)
    const escaped = line.replace(/[()\\]/g, '\\$&')
    return `BT /F1 12 Tf 50 ${y} Td (${escaped}) Tj ET`
  }).join('\n')

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
 * TC-FMS-DOC-001: Booking Confirmation Upload with AI Extraction
 * Source: .ai/qa/scenarios/TC-FMS-DOC-001-booking-confirmation-upload.md
 *
 * Verifies that uploading a booking confirmation document triggers automatic
 * document type detection and AI data extraction, with extracted fields
 * populated on the document record.
 */
test.describe('TC-FMS-DOC-001: Booking Confirmation Upload', () => {
  let tempFilePath: string | null = null
  let createdDocumentId: string | null = null
  let authToken: string | null = null
  let testFileName: string

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    // Clean up temp file
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath)
      } catch {
        // File may already be deleted
      }
    }

    // Clean up the specific document if we have its ID
    await deleteDocumentIfExists(request, authToken, createdDocumentId)

    // Fallback: Clean up any orphaned test documents from failed runs
    if (authToken) {
      try {
        const orphanedDocs = await listDocuments(request, authToken, {
          search: 'booking-confirmation-test-',
        })
        for (const doc of orphanedDocs) {
          await deleteDocumentIfExists(request, authToken, doc.id)
        }
      } catch {
        // Best-effort cleanup
      }
    }
  })

  // Increase timeout for this test since AI extraction can take 30+ seconds
  test('should upload a booking confirmation and extract data via AI', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000) // 90 seconds for AI extraction
    await login(page, 'superadmin')

    // Step 1: Navigate to FMS Documents page
    await page.goto('/backend/fms-documents')
    await expect(
      page.getByRole('heading', { name: 'Documents', level: 3 })
    ).toBeVisible()

    // Step 2: Create a synthetic booking confirmation PDF file
    const timestamp = Date.now()
    testFileName = `booking-confirmation-test-${timestamp}.pdf`
    const testData = createBookingConfirmationContent(timestamp)

    // Create a minimal valid PDF with the booking confirmation content
    const pdfBuffer = createMinimalPdf(testData.content)
    tempFilePath = join(tmpdir(), testFileName)
    writeFileSync(tempFilePath, pdfBuffer)

    // Step 3: Click "Upload Document" button
    await page.getByRole('button', { name: 'Upload Document' }).click()

    // Step 4: Verify dialog opens with expected elements
    const dialog = page.getByRole('dialog', { name: 'Upload Documents' })
    await expect(dialog).toBeVisible()

    // Verify AI extraction toggle is ON by default
    const aiToggle = page.getByRole('switch', { name: 'AI Data Extraction' })
    await expect(aiToggle).toBeVisible()
    await expect(aiToggle).toBeChecked()

    // Step 5: Upload the file via the file input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(tempFilePath)

    // Step 6: Click Upload button
    await page.getByRole('button', { name: 'Upload' }).click()

    // Step 7: Wait for upload to complete
    // The dialog should close or show success state
    // Give time for AI extraction to complete (up to 30 seconds)
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    const baseFileName = testFileName.replace('.pdf', '')

    // Step 7b: Immediately capture the document ID for cleanup
    // Do this before any assertions that might fail, to ensure cleanup happens
    await page.waitForTimeout(1000) // Give API time to process
    const foundDoc = await findDocumentByName(request, authToken!, baseFileName)
    if (foundDoc) {
      createdDocumentId = foundDoc.id
    }

    // Step 8: After upload completes, a detail panel may open
    // Check if there's a detail panel and verify extracted data there

    // The detail panel shows the document with extracted data
    // Look for the document heading in the panel
    const panelHeading = page.getByRole('heading', { name: new RegExp(baseFileName, 'i'), level: 2 })
    const panelVisible = await panelHeading.isVisible({ timeout: 5_000 }).catch(() => false)

    if (panelVisible) {
      // Step 9: Verify extracted data in the detail panel
      // Wait for extraction data to fully render
      await page.waitForTimeout(2000)

      // Look for booking number in the panel
      const bookingNumberInPanel = page.getByText(new RegExp(testData.expectedFields.bookingNumber, 'i'))
      await expect(bookingNumberInPanel.first()).toBeVisible({ timeout: 10_000 })

      // Verify vessel name in panel
      const vesselInPanel = page.getByText(new RegExp(testData.expectedFields.vesselName, 'i'))
      await expect(vesselInPanel.first()).toBeVisible({ timeout: 5_000 })

      // Verify POL/POD in panel
      const polInPanel = page.getByText(/Shanghai.*CNSHA/i)
      await expect(polInPanel.first()).toBeVisible({ timeout: 5_000 })

      const podInPanel = page.getByText(/Rotterdam.*NLRTM/i)
      await expect(podInPanel.first()).toBeVisible({ timeout: 5_000 })

      // Close the detail panel to see the document list
      const closeButton = page.getByRole('button', { name: 'Close' })
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click()
        await page.waitForTimeout(500)
      }
    }

    // Step 10: Verify the document appears in the list
    // Navigate to the documents list to ensure we're on the main page
    await page.goto('/backend/fms-documents')
    await page.waitForTimeout(1000)

    // Verify document row is visible in the table
    const documentRow = page.getByRole('button', { name: new RegExp(baseFileName, 'i') })
    await expect(documentRow.first()).toBeVisible({ timeout: 15_000 })

    // Step 11: Verify the document was created successfully (ID captured in Step 7b)
    expect(createdDocumentId).toBeTruthy()

    // Step 12: Verify extracted data is visible in the list row
    // The booking number should be extracted and visible
    const bookingNumberCell = page.getByText(new RegExp(testData.expectedFields.bookingNumber, 'i'))
    await expect(bookingNumberCell.first()).toBeVisible({ timeout: 5_000 })

    // Verify vessel name
    const vesselCell = page.getByText(new RegExp(testData.expectedFields.vesselName, 'i'))
    await expect(vesselCell.first()).toBeVisible({ timeout: 5_000 })

    // Verify category is "Booking Confirmation"
    const categoryCell = page.getByText('Booking Confirmation')
    await expect(categoryCell.first()).toBeVisible({ timeout: 5_000 })
  })
})
