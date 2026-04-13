import type { NormalizedDocument, CheckStatus, ProductLine } from '../data/entities'

export interface ConsistencyCheckResult {
  field: string
  label: string
  sourceDoc1: string
  sourceDoc2: string
  value1: unknown
  value2: unknown
  status: CheckStatus
  discrepancy: string | null
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\b(ltd|llc|gmbh|sa|sp|zoo|co|inc|corp|bv|nv|srl|oy)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Filler/preposition words to strip for place name comparison */
const FILLER_WORDS = new Set(['in', 'of', 'at', 'the', 'de', 'du', 'des', 'a', 'an', 'and', 'or', 'port', 'city'])

function significantWords(value: string): string[] {
  return normalize(value).split(' ').filter((w) => w.length > 0 && !FILLER_WORDS.has(w))
}

function fuzzyMatch(valueA: string, valueB: string): boolean {
  const normalizedA = normalize(valueA)
  const normalizedB = normalize(valueB)

  // Exact match after normalization
  if (normalizedA === normalizedB) return true

  // Substring containment
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return true

  // Word-set overlap: all significant words from one appear in the other
  const wordsA = significantWords(valueA)
  const wordsB = significantWords(valueB)

  if (wordsA.length === 0 || wordsB.length === 0) return false

  const setA = new Set(wordsA)
  const setB = new Set(wordsB)

  const aInB = wordsA.every((w) => setB.has(w))
  const bInA = wordsB.every((w) => setA.has(w))

  return aInB || bInA
}

function withinTolerance(valueOne: number, valueTwo: number, tolerancePercent: number): boolean {
  if (tolerancePercent === 0) return valueOne === valueTwo
  return Math.abs(valueOne - valueTwo) / Math.max(valueOne, valueTwo) <= tolerancePercent / 100
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Extract unique product descriptions from product lines.
 * Packing lists often have per-container rows for the same product —
 * this deduplicates by normalized description.
 */
function uniqueProductDescriptions(lines: ProductLine[] | undefined | null): string[] {
  if (!lines || lines.length === 0) return []
  const seen = new Set<string>()
  const unique: string[] = []
  for (const line of lines) {
    if (!line.description) continue
    const key = normalize(line.description)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(line.description)
    }
  }
  return unique
}

function checkNumeric(
  label: string,
  field: string,
  sourceDoc1: string,
  sourceDoc2: string,
  value1: number | undefined | null,
  value2: number | undefined | null,
  tolerancePercent: number,
  unit: string,
): ConsistencyCheckResult {
  if (value1 == null && value2 == null) {
    return {
      field, label, sourceDoc1, sourceDoc2,
      value1: null, value2: null,
      status: 'missing',
      discrepancy: `Field not present in either document`,
    }
  }
  if (value1 == null) {
    return {
      field, label, sourceDoc1, sourceDoc2,
      value1: null, value2,
      status: 'missing',
      discrepancy: `Field not present in ${sourceDoc1}`,
    }
  }
  if (value2 == null) {
    return {
      field, label, sourceDoc1, sourceDoc2,
      value1, value2: null,
      status: 'missing',
      discrepancy: `Field not present in ${sourceDoc2}`,
    }
  }
  if (withinTolerance(value1, value2, tolerancePercent)) {
    return { field, label, sourceDoc1, sourceDoc2, value1, value2, status: 'ok', discrepancy: null }
  }

  const diff = value2 - value1
  const sign = diff > 0 ? '+' : ''
  return {
    field, label, sourceDoc1, sourceDoc2, value1, value2,
    status: 'mismatch',
    discrepancy: `${sourceDoc1}: ${formatNumber(value1)} ${unit} vs ${sourceDoc2}: ${formatNumber(value2)} ${unit} (diff: ${sign}${formatNumber(diff)} ${unit})`,
  }
}

/**
 * Sum product line quantities from a document's product lines.
 */
function sumLineQuantities(lines: ProductLine[] | undefined | null): number | null {
  if (!lines || lines.length === 0) return null
  return lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0)
}

/**
 * Check if a document's totalPackages is counting containers (matches container
 * list length) vs pieces (matches sum of product line quantities). Returns
 * 'containers' | 'pieces' | 'unknown'.
 */
function inferPackageSemantics(
  doc: NormalizedDocument,
): 'containers' | 'pieces' | 'unknown' {
  const total = doc.totalPackages
  if (total == null || total === 0) return 'unknown'

  const containerCount = doc.containerNumbers?.length ?? 0
  const pieceCount = sumLineQuantities(doc.productLines as ProductLine[] | undefined)

  // If totalPackages matches container count, it's counting containers
  if (containerCount > 0 && total === containerCount) return 'containers'

  // If totalPackages matches sum of line quantities, it's counting pieces
  if (pieceCount != null && pieceCount > 0 && total === pieceCount) return 'pieces'

  return 'unknown'
}

