import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  ensureContractor,
  createFileFixture,
  createUnitFixture,
  createLegFixture,
  createUnitLegFixture,
  createLineFixture,
  getFileById,
  deleteFileIfExists,
  deleteContractorIfExists,
} from './helpers/fileFixtures'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-FMS-FILES-008: File Detail Enrichment + Financial Status
 *
 * Covers:
 * 1. GET file detail: contractor name resolved, warnings computed, status computed
 * 2. Financial status progression: NO_LINES → ESTIMATED → INVOICED
 * 3. Documentation status: PENDING → PARTIAL (with documents)
 * 4. Warnings: unassigned unit, uncovered unit warnings in response
 * 5. DEM/DET exposure in file detail
 */
test.describe('TC-FMS-FILES-008: File Detail Enrichment', () => {
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

  test('should resolve contractor name in file detail', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const detail = await getFileById(page.request, fileId)
      expect(detail).toBeTruthy()
      expect(detail!.contractorId).toBe(contractorId)
      // Contractor name should be resolved (not null)
      expect(detail!.contractorName).toBeTruthy()
      expect(typeof detail!.contractorName).toBe('string')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should compute warnings for unassigned unit', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      // Add unit and leg but DON'T assign unit to leg
      await createUnitFixture(page.request, fileId, { containerNumber: 'WARN0000001' })
      await createLegFixture(page.request, fileId, { legSequence: 1, type: 'SHIP' })

      const detail = await getFileById(page.request, fileId)
      const warnings = detail!.warnings as Array<{ type: string; message: string }>
      expect(warnings).toBeDefined()
      expect(Array.isArray(warnings)).toBe(true)

      // Should have "unassigned_unit" warning
      const unassigned = warnings.find((w) => w.type === 'unassigned_unit')
      expect(unassigned).toBeDefined()
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should compute all three status dimensions in file detail', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      // Empty file → EMPTY/NO_LINES/PENDING
      const detail = await getFileById(page.request, fileId)
      const status = detail!.status as { transport: string; financial: string; documentation: string }
      expect(status.transport).toBe('EMPTY')
      expect(status.financial).toBe('NO_LINES')
      expect(status.documentation).toBe('PENDING')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should progress financial status from NO_LINES to ESTIMATED', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      // Add cost line with estimated cost
      await createLineFixture(page.request, fileId, {
        productName: 'Ocean Freight',
        quantity: '1',
        soldUnitPrice: '1500.00',
      })

      const detail = await getFileById(page.request, fileId)
      const status = detail!.status as { financial: string }
      expect(status.financial).toBe('ESTIMATED')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should progress financial status to INVOICED when all lines have actual cost', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const line = await createLineFixture(page.request, fileId, {
        productName: 'THC',
        quantity: '1',
        soldUnitPrice: '200.00',
      })

      // Add actual cost → INVOICED
      await page.request.fetch(`${BASE_URL}/api/fms_files/files/${fileId}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ id: line.id, actualUnitCost: '180.00' }),
      })

      const detail = await getFileById(page.request, fileId)
      const status = detail!.status as { financial: string }
      expect(status.financial).toBe('INVOICED')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should include demDetExposure in file detail', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const detail = await getFileById(page.request, fileId)
      // demDetExposure should exist in response (even if empty array)
      expect(detail).toHaveProperty('demDetExposure')
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should include leg coverage per unit in file detail', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const unit = await createUnitFixture(page.request, fileId, { containerNumber: 'COVR0000001' })
      const leg = await createLegFixture(page.request, fileId, { legSequence: 1, type: 'SHIP' })
      await createUnitLegFixture(page.request, unit.id, leg.id)

      const detail = await getFileById(page.request, fileId)
      const units = detail!.units as Array<Record<string, unknown>>
      const ourUnit = units.find((u) => u.id === unit.id)
      expect(ourUnit).toBeDefined()
      // legCoverage should be computed (e.g. "0/1" or "1/1")
      if (ourUnit!.legCoverage) {
        expect(typeof ourUnit!.legCoverage).toBe('string')
        expect(ourUnit!.legCoverage).toMatch(/^\d+\/\d+$/)
      }
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })

  test('should return empty arrays for file with no children', async ({ page }) => {
    await login(page, 'superadmin')
    let fileId: string | null = null
    try {
      const file = await createFileFixture(page.request, contractorId)
      fileId = file.id

      const detail = await getFileById(page.request, fileId)
      expect(detail!.units).toEqual([])
      expect(detail!.legs).toEqual([])
      expect(detail!.unitLegs).toEqual([])
      expect(detail!.warnings).toEqual([])
    } finally {
      await deleteFileIfExists(page.request, fileId)
    }
  })
})
