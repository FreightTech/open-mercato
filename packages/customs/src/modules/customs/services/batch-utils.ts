import type { DocumentType, ProductLine, NormalizedDocument } from '../data/entities'

/**
 * Check if a filename looks like a UUID (with or without extension).
 * UUIDs contain hex segments separated by hyphens that would otherwise
 * be mistakenly parsed as group numbers.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function isUuidFilename(filename: string): boolean {
  const baseName = filename.replace(/\.[^.]+$/, '')
  return UUID_PATTERN.test(baseName)
}

/**
 * Detect document type from filename using common naming patterns.
 * Returns null if detection is uncertain (e.g., UUID filenames).
 */
export function detectDocumentType(filename: string): DocumentType | null {
  // UUID filenames carry no semantic meaning — skip detection
  if (isUuidFilename(filename)) {
    return null
  }

  const lower = filename.toLowerCase()

  // Bill of Lading patterns
  if (
    lower.includes('bill_of_lading') ||
    lower.includes('bill-of-lading') ||
    lower.includes('billoflading') ||
    lower.includes('b_l') ||
    lower.includes('b-l') ||
    lower.includes('bol') ||
    lower.includes('bl_') ||
    lower.includes('bl-') ||
    lower.startsWith('bl') ||
    lower.includes('sea_waybill') ||
    lower.includes('sea-waybill') ||
    lower.includes('seawaybill') ||
    lower.includes('waybill') ||
    lower.includes('konosament')
  ) {
    return 'bill_of_lading'
  }

  // Commercial Invoice patterns
  if (
    lower.includes('invoice') ||
    lower.includes('faktura') ||
    lower.includes('inv_') ||
    lower.includes('inv-') ||
    lower.startsWith('inv') ||
    lower.startsWith('ci') ||
    lower.includes('commercial_inv') ||
    lower.includes('commercial-inv')
  ) {
    return 'commercial_invoice'
  }

  // Packing List patterns
  if (
    lower.includes('packing') ||
    lower.includes('packinglist') ||
    lower.includes('packing_list') ||
    lower.includes('packing-list') ||
    lower.includes('pack_list') ||
    lower.includes('pack-list') ||
    lower.includes('packlist') ||
    lower.includes('pl_') ||
    lower.includes('pl-') ||
    lower.startsWith('pl') ||
    lower.includes('lista_pakowa') ||
    lower.includes('lista-pakowa')
  ) {
    return 'packing_list'
  }

  return null
}

export interface FileGroupInput {
  name: string
  groupId: string
  docType: DocumentType | null
}

export interface FileGroupResult {
  groupId: string
  bl: string | null
  invoice: string | null
  packingList: string | null
}

/**
 * Identifiers extracted by AI from a document's PDF content.
 * Used for smart grouping when filenames don't carry semantic meaning.
 */
export interface DocumentIdentifiers {
  type: DocumentType
  blNumber?: string
  invoiceNumber?: string
  shipperName?: string
  vessel?: string
}

export interface FileWithIdentifiers {
  name: string
  docType: DocumentType
  identifiers: DocumentIdentifiers
}

/**
 * Normalize a string for fuzzy matching: lowercase, trim, collapse whitespace.
 */