/**
 * Smart package count check that detects containers-vs-pieces semantic
 * differences using actual parsed data rather than divisibility heuristics.
 */
function checkPackageCount(
  label: string,
  field: string,
  sourceDoc1: string,
  sourceDoc2: string,
  doc1: NormalizedDocument,
  doc2: NormalizedDocument,
): ConsistencyCheckResult {
  const value1 = doc1.totalPackages
  const value2 = doc2.totalPackages

  // Delegate missing/equal cases to the standard numeric check
  if (value1 == null || value2 == null || value1 === value2) {
    return checkNumeric(label, field, sourceDoc1, sourceDoc2, value1, value2, 0, '')
  }

  // Values differ — check what each document is actually counting
  const semantics1 = inferPackageSemantics(doc1)
  const semantics2 = inferPackageSemantics(doc2)

  if (semantics1 !== semantics2 && semantics1 !== 'unknown' && semantics2 !== 'unknown') {
    // One is counting containers, the other pieces — not a real conflict
    const containerDoc = semantics1 === 'containers' ? sourceDoc1 : sourceDoc2
    const containerCount = semantics1 === 'containers' ? value1 : value2
    const pieceDoc = semantics1 === 'pieces' ? sourceDoc1 : sourceDoc2
    const pieceCount = semantics1 === 'pieces' ? value1 : value2
    const perContainer = containerCount > 0 ? pieceCount / containerCount : 0
    const perContainerStr = Number.isInteger(perContainer) ? String(perContainer) : perContainer.toFixed(1)
    return {
      field, label, sourceDoc1, sourceDoc2, value1, value2,
      status: 'warning',
      discrepancy: `${containerDoc} counts ${formatNumber(containerCount)} containers, ${pieceDoc} counts ${formatNumber(pieceCount)} pieces (${perContainerStr} per container)`,
    }
  }

  // Fallback: if at least one semantic is known, use it with the raw values
  if (semantics1 === 'containers' || semantics2 === 'containers') {
    const containerDoc = semantics1 === 'containers' ? sourceDoc1 : sourceDoc2
    const containerCount = semantics1 === 'containers' ? value1 : value2
    const otherDoc = semantics1 === 'containers' ? sourceDoc2 : sourceDoc1
    const otherCount = semantics1 === 'containers' ? value2 : value1
    if (otherCount > containerCount) {
      const perContainer = containerCount > 0 ? otherCount / containerCount : 0
      const perContainerStr = Number.isInteger(perContainer) ? String(perContainer) : perContainer.toFixed(1)
      return {
        field, label, sourceDoc1, sourceDoc2, value1, value2,
        status: 'warning',
        discrepancy: `${containerDoc} counts ${formatNumber(containerCount)} containers, ${otherDoc} reports ${formatNumber(otherCount)} (${perContainerStr} per container)`,
      }
    }
  }

  // Last resort: if both unknown but one is a clean multiple of the other,
  // it's likely containers vs pieces — warn rather than hard-fail
  if (value1 > 0 && value2 > 0) {
    const larger = Math.max(value1, value2)
    const smaller = Math.min(value1, value2)
    if (larger % smaller === 0) {
      const ratio = larger / smaller
      const fewerDoc = value1 < value2 ? sourceDoc1 : sourceDoc2
      const moreDoc = value1 < value2 ? sourceDoc2 : sourceDoc1
      return {
        field, label, sourceDoc1, sourceDoc2, value1, value2,
        status: 'warning',
        discrepancy: `${moreDoc} (${formatNumber(larger)}) is ${ratio}\u00D7 ${fewerDoc} (${formatNumber(smaller)}) \u2014 likely pieces vs containers`,
      }
    }
  }

  // Non-divisible, no evidence — genuine mismatch
  const diff = value2 - value1
  const sign = diff > 0 ? '+' : ''
  return {
    field, label, sourceDoc1, sourceDoc2, value1, value2,
    status: 'mismatch',
    discrepancy: `${sourceDoc1}: ${formatNumber(value1)} vs ${sourceDoc2}: ${formatNumber(value2)} (diff: ${sign}${formatNumber(diff)})`,
  }
}

