import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  ensureContractor,
  createFileFixture,
  getFileById,
  deleteFileIfExists,
  deleteContractorIfExists,
} from './helpers/fileFixtures'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-FMS-FILES-001: File CRUD Operations
 *
 * Uses page.request (carries login cookies with org context).
 * Each test creates its own data and cleans up in finally.
 */
test.describe('TC-FMS-FILES-001: File CRUD', () => {
  let contractorId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    contractorId = await ensureContractor(page.request)
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page, 'superadmin')
    await deleteContractorIfExists(page.request, contractorId)
    await page.close()
  })

  test('should create an FCL export file with auto-generated reference number', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId, {
        shipmentType: 'EXP',
        cargoType: 'FCL',
        notes: 'Integration test file',
      })
      fileId = file.id

      expect(file.id).toBeTruthy()
      expect(file.referenceNumber).toBeTruthy()
      expect(file.referenceNumber).toContain('EXP')
      expect(file.referenceNumber).toContain('FCL')
      expect(file.shipmentType).toBe('EXP')
      expect(file.cargoType).toBe('FCL')
      expect(file.contractorId).toBe(contractorId)
      expect(file.notes).toBe('Integration test file')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should create an LCL import file', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId, {
        shipmentType: 'IMP',
        cargoType: 'LCL',
      })
      fileId = file.id

      expect(file.referenceNumber).toContain('IMP')
      expect(file.referenceNumber).toContain('LCL')
      expect(file.cargoType).toBe('LCL')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should list files and find test-created record', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const response = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files?page=1&limit=50&contractorId=${contractorId}`,
      )
      expect(response.ok()).toBeTruthy()
      const body = await response.json() as { items: Array<{ id: string }>; total: number }
      expect(Array.isArray(body.items)).toBe(true)

      const found = body.items.find((item) => item.id === fileId)
      expect(found).toBeDefined()
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should filter files by shipment type', async ({ page }) => {
    await login(page, 'superadmin')
    let expFileId: string | null = null
    let impFileId: string | null = null
    try {
      const expFile = await createFileFixture(page.request, contractorId, { shipmentType: 'EXP' })
      expFileId = expFile.id
      const impFile = await createFileFixture(page.request, contractorId, { shipmentType: 'IMP' })
      impFileId = impFile.id

      const response = await page.request.fetch(
        `${BASE_URL}/api/fms_files/files?shipmentType=EXP&contractorId=${contractorId}&limit=100`,
      )
      expect(response.ok()).toBeTruthy()
      const body = await response.json() as { items: Array<{ id: string; shipmentType: string }> }

      expect(body.items.find((item) => item.id === expFileId)).toBeDefined()
      expect(body.items.find((item) => item.id === impFileId)).toBeUndefined()
    } finally {
      await deleteFileIfExists(page.request, expFileId)
      await deleteFileIfExists(page.request, impFileId)
    }
  })

  test('should get single file with enriched data', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const detail = await getFileById(page.request, file.id)
      expect(detail).toBeTruthy()
      expect(detail!.id).toBe(file.id)
      expect(detail).toHaveProperty('units')
      expect(detail).toHaveProperty('legs')
      expect(detail).toHaveProperty('unitLegs')
      expect(detail).toHaveProperty('status')
      expect(detail).toHaveProperty('warnings')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should update file notes', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const response = await page.request.fetch(`${BASE_URL}/api/fms_files/files/${file.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ notes: 'Updated notes' }),
      })
      expect(response.ok()).toBeTruthy()

      const updated = await getFileById(page.request, file.id)
      expect(updated!.notes).toBe('Updated notes')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should soft-delete a file', async ({ page }) => {
    await login(page, 'superadmin')
    const file = await createFileFixture(page.request, contractorId)

    const delResponse = await page.request.fetch(`${BASE_URL}/api/fms_files/files/${file.id}`, {
      method: 'DELETE',
    })
    expect(delResponse.ok()).toBeTruthy()

    // Verify excluded from list
    const listResponse = await page.request.fetch(
      `${BASE_URL}/api/fms_files/files?contractorId=${contractorId}&limit=100`,
    )
    const body = await listResponse.json() as { items: Array<{ id: string }> }
    expect(body.items.find((item) => item.id === file.id)).toBeUndefined()
  })

  test('should reject invalid shipment type', async ({ page }) => {
    await login(page, 'superadmin')
    const response = await page.request.fetch(`${BASE_URL}/api/fms_files/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        shipmentType: 'INVALID',
        cargoType: 'FCL',
        contractorId,
      }),
    })
    expect(response.ok()).toBeFalsy()
  })
})