function normalize(value: string | undefined): string {
  if (!value) return ''
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Check if two strings are a fuzzy match (one contains the other, or equal after normalization).
 * Returns false if either is empty.
 */
function fuzzyMatch(a: string | undefined, b: string | undefined): boolean {
  const normA = normalize(a)
  const normB = normalize(b)
  if (!normA || !normB) return false
  return normA === normB || normA.includes(normB) || normB.includes(normA)
}

/**
 * Group documents into shipment triplets using extracted identifiers.
 *
 * Strategy:
 * 1. Seed groups from BL documents (each BL anchors a group by its blNumber)
 * 2. Match invoices to groups by: exact blNumber → fuzzy shipperName+vessel
 * 3. Match packing lists by: invoiceNumber match → blNumber match → shipperName+vessel
 * 4. Unmatched documents go round-robin into groups with empty slots
 */
export function smartGroupByIdentifiers(files: FileWithIdentifiers[]): FileGroupResult[] {
  const bls = files.filter((f) => f.docType === 'bill_of_lading')
  const invoices = files.filter((f) => f.docType === 'commercial_invoice')
  const packingLists = files.filter((f) => f.docType === 'packing_list')

  // Build groups seeded from BLs
  const groups: Array<{
    groupId: string
    bl: FileWithIdentifiers | null
    invoice: FileWithIdentifiers | null
    packingList: FileWithIdentifiers | null
    blNumber: string
    invoiceNumber: string
    shipperName: string
    vessel: string
  }> = []

  for (let idx = 0; idx < bls.length; idx++) {
    const bl = bls[idx]
    groups.push({
      groupId: String(idx + 1),
      bl,
      invoice: null,
      packingList: null,
      blNumber: normalize(bl.identifiers.blNumber),
      invoiceNumber: '',
      shipperName: normalize(bl.identifiers.shipperName),
      vessel: normalize(bl.identifiers.vessel),
    })
  }

  // If no BLs at all, seed groups from invoices
  if (groups.length === 0) {
    for (let idx = 0; idx < invoices.length; idx++) {
      const inv = invoices[idx]
      groups.push({
        groupId: String(idx + 1),
        bl: null,
        invoice: inv,
        packingList: null,
        blNumber: normalize(inv.identifiers.blNumber),
        invoiceNumber: normalize(inv.identifiers.invoiceNumber),
        shipperName: normalize(inv.identifiers.shipperName),
        vessel: normalize(inv.identifiers.vessel),
      })
    }
    // Match packing lists to invoice-seeded groups
    const unmatchedPl = matchPackingLists(packingLists, groups)
    assignUnmatchedToSlots(unmatchedPl, groups, 'packingList')

    return groups.map((g) => ({
      groupId: g.groupId,
      bl: g.bl?.name ?? null,
      invoice: g.invoice?.name ?? null,
      packingList: g.packingList?.name ?? null,
    }))
  }

  // Match invoices to BL-seeded groups
  const unmatchedInvoices: FileWithIdentifiers[] = []
  for (const inv of invoices) {
    const invBlNum = normalize(inv.identifiers.blNumber)
    const invShipper = normalize(inv.identifiers.shipperName)
    const invVessel = normalize(inv.identifiers.vessel)

    let matched = false

    // Priority 1: match by BL number
    if (invBlNum) {
      const group = groups.find((g) => !g.invoice && g.blNumber && fuzzyMatch(g.blNumber, invBlNum))
      if (group) {
        console.log(`[customs] Smart match: invoice "${inv.name}" → group ${group.groupId} (BL number: "${invBlNum}" matched "${group.blNumber}")`)
        group.invoice = inv
        group.invoiceNumber = normalize(inv.identifiers.invoiceNumber)
        matched = true
      }
    }

    // Priority 2: match by shipper + vessel — only if UNIQUE match (ambiguous = skip)
    if (!matched && invShipper && invVessel) {
      const candidates = groups.filter(
        (g) => !g.invoice && fuzzyMatch(g.shipperName, invShipper) && fuzzyMatch(g.vessel, invVessel),
      )
      if (candidates.length === 1) {
        console.log(`[customs] Smart match: invoice "${inv.name}" → group ${candidates[0].groupId} (shipper+vessel unique match)`)
        candidates[0].invoice = inv
        candidates[0].invoiceNumber = normalize(inv.identifiers.invoiceNumber)
        matched = true
      } else if (candidates.length > 1) {
        console.log(`[customs] Smart match: invoice "${inv.name}" — shipper+vessel ambiguous (${candidates.length} candidates), skipping`)
      }
    }

    // Priority 3: match by shipper name only — only if UNIQUE match
    if (!matched && invShipper) {
      const candidates = groups.filter(
        (g) => !g.invoice && fuzzyMatch(g.shipperName, invShipper),
      )
      if (candidates.length === 1) {
        console.log(`[customs] Smart match: invoice "${inv.name}" → group ${candidates[0].groupId} (shipper-only unique match)`)
        candidates[0].invoice = inv
        candidates[0].invoiceNumber = normalize(inv.identifiers.invoiceNumber)
        matched = true
      } else if (candidates.length > 1) {
        console.log(`[customs] Smart match: invoice "${inv.name}" — shipper-only ambiguous (${candidates.length} candidates), skipping`)
      }
    }

    if (!matched) {
      console.log(`[customs] Smart match: invoice "${inv.name}" — no match (blNum="${invBlNum}", shipper="${invShipper}", vessel="${invVessel}")`)
      unmatchedInvoices.push(inv)
    }
  }

  // Assign unmatched invoices to groups that still need one
  if (unmatchedInvoices.length > 0) {
    console.log(`[customs] Smart match: ${unmatchedInvoices.length} unmatched invoice(s) — assigning round-robin to empty slots`)
  }
  assignUnmatchedToSlots(unmatchedInvoices, groups, 'invoice')

  // Match packing lists
  const unmatchedPl = matchPackingLists(packingLists, groups)
  if (unmatchedPl.length > 0) {
    console.log(`[customs] Smart match: ${unmatchedPl.length} unmatched packing list(s) — assigning round-robin to empty slots`)
  }
  assignUnmatchedToSlots(unmatchedPl, groups, 'packingList')

  return groups.map((g) => ({
    groupId: g.groupId,
    bl: g.bl?.name ?? null,
    invoice: g.invoice?.name ?? null,
    packingList: g.packingList?.name ?? null,
  }))
}

function matchPackingLists(
  packingLists: FileWithIdentifiers[],
  groups: Array<{
    groupId: string
    bl: FileWithIdentifiers | null
    invoice: FileWithIdentifiers | null
    packingList: FileWithIdentifiers | null
    blNumber: string
    invoiceNumber: string
    shipperName: string
    vessel: string
  }>,
): FileWithIdentifiers[] {
  const unmatched: FileWithIdentifiers[] = []

  for (const pl of packingLists) {
    const plInvNum = normalize(pl.identifiers.invoiceNumber)
    const plBlNum = normalize(pl.identifiers.blNumber)
    const plShipper = normalize(pl.identifiers.shipperName)
    const plVessel = normalize(pl.identifiers.vessel)

    let matched = false

    // Priority 1: match by invoice number
    if (plInvNum) {
      const group = groups.find((g) => !g.packingList && g.invoiceNumber && fuzzyMatch(g.invoiceNumber, plInvNum))
      if (group) {
        group.packingList = pl
        matched = true
      }
    }

    // Priority 2: match by BL number
    if (!matched && plBlNum) {
      const group = groups.find((g) => !g.packingList && g.blNumber && fuzzyMatch(g.blNumber, plBlNum))
      if (group) {
        group.packingList = pl
        matched = true
      }
    }

    // Priority 3: match by shipper + vessel — only if UNIQUE match (ambiguous = skip)
    if (!matched && plShipper && plVessel) {
      const candidates = groups.filter(
        (g) => !g.packingList && fuzzyMatch(g.shipperName, plShipper) && fuzzyMatch(g.vessel, plVessel),
      )
      if (candidates.length === 1) {
        candidates[0].packingList = pl
        matched = true
      }
    }

    // Priority 4: match by shipper name only — only if UNIQUE match
    if (!matched && plShipper) {
      const candidates = groups.filter(
        (g) => !g.packingList && fuzzyMatch(g.shipperName, plShipper),
      )
      if (candidates.length === 1) {
        candidates[0].packingList = pl
        matched = true
      }
    }

    if (!matched) {
      unmatched.push(pl)
    }
  }

  return unmatched
}

function assignUnmatchedToSlots(
  unmatched: FileWithIdentifiers[],
  groups: Array<{
    groupId: string
    bl: FileWithIdentifiers | null
    invoice: FileWithIdentifiers | null
    packingList: FileWithIdentifiers | null
    blNumber: string
    invoiceNumber: string
    shipperName: string
    vessel: string
  }>,
  slot: 'invoice' | 'packingList',
): void {
  const remaining = [...unmatched]

  for (const file of remaining) {
    const group = groups.find((g) => !g[slot])
    if (group) {
      group[slot] = file
      if (slot === 'invoice') {
        group.invoiceNumber = normalize(file.identifiers.invoiceNumber)
      }
    }
    // If no group has an empty slot, the file is dropped (not enough BLs to anchor it)
  }
}

/**
 * Group files into shipment triplets by groupId.
 * Returns groups with filename references (not File objects) for testability.
 */
export function groupFilesByType(
  files: FileGroupInput[],
): FileGroupResult[] {
  const groups = new Map<string, FileGroupResult>()

  for (const { name, groupId, docType } of files) {
    if (!groups.has(groupId)) {
      groups.set(groupId, { groupId, bl: null, invoice: null, packingList: null })
    }
    const group = groups.get(groupId)!

    if (docType === 'bill_of_lading') {
      group.bl = name
    } else if (docType === 'commercial_invoice') {
      group.invoice = name
    } else if (docType === 'packing_list') {
      group.packingList = name
    }
  }

  return Array.from(groups.values())
}

/**
 * Auto-assign group IDs by extracting numeric suffixes from filenames.
 * Skips UUID filenames (their hex segments are not meaningful group numbers).
 * If no numeric pattern is found, groups by round-robin per type.
 */
export function autoAssignGroups(
  files: Array<{ name: string; docType: DocumentType | null }>,
): FileGroupInput[] {
  // Always start fresh — reset all groupIds to '0'
  const result: FileGroupInput[] = files.map((f) => ({
    name: f.name,
    groupId: '0',
    docType: f.docType,
  }))

  // Try to extract group identifiers from filenames, but skip UUIDs
  // Patterns from most specific to least specific:
  //   1. Separator-delimited: bl_01.pdf, invoice-02.pdf
  //   2. Trailing digits before extension: BL3.pdf, CI3.pdf, PL3.pdf
  const groupPattern = /[_\-\s.](\d{1,4})[_\-\s.]/
  const suffixPattern = /[_\-\s.](\d{1,4})\.[^.]+$/
  const trailingDigitPattern = /(\d{1,4})\.[^.]+$/

  for (const entry of result) {
    if (isUuidFilename(entry.name)) {
      continue
    }
    const match =
      entry.name.match(groupPattern) ??
      entry.name.match(suffixPattern) ??
      entry.name.match(trailingDigitPattern)
    if (match) {
      entry.groupId = match[1]
    }
  }

  // If no numeric groups detected, group by round-robin per type
  const hasNumericGroups = result.some((entry) => entry.groupId !== '0')
  if (!hasNumericGroups) {
    const byType: Record<string, FileGroupInput[]> = {
      bill_of_lading: [],
      commercial_invoice: [],
      packing_list: [],
    }

    for (const entry of result) {
      if (entry.docType && byType[entry.docType]) {
        byType[entry.docType].push(entry)
      }
    }

    const maxCount = Math.max(
      byType.bill_of_lading.length,
      byType.commercial_invoice.length,
      byType.packing_list.length,
    )

    for (let groupIndex = 0; groupIndex < maxCount; groupIndex++) {
      const groupId = String(groupIndex + 1)
      for (const type of ['bill_of_lading', 'commercial_invoice', 'packing_list'] as const) {
        if (byType[type][groupIndex]) {
          byType[type][groupIndex].groupId = groupId
        }
      }
    }
  }

  return result
}

/**
 * Enrich invoice product lines with weight data from the packing list.
 *
 * Invoices often lack per-line weights while packing lists have them.
 * Packing lists may also split the same product across containers
 * (e.g. 3 rows of "TYRES 33 00/R51") — in that case, weights are summed.
 *
 * Matching strategy:
 * 1. By lineNumber (exact) — only if PL has the same number of lines
 * 2. By description (fuzzy) — handles different line numbering
 *
 * Only fills in missing weight fields — never overwrites existing data.
 */
export function mergeWeightsFromPackingList(
  invoiceData: NormalizedDocument | null | undefined,
  plData: NormalizedDocument | null | undefined,
): ProductLine[] | null {
  const invLines = invoiceData?.productLines as ProductLine[] | undefined
  if (!invLines || invLines.length === 0) return invLines ?? null

  const plLines = plData?.productLines as ProductLine[] | undefined
  if (!plLines || plLines.length === 0) return invLines

  const result: ProductLine[] = invLines.map((line) => ({ ...line }))

  // Try matching by lineNumber first when line counts match exactly
  if (result.length === plLines.length) {
    for (const invLine of result) {
      const plMatch = plLines.find((pl) => pl.lineNumber === invLine.lineNumber)
      if (plMatch) {
        if (invLine.grossWeightKg == null && plMatch.grossWeightKg != null) {
          invLine.grossWeightKg = plMatch.grossWeightKg
        }
        if (invLine.netWeightKg == null && plMatch.netWeightKg != null) {
          invLine.netWeightKg = plMatch.netWeightKg
        }
      }
    }
    return result
  }

  // Line counts differ (per-container breakdown) — match by description and sum weights
  for (const invLine of result) {
    if (invLine.grossWeightKg != null && invLine.netWeightKg != null) continue

    const invDesc = normalize(invLine.description)
    if (!invDesc) continue

    const matchingPlLines = plLines.filter((pl) => fuzzyMatch(invDesc, normalize(pl.description)))
    if (matchingPlLines.length === 0) continue

    if (invLine.grossWeightKg == null) {
      const totalGross = matchingPlLines.reduce((sum, pl) => sum + (pl.grossWeightKg ?? 0), 0)
      if (totalGross > 0) invLine.grossWeightKg = totalGross
    }
    if (invLine.netWeightKg == null) {
      const totalNet = matchingPlLines.reduce((sum, pl) => sum + (pl.netWeightKg ?? 0), 0)
      if (totalNet > 0) invLine.netWeightKg = totalNet
    }
  }

  return result
}
