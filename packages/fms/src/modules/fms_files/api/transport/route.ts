/**
 * FMS Files Transport - Data API
 *
 * Returns paginated transport leg rows (1 row per unit-leg assignment).
 * Currently returns mock data for prototype purposes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { MOCK_TRANSPORT_LEG_TABLE } from '../../data/mock'
import type { MockTransportLegRow } from '../../data/mock'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
}

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).optional(),
  pageSize: z.coerce.number().min(1).max(500).optional(),
  q: z.string().optional(),
  search: z.string().optional(),
  sortField: z.string().optional().default('legSequence'),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
})

function matchesSearch(row: MockTransportLegRow, query: string): boolean {
  const lower = query.toLowerCase()
  return (
    row.referenceNumber.toLowerCase().includes(lower) ||
    (row.containerNumber?.toLowerCase().includes(lower) ?? false) ||
    (row.commodityDescription?.toLowerCase().includes(lower) ?? false) ||
    row.contractorName.toLowerCase().includes(lower) ||
    (row.legOrigin?.toLowerCase().includes(lower) ?? false) ||
    (row.legDestination?.toLowerCase().includes(lower) ?? false) ||
    (row.carrierName?.toLowerCase().includes(lower) ?? false) ||
    (row.vesselName?.toLowerCase().includes(lower) ?? false) ||
    (row.bookingNumber?.toLowerCase().includes(lower) ?? false) ||
    (row.assigneeName?.toLowerCase().includes(lower) ?? false) ||
    (row.driverFullName?.toLowerCase().includes(lower) ?? false) ||
    (row.masterBl?.toLowerCase().includes(lower) ?? false) ||
    (row.unitBl?.toLowerCase().includes(lower) ?? false)
  )
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const params = Object.fromEntries(url.searchParams.entries())

  const parsed = querySchema.safeParse(params)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })
  }

  const { page, limit, pageSize, q, search, sortField, sortDir } = parsed.data
  const effectivePageSize = limit ?? pageSize ?? 100
  const searchQuery = q ?? search ?? ''

  // Filter
  let items = [...MOCK_TRANSPORT_LEG_TABLE]
  if (searchQuery) {
    items = items.filter((row) => matchesSearch(row, searchQuery))
  }

  // Sort (multi-key: primary by sortField, secondary by containerNumber, tertiary by legSequence)
  items.sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[sortField]
    const bVal = (b as Record<string, unknown>)[sortField]
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1

    let cmp: number
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal
    } else {
      cmp = String(aVal).localeCompare(String(bVal))
    }
    if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp

    // Secondary: container number
    const aCnt = a.containerNumber ?? a.commodityDescription ?? ''
    const bCnt = b.containerNumber ?? b.commodityDescription ?? ''
    cmp = aCnt.localeCompare(bCnt)
    if (cmp !== 0) return cmp

    // Tertiary: leg sequence
    return (a.legSequence ?? 999) - (b.legSequence ?? 999)
  })

  // Paginate
  const total = items.length
  const totalPages = Math.ceil(total / effectivePageSize)
  const start = (page - 1) * effectivePageSize
  const pageItems = items.slice(start, start + effectivePageSize)

  return NextResponse.json({
    items: pageItems,
    total,
    page,
    pageSize: effectivePageSize,
    totalPages,
  })
}
