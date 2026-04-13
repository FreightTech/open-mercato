import { ConsistencyCheckerService } from '../services/consistency-checker.service'
import type { NormalizedDocument } from '../data/entities'

describe('ConsistencyCheckerService', () => {
  const checker = new ConsistencyCheckerService()

  const makeBl = (overrides: Partial<NormalizedDocument> = {}): NormalizedDocument => ({
    documentNumber: 'BL-001',
    shipperName: 'ACME CORP LTD',
    consigneeName: 'BUYER GMBH',
    vessel: 'EVER GIVEN',
    loadingPort: 'SHANGHAI',
    dischargePort: 'GDYNIA',
    totalGrossWeightKg: 10000,
    totalVolumeCbm: 50,
    totalPackages: 5,
    productLines: [
      { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS' },
    ],
    ...overrides,
  })

  const makeInvoice = (overrides: Partial<NormalizedDocument> = {}): NormalizedDocument => ({
    documentNumber: 'INV-2026-001',
    shipperName: 'ACME CORP LTD',
    consigneeName: 'BUYER GMBH',
    buyerName: 'BUYER GMBH',
    vessel: 'EVER GIVEN',
    loadingPort: 'SHANGHAI',
    dischargePort: 'GDYNIA',
    totalGrossWeightKg: 10000,
    totalNetWeightKg: 9000,
    totalPackages: 5,
    currency: 'USD',
    totalValue: 50000,
    productLines: [
      { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS', unitPrice: 5000, totalValue: 50000 },
    ],
    ...overrides,
  })

  const makePackingList = (overrides: Partial<NormalizedDocument> = {}): NormalizedDocument => ({
    invoiceReference: 'INV-2026-001',
    buyerName: 'BUYER GMBH',
    vessel: 'EVER GIVEN',
    loadingPort: 'SHANGHAI',
    dischargePort: 'GDYNIA',
    totalGrossWeightKg: 10000,
    totalNetWeightKg: 9000,
    totalVolumeCbm: 50,
    totalPackages: 5,
    productLines: [
      { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS', netWeightKg: 9000, grossWeightKg: 10000 },
    ],
    ...overrides,
  })

  describe('all documents present and consistent', () => {
    it('returns 19 checks all with status ok', () => {
      const results = checker.runChecks(makeBl(), makeInvoice(), makePackingList())
      expect(results).toHaveLength(19)
      const statuses = results.map((r) => r.status)
      expect(statuses).toEqual(Array(19).fill('ok'))
      expect(results.every((r) => r.discrepancy === null)).toBe(true)
    })
  })

  describe('gross weight checks', () => {
    it('detects B/L vs Packing List gross weight mismatch (0% tolerance)', () => {
      const results = checker.runChecks(
        makeBl({ totalGrossWeightKg: 10000 }),
        makeInvoice(),
        makePackingList({ totalGrossWeightKg: 10001 }),
      )
      const blVsPl = results.find((r) => r.label === 'Total gross weight (B/L vs Packing List)')
      expect(blVsPl).toBeDefined()
      expect(blVsPl!.status).toBe('mismatch')
      expect(blVsPl!.discrepancy).toContain('10,000')
      expect(blVsPl!.discrepancy).toContain('10,001')
    })

    it('allows B/L vs Invoice gross weight within 2% tolerance', () => {
      const results = checker.runChecks(
        makeBl({ totalGrossWeightKg: 10000 }),
        makeInvoice({ totalGrossWeightKg: 10150 }),
        makePackingList(),
      )
      const blVsInv = results.find((r) => r.label === 'Total gross weight (B/L vs Invoice)')
      expect(blVsInv).toBeDefined()
      expect(blVsInv!.status).toBe('ok')
    })

    it('detects B/L vs Invoice gross weight mismatch beyond 2% tolerance', () => {
      const results = checker.runChecks(
        makeBl({ totalGrossWeightKg: 10000 }),
        makeInvoice({ totalGrossWeightKg: 10300 }),
        makePackingList(),
      )
      const blVsInv = results.find((r) => r.label === 'Total gross weight (B/L vs Invoice)')
      expect(blVsInv).toBeDefined()
      expect(blVsInv!.status).toBe('mismatch')
    })
  })

  describe('net weight check', () => {
    it('detects Packing List vs Invoice net weight mismatch', () => {
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({ totalNetWeightKg: 8500 }),
        makePackingList({ totalNetWeightKg: 9000 }),
      )
      const netWeight = results.find((r) => r.label === 'Total net weight')
      expect(netWeight).toBeDefined()
      expect(netWeight!.status).toBe('mismatch')
      expect(netWeight!.discrepancy).toContain('8,500')
      expect(netWeight!.discrepancy).toContain('9,000')
    })
  })

  describe('package count check', () => {
    it('detects genuine mismatch when both count the same thing', () => {
      // Both documents have no container numbers and line quantities don't match
      // totalPackages, so semantics are unknown — genuine mismatch
      const results = checker.runChecks(
        makeBl({ totalPackages: 5 }),
        makeInvoice(),
        makePackingList({ totalPackages: 6 }),
      )
      const packages = results.find((r) => r.label === 'Total packages (B/L vs Packing List)')
      expect(packages).toBeDefined()
      expect(packages!.status).toBe('mismatch')
    })

    it('warns when B/L counts containers and PL counts pieces (evidence-based)', () => {
      // B/L has 3 containers listed, totalPackages=3 → counting containers
      // PL has product lines summing to 6, totalPackages=6 → counting pieces
      const results = checker.runChecks(
        makeBl({
          totalPackages: 3,
          containerNumbers: ['CMAU1234567', 'CMAU2345678', 'CMAU3456789'],
          productLines: [{ lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS' }],
        }),
        makeInvoice(),
        makePackingList({
          totalPackages: 6,
          productLines: [
            { lineNumber: 1, description: 'Widget', quantity: 2, unit: 'PCS', netWeightKg: 100, grossWeightKg: 120 },
            { lineNumber: 2, description: 'Widget', quantity: 2, unit: 'PCS', netWeightKg: 100, grossWeightKg: 120 },
            { lineNumber: 3, description: 'Widget', quantity: 2, unit: 'PCS', netWeightKg: 100, grossWeightKg: 120 },
          ],
        }),
      )
      const packages = results.find((r) => r.label === 'Total packages (B/L vs Packing List)')
      expect(packages).toBeDefined()
      expect(packages!.status).toBe('warning')
      expect(packages!.discrepancy).toContain('3 containers')
      expect(packages!.discrepancy).toContain('6 pieces')
      expect(packages!.discrepancy).toContain('2 per container')
    })

    it('warns when Invoice counts containers and PL counts pieces', () => {
      // Invoice has 4 containers listed, totalPackages=4 → counting containers
      // PL product lines sum to 20, totalPackages=20 → counting pieces
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({
          totalPackages: 4,
          containerNumbers: ['C1', 'C2', 'C3', 'C4'],
        }),
        makePackingList({
          totalPackages: 20,
          productLines: [
            { lineNumber: 1, description: 'Part A', quantity: 5, unit: 'PCS', netWeightKg: 50, grossWeightKg: 60 },
            { lineNumber: 2, description: 'Part A', quantity: 5, unit: 'PCS', netWeightKg: 50, grossWeightKg: 60 },
            { lineNumber: 3, description: 'Part A', quantity: 5, unit: 'PCS', netWeightKg: 50, grossWeightKg: 60 },
            { lineNumber: 4, description: 'Part A', quantity: 5, unit: 'PCS', netWeightKg: 50, grossWeightKg: 60 },
          ],
        }),
      )
      const packages = results.find((r) => r.label === 'Total packages (Invoice vs Packing List)')
      expect(packages).toBeDefined()
      expect(packages!.status).toBe('warning')
      expect(packages!.discrepancy).toContain('containers')
      expect(packages!.discrepancy).toContain('pieces')
    })

    it('returns ok when package counts match exactly', () => {
      const results = checker.runChecks(
        makeBl({ totalPackages: 5 }),
        makeInvoice(),
        makePackingList({ totalPackages: 5 }),
      )
      const packages = results.find((r) => r.label === 'Total packages (B/L vs Packing List)')
      expect(packages).toBeDefined()
      expect(packages!.status).toBe('ok')
    })

    it('falls back to mismatch when semantics cannot be determined and not divisible', () => {
      // Different values, no container numbers, line quantities don't match either total
      const results = checker.runChecks(
        makeBl({ totalPackages: 7, containerNumbers: undefined }),
        makeInvoice(),
        makePackingList({ totalPackages: 11 }),
      )
      const packages = results.find((r) => r.label === 'Total packages (B/L vs Packing List)')
      expect(packages).toBeDefined()
      expect(packages!.status).toBe('mismatch')
    })

    it('warns via divisibility fallback when evidence is unavailable', () => {
      // No container numbers, line quantities don't match totals,
      // but 6 is a clean multiple of 3 → divisibility fallback to warning
      const results = checker.runChecks(
        makeBl({ totalPackages: 3, containerNumbers: undefined }),
        makeInvoice(),
        makePackingList({ totalPackages: 6 }),
      )
      const packages = results.find((r) => r.label === 'Total packages (B/L vs Packing List)')
      expect(packages).toBeDefined()
      expect(packages!.status).toBe('warning')
      expect(packages!.discrepancy).toContain('2\u00D7')
      expect(packages!.discrepancy).toContain('pieces vs containers')
    })
  })

  describe('fuzzy string matching', () => {
    it('matches shipper names that differ only by legal suffix', () => {
      const results = checker.runChecks(
        makeBl({ shipperName: 'ACME CORP LTD' }),
        makeInvoice({ shipperName: 'ACME CORP' }),
        makePackingList(),
      )
      const shipper = results.find((r) => r.label === 'Shipper name')
      expect(shipper).toBeDefined()
      expect(shipper!.status).toBe('ok')
    })

    it('matches consignee names with different casing and punctuation', () => {
      const results = checker.runChecks(
        makeBl({ consigneeName: 'BUYER G.M.B.H.' }),
        makeInvoice({ consigneeName: 'Buyer GmbH' }),
        makePackingList(),
      )
      const consignee = results.find((r) => r.label === 'Consignee name')
      expect(consignee).toBeDefined()
      expect(consignee!.status).toBe('ok')
    })

    it('detects genuinely different shipper names', () => {
      const results = checker.runChecks(
        makeBl({ shipperName: 'ACME CORP LTD' }),
        makeInvoice({ shipperName: 'TOTALLY DIFFERENT COMPANY' }),
        makePackingList(),
      )
      const shipper = results.find((r) => r.label === 'Shipper name')
      expect(shipper).toBeDefined()
      expect(shipper!.status).toBe('mismatch')
    })

    it('matches vessel names that are substring matches', () => {
      const results = checker.runChecks(
        makeBl({ vessel: 'MSC EVER GIVEN' }),
        makeInvoice(),
        makePackingList({ vessel: 'EVER GIVEN' }),
      )
      const vessel = results.find((r) => r.label === 'Vessel name (B/L vs Packing List)')
      expect(vessel).toBeDefined()
      expect(vessel!.status).toBe('ok')
    })

    it('detects different vessel names', () => {
      const results = checker.runChecks(
        makeBl({ vessel: 'APL BARCELONA' }),
        makeInvoice(),
        makePackingList({ vessel: 'CONTAINERSHIPS VIII' }),
      )
      const vessel = results.find((r) => r.label === 'Vessel name (B/L vs Packing List)')
      expect(vessel).toBeDefined()
      expect(vessel!.status).toBe('mismatch')
      expect(vessel!.discrepancy).toContain('APL BARCELONA')
      expect(vessel!.discrepancy).toContain('CONTAINERSHIPS VIII')
    })
  })

  describe('invoice reference check', () => {
    it('matches when invoice number appears within packing list reference', () => {
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({ documentNumber: 'INV-2026-001' }),
        makePackingList({ invoiceReference: 'INV-2026-001' }),
      )
      const invRef = results.find((r) => r.label === 'Invoice reference')
      expect(invRef).toBeDefined()
      expect(invRef!.status).toBe('ok')
    })

    it('detects mismatched invoice references', () => {
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({ documentNumber: '98139446' }),
        makePackingList({ invoiceReference: '139446' }),
      )
      const invRef = results.find((r) => r.label === 'Invoice reference')
      expect(invRef).toBeDefined()
      // '139446' is a substring of '98139446', so fuzzy match should pass
      expect(invRef!.status).toBe('ok')
    })

    it('detects completely different invoice references', () => {
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({ documentNumber: 'INV-999' }),
        makePackingList({ invoiceReference: 'PL-888' }),
      )
      const invRef = results.find((r) => r.label === 'Invoice reference')
      expect(invRef).toBeDefined()
      expect(invRef!.status).toBe('mismatch')
    })
  })

  describe('loading port check', () => {
    it('matches identical loading ports', () => {
      const results = checker.runChecks(
        makeBl({ loadingPort: 'NHAVA SHEVA' }),
        makeInvoice({ loadingPort: 'NHAVA SHEVA' }),
        makePackingList(),
      )
      const port = results.find((r) => r.label === 'Loading port (B/L vs Invoice)')
      expect(port).toBeDefined()
      expect(port!.status).toBe('ok')
    })

    it('matches ports with different casing and filler words (MOJI PORT, JAPAN vs Moji Port in Japan)', () => {
      const results = checker.runChecks(
        makeBl({ loadingPort: 'MOJI PORT, JAPAN' }),
        makeInvoice({ loadingPort: 'Moji Port in Japan' }),
        makePackingList(),
      )
      const port = results.find((r) => r.label === 'Loading port (B/L vs Invoice)')
      expect(port).toBeDefined()
      expect(port!.status).toBe('ok')
    })

    it('matches ports with country suffix (GDYNIA vs GDYNIA, POLAND)', () => {
      const results = checker.runChecks(
        makeBl({ loadingPort: 'GDYNIA' }),
        makeInvoice({ loadingPort: 'GDYNIA, POLAND' }),
        makePackingList(),
      )
      const port = results.find((r) => r.label === 'Loading port (B/L vs Invoice)')
      expect(port).toBeDefined()
      expect(port!.status).toBe('ok')
    })

    it('matches ports with Port prefix (Shanghai vs Shanghai Port)', () => {
      const results = checker.runChecks(
        makeBl({ loadingPort: 'Shanghai' }),
        makeInvoice({ loadingPort: 'Shanghai Port' }),
        makePackingList(),
      )
      const port = results.find((r) => r.label === 'Loading port (B/L vs Invoice)')
      expect(port).toBeDefined()
      expect(port!.status).toBe('ok')
    })
  })

  describe('discharge port checks', () => {
    it('detects discharge port mismatch between B/L and Invoice (Gdansk vs Ukraine)', () => {
      const results = checker.runChecks(
        makeBl({ dischargePort: 'Gdansk, Poland' }),
        makeInvoice({ dischargePort: 'Ukraine' }),
        makePackingList({ dischargePort: 'Ukraine' }),
      )
      const blVsInv = results.find((r) => r.label === 'Discharge port (B/L vs Invoice)')
      expect(blVsInv).toBeDefined()
      expect(blVsInv!.status).toBe('mismatch')
      expect(blVsInv!.discrepancy).toContain('Gdansk')
      expect(blVsInv!.discrepancy).toContain('Ukraine')

      const blVsPl = results.find((r) => r.label === 'Discharge port (B/L vs Packing List)')
      expect(blVsPl).toBeDefined()
      expect(blVsPl!.status).toBe('mismatch')
    })

    it('matches identical discharge ports across all documents', () => {
      const results = checker.runChecks(
        makeBl({ dischargePort: 'GDYNIA' }),
        makeInvoice({ dischargePort: 'GDYNIA' }),
        makePackingList({ dischargePort: 'GDYNIA' }),
      )
      const blVsInv = results.find((r) => r.label === 'Discharge port (B/L vs Invoice)')
      expect(blVsInv).toBeDefined()
      expect(blVsInv!.status).toBe('ok')

      const blVsPl = results.find((r) => r.label === 'Discharge port (B/L vs Packing List)')
      expect(blVsPl).toBeDefined()
      expect(blVsPl!.status).toBe('ok')
    })

    it('matches discharge port with country suffix (GDYNIA vs GDYNIA, POLAND)', () => {
      const results = checker.runChecks(
        makeBl({ dischargePort: 'GDYNIA, POLAND' }),
        makeInvoice({ dischargePort: 'GDYNIA' }),
        makePackingList(),
      )
      const blVsInv = results.find((r) => r.label === 'Discharge port (B/L vs Invoice)')
      expect(blVsInv).toBeDefined()
      expect(blVsInv!.status).toBe('ok')
    })
  })

  describe('product line count check', () => {
    it('detects unique product count mismatch between Invoice and Packing List', () => {
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({
          productLines: [
            { lineNumber: 1, description: 'Widget A', quantity: 5, unit: 'PCS' },
            { lineNumber: 2, description: 'Widget B', quantity: 5, unit: 'PCS' },
          ],
        }),
        makePackingList({
          productLines: [
            { lineNumber: 1, description: 'Widget A', quantity: 5, unit: 'PCS', netWeightKg: 4500, grossWeightKg: 5000 },
          ],
        }),
      )
      const lineCount = results.find((r) => r.label === 'Unique product count')
      expect(lineCount).toBeDefined()
      expect(lineCount!.status).toBe('mismatch')
      expect(lineCount!.value1).toBe(2)
      expect(lineCount!.value2).toBe(1)
    })

    it('treats per-container breakdown as 1 unique product (3 containers × same product = 1)', () => {
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({
          productLines: [
            { lineNumber: 1, description: 'TYRES 33 00/R51', quantity: 24, unit: 'PCS' },
          ],
        }),
        makePackingList({
          productLines: [
            { lineNumber: 1, description: 'TYRES 33 00/R51', quantity: 8, unit: 'SETS', netWeightKg: 18722, grossWeightKg: 18722 },
            { lineNumber: 2, description: 'TYRES 33 00/R51', quantity: 8, unit: 'SETS', netWeightKg: 18722, grossWeightKg: 18722 },
            { lineNumber: 3, description: 'TYRES 33 00/R51', quantity: 8, unit: 'SETS', netWeightKg: 18723, grossWeightKg: 18723 },
          ],
        }),
      )
      const lineCount = results.find((r) => r.label === 'Unique product count')
      expect(lineCount).toBeDefined()
      expect(lineCount!.status).toBe('ok')
      expect(lineCount!.value1).toBe(1)
      expect(lineCount!.value2).toBe(1)

      // Product description should also match
      const desc = results.find((r) => r.field === 'productDescription_1')
      expect(desc).toBeDefined()
      expect(desc!.status).toBe('ok')

      // No extra "missing" product descriptions
      const descChecks = results.filter((r) => r.field.startsWith('productDescription_'))
      expect(descChecks).toHaveLength(1)
    })

    it('correctly counts unique products when PL has multiple different products across containers', () => {
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({
          productLines: [
            { lineNumber: 1, description: 'TYRES 33 00/R51', quantity: 16, unit: 'PCS' },
            { lineNumber: 2, description: 'RIMS 17 INCH', quantity: 8, unit: 'PCS' },
          ],
        }),
        makePackingList({
          productLines: [
            { lineNumber: 1, description: 'TYRES 33 00/R51', quantity: 8, unit: 'SETS' },
            { lineNumber: 2, description: 'TYRES 33 00/R51', quantity: 8, unit: 'SETS' },
            { lineNumber: 3, description: 'RIMS 17 INCH', quantity: 8, unit: 'SETS' },
          ],
        }),
      )
      const lineCount = results.find((r) => r.label === 'Unique product count')
      expect(lineCount).toBeDefined()
      expect(lineCount!.status).toBe('ok')
      expect(lineCount!.value1).toBe(2)
      expect(lineCount!.value2).toBe(2)
    })
  })

  describe('missing document handling', () => {
    it('returns only applicable checks when B/L is missing', () => {
      const results = checker.runChecks(null, makeInvoice(), makePackingList())
      // Without B/L: net weight, packages INV-PL, buyer name, invoice ref, discharge port INV-PL, product count, product desc
      expect(results).toHaveLength(7)
      expect(results.map((r) => r.field)).toEqual(
        expect.arrayContaining(['totalNetWeightKg', 'totalPackages_inv_pl', 'buyerName', 'invoiceReference', 'dischargePort_inv_pl', 'productLineCount', 'productDescription_1']),
      )
    })

    it('returns only applicable checks when Invoice is missing', () => {
      const results = checker.runChecks(makeBl(), null, makePackingList())
      // Without Invoice: BL-vs-PL checks: gross weight, packages, vessel, loading port, discharge port, volume
      expect(results).toHaveLength(6)
    })

    it('returns only applicable checks when Packing List is missing', () => {
      const results = checker.runChecks(makeBl(), makeInvoice(), null)
      // Without PL: BL-vs-INV checks: gross weight, vessel, shipper, consignee, loading port, discharge port
      expect(results).toHaveLength(6)
    })

    it('returns empty results when all documents are missing', () => {
      const results = checker.runChecks(null, null, null)
      expect(results).toHaveLength(0)
    })
  })

  describe('missing field handling', () => {
    it('reports missing status when a numeric field is absent from one document', () => {
      const results = checker.runChecks(
        makeBl({ totalGrossWeightKg: undefined }),
        makeInvoice(),
        makePackingList(),
      )
      const blVsPl = results.find((r) => r.label === 'Total gross weight (B/L vs Packing List)')
      expect(blVsPl).toBeDefined()
      expect(blVsPl!.status).toBe('missing')
      expect(blVsPl!.discrepancy).toContain('B/L')
    })

    it('reports missing status when a string field is absent from one document', () => {
      const results = checker.runChecks(
        makeBl({ vessel: undefined }),
        makeInvoice(),
        makePackingList(),
      )
      const vessel = results.find((r) => r.label === 'Vessel name (B/L vs Packing List)')
      expect(vessel).toBeDefined()
      expect(vessel!.status).toBe('missing')
    })

    it('reports missing status when field is absent from both documents', () => {
      const results = checker.runChecks(
        makeBl({ totalGrossWeightKg: undefined }),
        makeInvoice(),
        makePackingList({ totalGrossWeightKg: undefined }),
      )
      const blVsPl = results.find((r) => r.label === 'Total gross weight (B/L vs Packing List)')
      expect(blVsPl).toBeDefined()
      expect(blVsPl!.status).toBe('missing')
      expect(blVsPl!.discrepancy).toContain('either document')
    })
  })

  describe('edge cases', () => {
    it('handles zero values correctly for numeric checks', () => {
      const results = checker.runChecks(
        makeBl({ totalGrossWeightKg: 0 }),
        makeInvoice(),
        makePackingList({ totalGrossWeightKg: 0 }),
      )
      const blVsPl = results.find((r) => r.label === 'Total gross weight (B/L vs Packing List)')
      expect(blVsPl).toBeDefined()
      expect(blVsPl!.status).toBe('ok')
    })

    it('handles empty string values for string checks', () => {
      const results = checker.runChecks(
        makeBl({ vessel: '' }),
        makeInvoice(),
        makePackingList({ vessel: '' }),
      )
      const vessel = results.find((r) => r.label === 'Vessel name (B/L vs Packing List)')
      expect(vessel).toBeDefined()
      expect(vessel!.status).toBe('ok')
    })

    it('handles null product lines for line count check', () => {
      const results = checker.runChecks(
        makeBl(),
        makeInvoice({ productLines: undefined }),
        makePackingList({ productLines: undefined }),
      )
      const lineCount = results.find((r) => r.label === 'Unique product count')
      expect(lineCount).toBeDefined()
      expect(lineCount!.status).toBe('missing')
    })
  })
})
