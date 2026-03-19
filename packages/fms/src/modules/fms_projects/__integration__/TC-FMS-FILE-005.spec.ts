import { test, expect } from '@playwright/test'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createBillOfLadingForAutoLink,
  createProjectFixture,
  deleteDocumentIfExists,
  deleteProjectIfExists,
  getDocumentById,
  patchDocumentData,
  updateDocumentFixture,
} from './helpers'

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
 * TC-FMS-FILE-005: No Auto-Link When Multiple Projects Match
 * Source: .ai/qa/scenarios/TC-FMS-FILE-005-no-link-multiple-matches.md
 *
 * Verifies that when a document matches multiple FmsProjects (ambiguous case),
 * the system does NOT auto-link and leaves the document unlinked for manual
 * selection.
 *
 * Flow:
 * 1. Create two projects with the same booking number
 * 2. Upload a document with that booking number
 * 3. System finds multiple matches → skips auto-link
 * 4. Document remains unlinked, requires manual selection
 */
test.describe('TC-FMS-FILE-005: No Auto-Link When Multiple Projects Match', () => {
  let tempFilePath: string | null = null
  let createdDocumentId: string | null = null
  let projectId1: string | null = null
  let projectId2: string | null = null
  let authToken: string | null = null
  let testFileName: string
  let testBookingNumber: string

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    // Create two projects with the SAME booking number (ambiguous scenario)
    const timestamp = Date.now()
    testBookingNumber = `BK${timestamp.toString().slice(-8)}`

    // First project
    const project1 = await createProjectFixture(request, authToken!, {
      bookingNumber: testBookingNumber,
      cargoType: 'fcl',
      direction: 'export',
      shipmentType: 'EXP',
      clientReference: 'PROJECT-A',
    })
    expect(project1).toBeTruthy()
    projectId1 = project1!.id

    // Second project with same booking number (different client reference)
    const project2 = await createProjectFixture(request, authToken!, {
      bookingNumber: testBookingNumber,
      cargoType: 'fcl',
      direction: 'export',
      shipmentType: 'EXP',
      clientReference: 'PROJECT-B',
    })
    expect(project2).toBeTruthy()
    projectId2 = project2!.id
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

    // Clean up document
    await deleteDocumentIfExists(request, authToken, createdDocumentId)

    // Clean up both projects
    await deleteProjectIfExists(request, authToken, projectId1)
    await deleteProjectIfExists(request, authToken, projectId2)
  })

  test('should NOT auto-link when multiple projects match (ambiguous)', async ({
    page,
    request,
  }) => {
    // Increase timeout for AI extraction
    test.setTimeout(120_000)

    await login(page, 'superadmin')

    // Step 1: Generate B/L test data with the ambiguous booking number
    const timestamp = Date.now()
    testFileName = `ambiguous-match-test-${timestamp}.pdf`
    const testData = createBillOfLadingForAutoLink(testBookingNumber, timestamp.toString())

    // Step 2: Create PDF file
    const pdfBuffer = createMinimalPdf(testData.content)
    tempFilePath = join(tmpdir(), testFileName)
    writeFileSync(tempFilePath, pdfBuffer)

    // Step 3: Navigate to FMS Documents page
    await page.goto('/backend/fms-documents')
    await expect(
      page.getByRole('heading', { name: 'Documents', level: 3 })
    ).toBeVisible()

    // Step 4: Upload the document
    await page.getByRole('button', { name: 'Upload Document' }).click()
    const dialog = page.getByRole('dialog', { name: 'Upload Documents' })
    await expect(dialog).toBeVisible()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(tempFilePath)
    await page.getByRole('button', { name: 'Upload' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    // Step 5: Find the created document
    await page.waitForTimeout(2000)
    const baseFileName = testFileName.replace('.pdf', '')

    const response = await request.fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/api/fms_documents/documents?search=${encodeURIComponent(baseFileName)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    expect(response.ok()).toBeTruthy()
    const docListBody = (await response.json()) as { items?: Array<{ id: string; name: string }> }
    const foundDoc = docListBody.items?.find((d) => d.name.includes(baseFileName))
    expect(foundDoc).toBeTruthy()
    createdDocumentId = foundDoc!.id

    // Step 6: Wait for AI extraction to complete
    let document: Record<string, unknown> | null = null
    for (let i = 0; i < 30; i++) {
      document = await getDocumentById(request, authToken!, createdDocumentId)
      if (document && document.processedAt) {
        break
      }
      await page.waitForTimeout(2000)
    }
    expect(document).toBeTruthy()
    expect(document!.processedAt).toBeTruthy()

    // Step 7: Check if AI correctly classified the document
    // If not, manually set the category and booking number to test the ambiguous case
    const aiExtractedCorrectly = 
      document!.category === 'bill_of_lading' && 
      document!.bookingNumber === testBookingNumber
    
    if (!aiExtractedCorrectly) {
      console.log('AI extraction did not classify document correctly, manually setting...')
      console.log(`  Current category: ${document!.category}, expected: bill_of_lading`)
      console.log(`  Current bookingNumber: ${document!.bookingNumber}, expected: ${testBookingNumber}`)
      
      // Use PUT for category (updateDocumentFixture)
      const updated = await updateDocumentFixture(request, authToken!, createdDocumentId, {
        category: 'bill_of_lading',
      })
      expect(updated).toBeTruthy()
      
      // Use PATCH for extracted data fields (bookingNumber, blNumber)
      const patched = await patchDocumentData(request, authToken!, createdDocumentId, {
        bookingNumber: testBookingNumber,
        blNumber: testData.expectedFields.blNumber,
      })
      expect(patched).toBeTruthy()
      
      // Re-fetch document to verify changes
      document = await getDocumentById(request, authToken!, createdDocumentId)
    }
    
    expect(document!.category).toBe('bill_of_lading')
    expect(document!.bookingNumber).toBe(testBookingNumber)

    // Step 8: Wait sufficient time for auto-link subscriber to run
    // (It should detect multiple matches and skip auto-linking)
    await page.waitForTimeout(10_000)

    // Step 9: Verify document remains UNLINKED due to ambiguity
    const finalDocument = await getDocumentById(request, authToken!, createdDocumentId)
    expect(finalDocument).toBeTruthy()

    // CRITICAL CHECK: Document should NOT be linked because multiple projects match
    expect(finalDocument!.relatedEntityId).toBeNull()
    expect(finalDocument!.relatedEntityType).toBeNull()

    // Step 10: Verify that both projects still exist (200 OK response)
    // This confirms the ambiguity condition was properly set up
    // (Both projects were created with the same booking number in beforeAll)
    const project1Response = await request.fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/api/fms_projects/projects/${projectId1}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )
    expect(project1Response.ok()).toBeTruthy()

    const project2Response = await request.fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/api/fms_projects/projects/${projectId2}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )
    expect(project2Response.ok()).toBeTruthy()

    // Step 11: In UI, user would need to manually link the document
    // This test confirms the system correctly avoids auto-linking in ambiguous cases
  })
})
