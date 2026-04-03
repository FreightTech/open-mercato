import type { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FileRecord {
  id: string
  referenceNumber: string
  shipmentType: string
  cargoType: string
  contractorId: string
  assigneeId: string | null
  notes: string | null
}

export interface UnitRecord {
  id: string
  cargoType: string
  containerNumber: string | null
  containerType: string | null
  commodityDescription: string | null
  sortOrder: number
}

export interface LegRecord {
  id: string
  legSequence: number
  type: string
  vesselName: string | null
  bookingNumber: string | null
  notes: string | null
}

export interface UnitLegRecord {
  id: string
  unitId: string
  legId: string
  truckPlate: string | null
}

export interface LineRecord {
  id: string
  productName: string
  quantity: string
  currencyCode: string
  soldUnitPrice: string
  soldAmount: string
}

export interface NoteRecord {
  id: string
  body: string
  authorUserId: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * All fixtures use `page.request` (from Playwright Page context) which carries
 * login cookies — including om_selected_org and om_selected_tenant.
 * This is required for makeCrudRoute endpoints that resolve org from cookies.
 */
function headers() {
  return { 'Content-Type': 'application/json' }
}

// ─── Contractor (needed as FK for file creation) ────────────────────────────

export async function ensureContractor(
  request: APIRequestContext,
): Promise<string> {
  const response = await request.fetch(`${BASE_URL}/api/contractors/contractors`, {
    method: 'POST',
    headers: headers(),
    data: JSON.stringify({
      name: `Test Contractor ${Date.now()}`,
      shortName: 'TST',
    }),
  })
  if (!response.ok()) {
    throw new Error(`Failed to create contractor: ${await response.text()}`)
  }
  const body = await response.json() as { id?: string; item?: { id: string } }
  const id = body.id ?? body.item?.id
  if (!id) throw new Error('Contractor creation returned no id')
  return id
}

export async function deleteContractorIfExists(
  request: APIRequestContext,
  contractorId: string | null,
): Promise<void> {
  if (!contractorId) return
  try {
    await request.fetch(`${BASE_URL}/api/contractors/contractors/${contractorId}`, {
      method: 'DELETE',
    })
  } catch { /* best-effort */ }
}

// ─── File CRUD ──────────────────────────────────────────────────────────────

export async function createFileFixture(
  request: APIRequestContext,
  contractorId: string,
  opts: { shipmentType?: string; cargoType?: string; notes?: string } = {},
): Promise<FileRecord> {
  const response = await request.fetch(`${BASE_URL}/api/fms_files/files`, {
    method: 'POST',
    headers: headers(),
    data: JSON.stringify({
      shipmentType: opts.shipmentType ?? 'EXP',
      cargoType: opts.cargoType ?? 'FCL',
      contractorId,
      notes: opts.notes ?? null,
    }),
  })
  if (!response.ok()) {
    throw new Error(`Failed to create file (${response.status()}): ${await response.text()}`)
  }
  return (await response.json()) as FileRecord
}

export async function getFileById(
  request: APIRequestContext,
  fileId: string,
): Promise<Record<string, unknown> | null> {
  const response = await request.fetch(`${BASE_URL}/api/fms_files/files/${fileId}`, {
    method: 'GET',
  })
  if (!response.ok()) return null
  return (await response.json()) as Record<string, unknown>
}

export async function deleteFileIfExists(
  request: APIRequestContext,
  fileId: string | null,
): Promise<void> {
  if (!fileId) return
  try {
    await request.fetch(`${BASE_URL}/api/fms_files/files/${fileId}`, {
      method: 'DELETE',
    })
  } catch { /* best-effort */ }
}

// ─── Unit CRUD ──────────────────────────────────────────────────────────────

export async function createUnitFixture(
  request: APIRequestContext,
  fileId: string,
  opts: {
    cargoType?: string
    containerNumber?: string
    containerType?: string
    commodityDescription?: string
  } = {},
): Promise<UnitRecord> {
  const response = await request.fetch(`${BASE_URL}/api/fms_files/files/${fileId}/units`, {
    method: 'POST',
    headers: headers(),
    data: JSON.stringify({
      fileId,
      cargoType: opts.cargoType ?? 'FCL',
      containerNumber: opts.containerNumber ?? null,
      containerType: opts.containerType ?? null,
      commodityDescription: opts.commodityDescription ?? null,
    }),
  })
  if (!response.ok()) {
    throw new Error(`Failed to create unit (${response.status()}): ${await response.text()}`)
  }
  return (await response.json()) as UnitRecord
}

// ─── Leg CRUD ───────────────────────────────────────────────────────────────

export async function createLegFixture(
  request: APIRequestContext,
  fileId: string,
  opts: {
    legSequence?: number
    type?: string
    vesselName?: string
    bookingNumber?: string
    notes?: string
  } = {},
): Promise<LegRecord> {
  const response = await request.fetch(`${BASE_URL}/api/fms_files/files/${fileId}/legs`, {
    method: 'POST',
    headers: headers(),
    data: JSON.stringify({
      legSequence: opts.legSequence ?? 1,
      type: opts.type ?? 'SHIP',
      vesselName: opts.vesselName ?? null,
      bookingNumber: opts.bookingNumber ?? null,
      notes: opts.notes ?? null,
    }),
  })
  if (!response.ok()) {
    throw new Error(`Failed to create leg (${response.status()}): ${await response.text()}`)
  }
  return (await response.json()) as LegRecord
}

// ─── Unit-Leg CRUD ──────────────────────────────────────────────────────────

export async function createUnitLegFixture(
  request: APIRequestContext,
  unitId: string,
  legId: string,
  opts: { truckPlate?: string } = {},
): Promise<UnitLegRecord> {
  const response = await request.fetch(`${BASE_URL}/api/fms_files/unit-legs`, {
    method: 'POST',
    headers: headers(),
    data: JSON.stringify({
      unitId,
      legId,
      truckPlate: opts.truckPlate ?? null,
    }),
  })
  if (!response.ok()) {
    throw new Error(`Failed to create unit-leg (${response.status()}): ${await response.text()}`)
  }
  return (await response.json()) as UnitLegRecord
}

// ─── Cost Lines ─────────────────────────────────────────────────────────────

export async function createLineFixture(
  request: APIRequestContext,
  fileId: string,
  opts: {
    productName?: string
    quantity?: string
    soldUnitPrice?: string
    currencyCode?: string
  } = {},
): Promise<LineRecord> {
  const response = await request.fetch(`${BASE_URL}/api/fms_files/files/${fileId}/lines`, {
    method: 'POST',
    headers: headers(),
    data: JSON.stringify({
      productName: opts.productName ?? 'Ocean Freight',
      quantity: opts.quantity ?? '1',
      soldUnitPrice: opts.soldUnitPrice ?? '1500.00',
      currencyCode: opts.currencyCode ?? 'USD',
    }),
  })
  if (!response.ok()) {
    throw new Error(`Failed to create line (${response.status()}): ${await response.text()}`)
  }
  return (await response.json()) as LineRecord
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export async function createNoteFixture(
  request: APIRequestContext,
  fileId: string,
  body: string,
): Promise<NoteRecord> {
  const response = await request.fetch(`${BASE_URL}/api/fms_files/files/${fileId}/notes`, {
    method: 'POST',
    headers: headers(),
    data: JSON.stringify({ body }),
  })
  if (!response.ok()) {
    throw new Error(`Failed to create note (${response.status()}): ${await response.text()}`)
  }
  return (await response.json()) as NoteRecord
}