function checkString(
  label: string,
  field: string,
  sourceDoc1: string,
  sourceDoc2: string,
  value1: string | undefined | null,
  value2: string | undefined | null,
): ConsistencyCheckResult {
  if (value1 == null && value2 == null) {
    return {
      field, label, sourceDoc1, sourceDoc2,
      value1: null, value2: null,
      status: 'missing',
      discrepancy: `Field not present in either document`,
    }
  }
  if (value1 == null) {
    return {
      field, label, sourceDoc1, sourceDoc2,
      value1: null, value2,
      status: 'missing',
      discrepancy: `Field not present in ${sourceDoc1}`,
    }
  }
  if (value2 == null) {
    return {
      field, label, sourceDoc1, sourceDoc2,
      value1, value2: null,
      status: 'missing',
      discrepancy: `Field not present in ${sourceDoc2}`,
    }
  }
  if (fuzzyMatch(value1, value2)) {
    return { field, label, sourceDoc1, sourceDoc2, value1, value2, status: 'ok', discrepancy: null }
  }
  return {
    field, label, sourceDoc1, sourceDoc2, value1, value2,
    status: 'mismatch',
    discrepancy: `${sourceDoc1}: '${value1}' vs ${sourceDoc2}: '${value2}'`,
  }
}

export class ConsistencyCheckerService {
  runChecks(
    blDoc: NormalizedDocument | null,
    invoiceDoc: NormalizedDocument | null,
    packingListDoc: NormalizedDocument | null,
  ): ConsistencyCheckResult[] {
    const results: ConsistencyCheckResult[] = []

    // Total gross weight: B/L vs Packing List (0% tolerance)
    if (blDoc && packingListDoc) {
      results.push(checkNumeric(
        'Total gross weight (B/L vs Packing List)',
        'totalGrossWeightKg',
        'B/L', 'Packing List',
        blDoc.totalGrossWeightKg, packingListDoc.totalGrossWeightKg,
        0, 'kg',
      ))
    }

    // Total gross weight: B/L vs Invoice (±2% tolerance)
    if (blDoc && invoiceDoc) {
      results.push(checkNumeric(
        'Total gross weight (B/L vs Invoice)',
        'totalGrossWeightKg',
        'B/L', 'Invoice',
        blDoc.totalGrossWeightKg, invoiceDoc.totalGrossWeightKg,
        2, 'kg',
      ))
    }

    // Total net weight: Packing List vs Invoice (0% tolerance)
    if (packingListDoc && invoiceDoc) {
      results.push(checkNumeric(
        'Total net weight',
        'totalNetWeightKg',
        'Packing List', 'Invoice',
        packingListDoc.totalNetWeightKg, invoiceDoc.totalNetWeightKg,
        0, 'kg',
      ))
    }

    // Total packages: B/L vs Packing List (smart containers-vs-pieces detection)
    if (blDoc && packingListDoc) {
      results.push(checkPackageCount(
        'Total packages (B/L vs Packing List)',
        'totalPackages_bl_pl',
        'B/L', 'Packing List',
        blDoc, packingListDoc,
      ))
    }

    // Total packages: Invoice vs Packing List (smart containers-vs-pieces detection)
    if (invoiceDoc && packingListDoc) {
      results.push(checkPackageCount(
        'Total packages (Invoice vs Packing List)',
        'totalPackages_inv_pl',
        'Invoice', 'Packing List',
        invoiceDoc, packingListDoc,
      ))
    }

    // Vessel name: B/L vs Packing List (fuzzy)
    if (blDoc && packingListDoc) {
      results.push(checkString(
        'Vessel name (B/L vs Packing List)',
        'vessel_bl_pl',
        'B/L', 'Packing List',
        blDoc.vessel, packingListDoc.vessel,
      ))
    }

    // Vessel name: B/L vs Invoice (fuzzy)
    if (blDoc && invoiceDoc) {
      results.push(checkString(
        'Vessel name (B/L vs Invoice)',
        'vessel_bl_inv',
        'B/L', 'Invoice',
        blDoc.vessel, invoiceDoc.vessel,
      ))
    }

    // Shipper name: B/L vs Invoice (fuzzy)
    if (blDoc && invoiceDoc) {
      results.push(checkString(
        'Shipper name',
        'shipperName',
        'B/L', 'Invoice',
        blDoc.shipperName, invoiceDoc.shipperName,
      ))
    }

    // Consignee name: B/L vs Invoice (fuzzy)
    if (blDoc && invoiceDoc) {
      results.push(checkString(
        'Consignee name',
        'consigneeName',
        'B/L', 'Invoice',
        blDoc.consigneeName, invoiceDoc.consigneeName,
      ))
    }

    // Buyer name: Invoice vs Packing List (fuzzy)
    if (invoiceDoc && packingListDoc) {
      results.push(checkString(
        'Buyer name',
        'buyerName',
        'Invoice', 'Packing List',
        invoiceDoc.buyerName, packingListDoc.buyerName,
      ))
    }

    // Total volume: B/L vs Packing List (±2% tolerance)
    if (blDoc && packingListDoc) {
      results.push(checkNumeric(
        'Total volume (B/L vs Packing List)',
        'totalVolumeCbm',
        'B/L', 'Packing List',
        blDoc.totalVolumeCbm, packingListDoc.totalVolumeCbm,
        2, 'CBM',
      ))
    }

    // Invoice reference: Invoice documentNumber vs Packing List invoiceReference (fuzzy)
    if (invoiceDoc && packingListDoc) {
      results.push(checkString(
        'Invoice reference',
        'invoiceReference',
        'Invoice', 'Packing List',
        invoiceDoc.documentNumber, packingListDoc.invoiceReference,
      ))
    }

    // Loading port: B/L vs Invoice (fuzzy)
    if (blDoc && invoiceDoc) {
      results.push(checkString(
        'Loading port (B/L vs Invoice)',
        'loadingPort_bl_inv',
        'B/L', 'Invoice',
        blDoc.loadingPort, invoiceDoc.loadingPort,
      ))
    }

    // Loading port: B/L vs Packing List (fuzzy)
    if (blDoc && packingListDoc) {
      results.push(checkString(
        'Loading port (B/L vs Packing List)',
        'loadingPort_bl_pl',
        'B/L', 'Packing List',
        blDoc.loadingPort, packingListDoc.loadingPort,
      ))
    }

    // Discharge port: B/L vs Invoice (fuzzy)
    if (blDoc && invoiceDoc) {
      results.push(checkString(
        'Discharge port (B/L vs Invoice)',
        'dischargePort_bl_inv',
        'B/L', 'Invoice',
        blDoc.dischargePort, invoiceDoc.dischargePort,
      ))
    }

    // Discharge port: B/L vs Packing List (fuzzy)
    if (blDoc && packingListDoc) {
      results.push(checkString(
        'Discharge port (B/L vs Packing List)',
        'dischargePort_bl_pl',
        'B/L', 'Packing List',
        blDoc.dischargePort, packingListDoc.dischargePort,
      ))
    }

    // Discharge port: Invoice vs Packing List (fuzzy)
    if (invoiceDoc && packingListDoc) {
      results.push(checkString(
        'Discharge port (Invoice vs Packing List)',
        'dischargePort_inv_pl',
        'Invoice', 'Packing List',
        invoiceDoc.dischargePort, packingListDoc.dischargePort,
      ))
    }

    // Product line count: Invoice vs Packing List
    // Packing lists often break down the same product by container (e.g. 3 rows
    // of "TYRES 33 00/R51" for 3 containers) while the invoice has 1 consolidated
    // line. Compare unique product descriptions instead of raw line counts.
    if (invoiceDoc && packingListDoc) {
      const invoiceUnique = uniqueProductDescriptions(invoiceDoc.productLines as ProductLine[] | undefined)
      const plUnique = uniqueProductDescriptions(packingListDoc.productLines as ProductLine[] | undefined)
      results.push(checkNumeric(
        'Unique product count',
        'productLineCount',
        'Invoice', 'Packing List',
        invoiceUnique.length || null, plUnique.length || null,
        0, 'products',
      ))
    }

    // Product descriptions: Invoice vs Packing List (match by description similarity)
    // Instead of comparing by index (line 1 vs line 1), find the best match across
    // unique descriptions to handle per-container breakdowns and reordering.
    if (invoiceDoc?.productLines && packingListDoc?.productLines) {
      const invoiceUnique = uniqueProductDescriptions(invoiceDoc.productLines as ProductLine[])
      const plUnique = uniqueProductDescriptions(packingListDoc.productLines as ProductLine[])
      const plMatched = new Set<number>()

      for (let i = 0; i < invoiceUnique.length; i++) {
        const invDesc = invoiceUnique[i]
        const lineNum = i + 1

        // Find best matching PL description (not yet matched)
        const matchIdx = plUnique.findIndex((plDesc, idx) => !plMatched.has(idx) && fuzzyMatch(invDesc, plDesc))
        if (matchIdx >= 0) {
          plMatched.add(matchIdx)
          results.push(checkString(
            `Product #${lineNum} description`,
            `productDescription_${lineNum}`,
            'Invoice', 'Packing List',
            invDesc, plUnique[matchIdx],
          ))
        } else {
          results.push(checkString(
            `Product #${lineNum} description`,
            `productDescription_${lineNum}`,
            'Invoice', 'Packing List',
            invDesc, null,
          ))
        }
      }

      // Report unmatched PL descriptions
      for (let idx = 0; idx < plUnique.length; idx++) {
        if (!plMatched.has(idx)) {
          const lineNum = invoiceUnique.length + idx + 1
          results.push(checkString(
            `Product #${lineNum} description`,
            `productDescription_${lineNum}`,
            'Invoice', 'Packing List',
            null, plUnique[idx],
          ))
        }
      }
    }

    return results
  }
}
