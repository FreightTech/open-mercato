import {
  detectDocumentType,
  groupFilesByType,
  autoAssignGroups,
  isUuidFilename,
  smartGroupByIdentifiers,
  mergeWeightsFromPackingList,
  type FileWithIdentifiers,
} from '../services/batch-utils'
import type { NormalizedDocument } from '../data/entities'

describe('batch-utils', () => {
  describe('detectDocumentType', () => {
    describe('Bill of Lading detection', () => {
      const blFilenames = [
        'bill_of_lading_01.pdf',
        'bill-of-lading.pdf',
        'BillOfLading.pdf',
        'b_l_shipment.pdf',
        'b-l-123.pdf',
        'bol_2026.pdf',
        'bl_01.pdf',
        'bl-shanghai.pdf',
        'BL_APL_BARCELONA.pdf',
        'sea_waybill.pdf',
        'sea-waybill_01.pdf',
        'seawaybill.pdf',
        'waybill_456.pdf',
        'konosament_01.pdf',
      ]

      for (const filename of blFilenames) {
        it(`detects "${filename}" as bill_of_lading`, () => {
          expect(detectDocumentType(filename)).toBe('bill_of_lading')
        })
      }
    })

    describe('Commercial Invoice detection', () => {
      const invoiceFilenames = [
        'invoice_2026.pdf',
        'commercial_invoice_01.pdf',
        'commercial-invoice.pdf',
        'faktura_vat.pdf',
        'inv_001.pdf',
        'inv-2026-04.pdf',
        'INV_ACME_CORP.pdf',
        'CI3.pdf',
        'ci_01.pdf',
        'CI.pdf',
      ]

      for (const filename of invoiceFilenames) {
        it(`detects "${filename}" as commercial_invoice`, () => {
          expect(detectDocumentType(filename)).toBe('commercial_invoice')
        })
      }
    })

    describe('Packing List detection', () => {
      const plFilenames = [
        'packing_list_01.pdf',
        'packing-list.pdf',
        'packinglist.pdf',
        'packing_list.pdf',
        'pack_list_01.pdf',
        'pack-list.pdf',
        'packlist_2026.pdf',
        'pl_01.pdf',
        'pl-shanghai.pdf',
        'lista_pakowa_01.pdf',
        'lista-pakowa.pdf',
        'PL3.pdf',
        'pl01.pdf',
        'PL.pdf',
      ]

      for (const filename of plFilenames) {
        it(`detects "${filename}" as packing_list`, () => {
          expect(detectDocumentType(filename)).toBe('packing_list')
        })
      }
    })

    describe('Unrecognized filenames', () => {
      const unknownFilenames = [
        'document.pdf',
        'scan_001.pdf',
        'upload.pdf',
        'customs_form.pdf',
        'photo.jpg',
      ]

      for (const filename of unknownFilenames) {
        it(`returns null for "${filename}"`, () => {
          expect(detectDocumentType(filename)).toBeNull()
        })
      }
    })

    it('is case-insensitive', () => {
      expect(detectDocumentType('INVOICE_01.PDF')).toBe('commercial_invoice')
      expect(detectDocumentType('BL_SHANGHAI.pdf')).toBe('bill_of_lading')
      expect(detectDocumentType('Packing_List.pdf')).toBe('packing_list')
    })

    describe('UUID filenames', () => {
      const uuidFilenames = [
        'ab5b1b63-870e-4045-ae00-2fce83f50ab3.pdf',
        'c3984d14-7e40-4d8a-9944-750d0ee52218.pdf',
        'f4409ba0-32da-4531-8e41-9d97511049a6.pdf',
        'ff43009f-7745-4f24-8489-b55a1e60b414.pdf',
        'a36e12d6-7caa-418e-9fba-5eae11c01836.pdf',
        '00000000-0000-0000-0000-000000000000.pdf',
      ]

      for (const filename of uuidFilenames) {
        it(`returns null for UUID filename "${filename}"`, () => {
          expect(detectDocumentType(filename)).toBeNull()
        })
      }
    })
  })

  describe('isUuidFilename', () => {
    it('returns true for UUID filenames', () => {
      expect(isUuidFilename('ab5b1b63-870e-4045-ae00-2fce83f50ab3.pdf')).toBe(true)
      expect(isUuidFilename('FF43009F-7745-4F24-8489-B55A1E60B414.pdf')).toBe(true)
      expect(isUuidFilename('00000000-0000-0000-0000-000000000000.pdf')).toBe(true)
    })

    it('returns false for non-UUID filenames', () => {
      expect(isUuidFilename('bl_01.pdf')).toBe(false)
      expect(isUuidFilename('invoice.pdf')).toBe(false)
      expect(isUuidFilename('packing_list_02.pdf')).toBe(false)
      expect(isUuidFilename('document.pdf')).toBe(false)
    })
  })

  describe('groupFilesByType', () => {
    it('groups files by groupId', () => {
      const result = groupFilesByType([
        { name: 'bl_01.pdf', groupId: '1', docType: 'bill_of_lading' },
        { name: 'inv_01.pdf', groupId: '1', docType: 'commercial_invoice' },
        { name: 'pl_01.pdf', groupId: '1', docType: 'packing_list' },
        { name: 'bl_02.pdf', groupId: '2', docType: 'bill_of_lading' },
        { name: 'inv_02.pdf', groupId: '2', docType: 'commercial_invoice' },
      ])

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        groupId: '1',
        bl: 'bl_01.pdf',
        invoice: 'inv_01.pdf',
        packingList: 'pl_01.pdf',
      })
      expect(result[1]).toEqual({
        groupId: '2',
        bl: 'bl_02.pdf',
        invoice: 'inv_02.pdf',
        packingList: null,
      })
    })

    it('handles partial groups', () => {
      const result = groupFilesByType([
        { name: 'bl.pdf', groupId: '1', docType: 'bill_of_lading' },
      ])

      expect(result).toHaveLength(1)
      expect(result[0].bl).toBe('bl.pdf')
      expect(result[0].invoice).toBeNull()
      expect(result[0].packingList).toBeNull()
    })

    it('ignores files with null docType', () => {
      const result = groupFilesByType([
        { name: 'bl.pdf', groupId: '1', docType: 'bill_of_lading' },
        { name: 'unknown.pdf', groupId: '1', docType: null },
      ])

      expect(result).toHaveLength(1)
      expect(result[0].bl).toBe('bl.pdf')
    })

    it('overwrites if same type appears twice in same group', () => {
      const result = groupFilesByType([
        { name: 'bl_old.pdf', groupId: '1', docType: 'bill_of_lading' },
        { name: 'bl_new.pdf', groupId: '1', docType: 'bill_of_lading' },
      ])

      expect(result).toHaveLength(1)
      expect(result[0].bl).toBe('bl_new.pdf')
    })
  })

  describe('autoAssignGroups', () => {
    it('assigns groups by numeric suffix in filenames', () => {
      const result = autoAssignGroups([
        { name: 'bl_01.pdf', docType: 'bill_of_lading' },
        { name: 'invoice_01.pdf', docType: 'commercial_invoice' },
        { name: 'packing_01.pdf', docType: 'packing_list' },
        { name: 'bl_02.pdf', docType: 'bill_of_lading' },
        { name: 'invoice_02.pdf', docType: 'commercial_invoice' },
        { name: 'packing_02.pdf', docType: 'packing_list' },
      ])

      const group1 = result.filter((r) => r.groupId === '01')
      const group2 = result.filter((r) => r.groupId === '02')

      expect(group1).toHaveLength(3)
      expect(group2).toHaveLength(3)
    })

    it('assigns groups by trailing digits without separators (BL3, CI3, PL3)', () => {
      const result = autoAssignGroups([
        { name: 'BL3.pdf', docType: 'bill_of_lading' },
        { name: 'CI3.pdf', docType: 'commercial_invoice' },
        { name: 'PL3.pdf', docType: 'packing_list' },
      ])

      expect(result.every((r) => r.groupId === '3')).toBe(true)
    })

    it('groups multiple shipments by trailing digits (BL1/CI1/PL1 + BL2/CI2/PL2)', () => {
      const result = autoAssignGroups([
        { name: 'BL1.pdf', docType: 'bill_of_lading' },
        { name: 'CI1.pdf', docType: 'commercial_invoice' },
        { name: 'PL1.pdf', docType: 'packing_list' },
        { name: 'BL2.pdf', docType: 'bill_of_lading' },
        { name: 'CI2.pdf', docType: 'commercial_invoice' },
        { name: 'PL2.pdf', docType: 'packing_list' },
      ])

      const group1 = result.filter((r) => r.groupId === '1')
      const group2 = result.filter((r) => r.groupId === '2')

      expect(group1).toHaveLength(3)
      expect(group2).toHaveLength(3)
    })

    it('uses round-robin grouping when no numeric pattern found', () => {
      const result = autoAssignGroups([
        { name: 'bl.pdf', docType: 'bill_of_lading' },
        { name: 'invoice.pdf', docType: 'commercial_invoice' },
        { name: 'packing.pdf', docType: 'packing_list' },
        { name: 'bl_second.pdf', docType: 'bill_of_lading' },
        { name: 'invoice_second.pdf', docType: 'commercial_invoice' },
        { name: 'packing_second.pdf', docType: 'packing_list' },
      ])

      const group1 = result.filter((r) => r.groupId === '1')
      const group2 = result.filter((r) => r.groupId === '2')

      expect(group1).toHaveLength(3)
      expect(group2).toHaveLength(3)
      expect(group1.map((r) => r.docType)).toEqual(
        expect.arrayContaining(['bill_of_lading', 'commercial_invoice', 'packing_list']),
      )
    })

    it('handles single file', () => {
      const result = autoAssignGroups([
        { name: 'invoice.pdf', docType: 'commercial_invoice' },
      ])

      expect(result).toHaveLength(1)
      expect(result[0].groupId).toBe('1')
      expect(result[0].docType).toBe('commercial_invoice')
    })

    it('skips files with null docType in round-robin grouping', () => {
      const result = autoAssignGroups([
        { name: 'bl.pdf', docType: 'bill_of_lading' },
        { name: 'unknown.pdf', docType: null },
        { name: 'invoice.pdf', docType: 'commercial_invoice' },
      ])

      const grouped = result.filter((r) => r.groupId !== '0')
      expect(grouped).toHaveLength(2)

      const ungrouped = result.filter((r) => r.groupId === '0')
      expect(ungrouped).toHaveLength(1)
      expect(ungrouped[0].name).toBe('unknown.pdf')
    })

    it('handles uneven type counts with round-robin', () => {
      const result = autoAssignGroups([
        { name: 'bl_a.pdf', docType: 'bill_of_lading' },
        { name: 'bl_b.pdf', docType: 'bill_of_lading' },
        { name: 'invoice.pdf', docType: 'commercial_invoice' },
      ])

      // Should create 2 groups: group 1 has bl + invoice, group 2 has just bl
      const group1 = result.filter((r) => r.groupId === '1')
      const group2 = result.filter((r) => r.groupId === '2')

      expect(group1).toHaveLength(2)
      expect(group2).toHaveLength(1)
      expect(group2[0].docType).toBe('bill_of_lading')
    })

    it('does not extract group numbers from UUID filenames', () => {
      const result = autoAssignGroups([
        { name: 'ab5b1b63-870e-4045-ae00-2fce83f50ab3.pdf', docType: 'bill_of_lading' },
        { name: 'c3984d14-7e40-4d8a-9944-750d0ee52218.pdf', docType: 'commercial_invoice' },
        { name: 'f4409ba0-32da-4531-8e41-9d97511049a6.pdf', docType: 'packing_list' },
      ])

      // All should be round-robin grouped, not assigned bogus group IDs from UUID segments
      const group1 = result.filter((r) => r.groupId === '1')
      expect(group1).toHaveLength(3)

      // None should have UUID-derived group IDs like "4045", "9944", "4531"
      const bogusGroupIds = result.filter((r) => ['4045', '9944', '4531', '870e'].includes(r.groupId))
      expect(bogusGroupIds).toHaveLength(0)
    })

    it('handles mix of UUID and descriptive filenames', () => {
      const result = autoAssignGroups([
        { name: 'bl_01.pdf', docType: 'bill_of_lading' },
        { name: 'ab5b1b63-870e-4045-ae00-2fce83f50ab3.pdf', docType: 'commercial_invoice' },
        { name: 'packing_01.pdf', docType: 'packing_list' },
      ])

      // Descriptive files should get numeric groups, UUID file should not
      const descriptiveFiles = result.filter((r) => !r.name.includes('ab5b1b63'))
      expect(descriptiveFiles.every((r) => r.groupId === '01')).toBe(true)

      // UUID file stays at groupId '0' (no numeric extraction)
      const uuidFile = result.find((r) => r.name.includes('ab5b1b63'))
      expect(uuidFile?.groupId).toBe('0')
    })

    it('round-robin groups all UUID filenames correctly', () => {
      const result = autoAssignGroups([
        { name: 'ab5b1b63-870e-4045-ae00-2fce83f50ab3.pdf', docType: 'bill_of_lading' },
        { name: 'c3984d14-7e40-4d8a-9944-750d0ee52218.pdf', docType: 'commercial_invoice' },
        { name: 'f4409ba0-32da-4531-8e41-9d97511049a6.pdf', docType: 'packing_list' },
        { name: 'ff43009f-7745-4f24-8489-b55a1e60b414.pdf', docType: 'bill_of_lading' },
        { name: 'a36e12d6-7caa-418e-9fba-5eae11c01836.pdf', docType: 'commercial_invoice' },
      ])

      // 2 BLs, 2 invoices, 1 PL = 2 groups via round-robin
      const group1 = result.filter((r) => r.groupId === '1')
      const group2 = result.filter((r) => r.groupId === '2')

      expect(group1).toHaveLength(3)
      expect(group2).toHaveLength(2)
    })
  })

  describe('smartGroupByIdentifiers', () => {
    it('groups 3 documents by matching BL number', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'doc1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'CMDU1234567', shipperName: 'Acme Corp', vessel: 'MSC Oscar' },
        },
        {
          name: 'doc2.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'CMDU1234567', invoiceNumber: 'INV-001', shipperName: 'Acme Corp' },
        },
        {
          name: 'doc3.pdf',
          docType: 'packing_list',
          identifiers: { type: 'packing_list', blNumber: 'CMDU1234567', invoiceNumber: 'INV-001' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(1)
      expect(result[0].bl).toBe('doc1.pdf')
      expect(result[0].invoice).toBe('doc2.pdf')
      expect(result[0].packingList).toBe('doc3.pdf')
    })

    it('groups 5 shipments correctly by BL number', () => {
      const files: FileWithIdentifiers[] = []
      for (let i = 1; i <= 5; i++) {
        files.push(
          {
            name: `bl_${i}.pdf`,
            docType: 'bill_of_lading',
            identifiers: { type: 'bill_of_lading', blNumber: `BL-${i}`, shipperName: `Shipper ${i}`, vessel: `Vessel ${i}` },
          },
          {
            name: `inv_${i}.pdf`,
            docType: 'commercial_invoice',
            identifiers: { type: 'commercial_invoice', blNumber: `BL-${i}`, invoiceNumber: `INV-${i}`, shipperName: `Shipper ${i}` },
          },
          {
            name: `pl_${i}.pdf`,
            docType: 'packing_list',
            identifiers: { type: 'packing_list', blNumber: `BL-${i}`, invoiceNumber: `INV-${i}` },
          },
        )
      }

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(5)
      for (let i = 0; i < 5; i++) {
        expect(result[i].bl).toBe(`bl_${i + 1}.pdf`)
        expect(result[i].invoice).toBe(`inv_${i + 1}.pdf`)
        expect(result[i].packingList).toBe(`pl_${i + 1}.pdf`)
      }
    })

    it('matches invoice to BL by shipper+vessel when BL number is missing', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'CMDU999', shipperName: 'Shanghai Exports', vessel: 'Ever Given' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', invoiceNumber: 'INV-100', shipperName: 'Shanghai Exports', vessel: 'Ever Given' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(1)
      expect(result[0].bl).toBe('bl.pdf')
      expect(result[0].invoice).toBe('inv.pdf')
    })

    it('matches packing list by invoice number', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-A' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'BL-A', invoiceNumber: 'INV-A' },
        },
        {
          name: 'pl.pdf',
          docType: 'packing_list',
          identifiers: { type: 'packing_list', invoiceNumber: 'INV-A' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(1)
      expect(result[0].packingList).toBe('pl.pdf')
    })

    it('matches packing list by shipper+vessel as last resort', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-X', shipperName: 'Acme', vessel: 'HMS Victory' },
        },
        {
          name: 'pl.pdf',
          docType: 'packing_list',
          identifiers: { type: 'packing_list', shipperName: 'Acme', vessel: 'HMS Victory' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(1)
      expect(result[0].bl).toBe('bl.pdf')
      expect(result[0].packingList).toBe('pl.pdf')
    })

    it('creates separate groups for documents with different BL numbers', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-AAA' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-BBB' },
        },
        {
          name: 'inv1.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'BL-BBB', invoiceNumber: 'INV-B' },
        },
        {
          name: 'inv2.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'BL-AAA', invoiceNumber: 'INV-A' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(2)

      const groupA = result.find((g) => g.bl === 'bl1.pdf')!
      const groupB = result.find((g) => g.bl === 'bl2.pdf')!

      expect(groupA.invoice).toBe('inv2.pdf')
      expect(groupB.invoice).toBe('inv1.pdf')
    })

    it('assigns unmatched invoices to groups with empty invoice slots', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-1' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-2' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'BL-1', invoiceNumber: 'INV-1' },
        },
        {
          name: 'inv_orphan.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', invoiceNumber: 'INV-ORPHAN' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(2)

      const group1 = result.find((g) => g.bl === 'bl1.pdf')!
      const group2 = result.find((g) => g.bl === 'bl2.pdf')!

      expect(group1.invoice).toBe('inv.pdf')
      expect(group2.invoice).toBe('inv_orphan.pdf')
    })

    it('handles case-insensitive matching', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'CMDU1234567', shipperName: 'ACME CORP' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'cmdu1234567', shipperName: 'Acme Corp' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(1)
      expect(result[0].bl).toBe('bl.pdf')
      expect(result[0].invoice).toBe('inv.pdf')
    })

    it('handles fuzzy substring matching for identifiers', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'CMDU1234567' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'B/L No: CMDU1234567' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(1)
      expect(result[0].invoice).toBe('inv.pdf')
    })

    it('seeds from invoices when no BLs are present', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'inv1.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', invoiceNumber: 'INV-1' },
        },
        {
          name: 'inv2.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', invoiceNumber: 'INV-2' },
        },
        {
          name: 'pl1.pdf',
          docType: 'packing_list',
          identifiers: { type: 'packing_list', invoiceNumber: 'INV-1' },
        },
        {
          name: 'pl2.pdf',
          docType: 'packing_list',
          identifiers: { type: 'packing_list', invoiceNumber: 'INV-2' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(2)

      const group1 = result.find((g) => g.invoice === 'inv1.pdf')!
      const group2 = result.find((g) => g.invoice === 'inv2.pdf')!

      expect(group1.packingList).toBe('pl1.pdf')
      expect(group2.packingList).toBe('pl2.pdf')
    })

    it('returns empty result for empty input', () => {
      const result = smartGroupByIdentifiers([])
      expect(result).toHaveLength(0)
    })

    it('handles single BL with no other documents', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-SOLO' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(1)
      expect(result[0].bl).toBe('bl.pdf')
      expect(result[0].invoice).toBeNull()
      expect(result[0].packingList).toBeNull()
    })

    it('handles documents with no identifiers at all — creates groups per BL', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(2)
      // Unmatched invoice gets assigned to first group with empty slot
      const groupWithInvoice = result.find((g) => g.invoice !== null)
      expect(groupWithInvoice).toBeDefined()
      expect(groupWithInvoice!.invoice).toBe('inv.pdf')
    })

    it('does not double-assign a document to multiple groups', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-1', shipperName: 'Shared Shipper', vessel: 'Shared Vessel' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-2', shipperName: 'Shared Shipper', vessel: 'Shared Vessel' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'BL-1', shipperName: 'Shared Shipper', vessel: 'Shared Vessel' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(2)

      const group1 = result.find((g) => g.bl === 'bl1.pdf')!
      const group2 = result.find((g) => g.bl === 'bl2.pdf')!

      // Invoice matches BL-1 by blNumber, should go to group1 only
      expect(group1.invoice).toBe('inv.pdf')
      expect(group2.invoice).toBeNull()
    })

    it('prefers BL number match over shipper+vessel match', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-ALPHA', shipperName: 'Same Corp', vessel: 'Same Ship' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-BETA', shipperName: 'Same Corp', vessel: 'Same Ship' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'BL-BETA', shipperName: 'Same Corp', vessel: 'Same Ship' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      // Invoice should match BL-BETA by blNumber, not BL-ALPHA by shipper+vessel (which would match first)
      const groupBeta = result.find((g) => g.bl === 'bl2.pdf')!
      expect(groupBeta.invoice).toBe('inv.pdf')
    })

    it('skips ambiguous shipper+vessel match when multiple groups share the same seller', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-001', shipperName: 'Seller Set 1', vessel: 'MSC Oscar' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-002', shipperName: 'Seller Set 1', vessel: 'MSC Oscar' },
        },
        {
          name: 'bl3.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-003', shipperName: 'Seller Set 1', vessel: 'MSC Oscar' },
        },
        {
          name: 'inv1.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', shipperName: 'Seller Set 1', vessel: 'MSC Oscar', invoiceNumber: 'INV-X' },
        },
        {
          name: 'inv2.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', shipperName: 'Seller Set 1', vessel: 'MSC Oscar', invoiceNumber: 'INV-Y' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(3)

      // Invoices have no BL number and shipper+vessel is ambiguous (3 matching groups)
      // They should NOT be matched by shipper+vessel — they go to unmatched and then round-robin
      // All 3 groups still have BLs; the 2 invoices fill the first 2 available slots
      const groupsWithInvoice = result.filter((g) => g.invoice !== null)
      expect(groupsWithInvoice).toHaveLength(2)

      // The third group should have no invoice
      const groupsWithoutInvoice = result.filter((g) => g.invoice === null)
      expect(groupsWithoutInvoice).toHaveLength(1)
    })

    it('matches invoice by shipper name only when no BL number or vessel (Priority 3)', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-001', shipperName: 'Alpha Corp', vessel: 'Vessel A' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-002', shipperName: 'Beta Corp', vessel: 'Vessel B' },
        },
        {
          name: 'inv1.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', shipperName: 'Alpha Corp', invoiceNumber: 'INV-A' },
        },
        {
          name: 'inv2.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', shipperName: 'Beta Corp', invoiceNumber: 'INV-B' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(2)
      const groupA = result.find((g) => g.bl === 'bl1.pdf')!
      const groupB = result.find((g) => g.bl === 'bl2.pdf')!
      expect(groupA.invoice).toBe('inv1.pdf')
      expect(groupB.invoice).toBe('inv2.pdf')
    })

    it('skips shipper-only match when ambiguous (multiple groups share shipper)', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-001', shipperName: 'Same Corp', vessel: 'Ship X' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-002', shipperName: 'Same Corp', vessel: 'Ship Y' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', shipperName: 'Same Corp', invoiceNumber: 'INV-X' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(2)
      // Shipper-only match is ambiguous (both groups have 'Same Corp') — falls to round-robin
      const groupsWithInvoice = result.filter((g) => g.invoice !== null)
      expect(groupsWithInvoice).toHaveLength(1)
    })

    it('matches packing list by shipper name only when no invoice/BL/vessel match (Priority 4)', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-001', shipperName: 'Alpha Corp', vessel: 'Vessel A' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-002', shipperName: 'Beta Corp', vessel: 'Vessel B' },
        },
        {
          name: 'inv1.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'BL-001', shipperName: 'Alpha Corp', invoiceNumber: 'INV-A' },
        },
        {
          name: 'inv2.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', blNumber: 'BL-002', shipperName: 'Beta Corp', invoiceNumber: 'INV-B' },
        },
        {
          name: 'pl1.pdf',
          docType: 'packing_list',
          identifiers: { type: 'packing_list', shipperName: 'Alpha Corp' },
        },
        {
          name: 'pl2.pdf',
          docType: 'packing_list',
          identifiers: { type: 'packing_list', shipperName: 'Beta Corp' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(2)
      const groupA = result.find((g) => g.bl === 'bl1.pdf')!
      const groupB = result.find((g) => g.bl === 'bl2.pdf')!
      expect(groupA.packingList).toBe('pl1.pdf')
      expect(groupB.packingList).toBe('pl2.pdf')
    })

    it('matches 5-set real-world scenario with shipper-only matching', () => {
      const files: FileWithIdentifiers[] = [
        // 5 BLs with unique shippers
        { name: 'bl1.pdf', docType: 'bill_of_lading', identifiers: { type: 'bill_of_lading', blNumber: 'SZSY26010596', shipperName: 'Seller Set 1', vessel: 'OOCL FINLAND' } },
        { name: 'bl2.pdf', docType: 'bill_of_lading', identifiers: { type: 'bill_of_lading', blNumber: '263535317', shipperName: 'Seller Set 2', vessel: 'MARIBO MAERSK' } },
        { name: 'bl3.pdf', docType: 'bill_of_lading', identifiers: { type: 'bill_of_lading', blNumber: 'UTRUST26020386', shipperName: 'Seller Set 3', vessel: 'MAGLEBY MAERSK' } },
        { name: 'bl4.pdf', docType: 'bill_of_lading', identifiers: { type: 'bill_of_lading', blNumber: 'AMC2491222', shipperName: 'Seller Set 4', vessel: 'APL BARCELONA' } },
        { name: 'bl5.pdf', docType: 'bill_of_lading', identifiers: { type: 'bill_of_lading', blNumber: '265168912', shipperName: 'Seller Set 5', vessel: 'MAERSK NESNA' } },
        // 5 Invoices — no BL number, no vessel (like real-world)
        { name: 'inv1.pdf', docType: 'commercial_invoice', identifiers: { type: 'commercial_invoice', shipperName: 'Seller Set 1', invoiceNumber: '25FAWT1701E02' } },
        { name: 'inv2.pdf', docType: 'commercial_invoice', identifiers: { type: 'commercial_invoice', shipperName: 'Seller Set 2', invoiceNumber: 'YE253201XS-6' } },
        { name: 'inv3.pdf', docType: 'commercial_invoice', identifiers: { type: 'commercial_invoice', shipperName: 'Seller Set 3', invoiceNumber: 'UKOWRU23002-Z-18' } },
        { name: 'inv4.pdf', docType: 'commercial_invoice', identifiers: { type: 'commercial_invoice', shipperName: 'Seller Set 4', invoiceNumber: '98139446' } },
        { name: 'inv5.pdf', docType: 'commercial_invoice', identifiers: { type: 'commercial_invoice', shipperName: 'Seller Set 5', invoiceNumber: '5GA00164' } },
        // 5 Packing Lists — no BL number, no vessel (like real-world)
        { name: 'pl1.pdf', docType: 'packing_list', identifiers: { type: 'packing_list', shipperName: 'Seller Set 1', invoiceNumber: '25FAWT1701E02' } },
        { name: 'pl2.pdf', docType: 'packing_list', identifiers: { type: 'packing_list', shipperName: 'Seller Set 2', invoiceNumber: 'YE253201XS-6' } },
        { name: 'pl3.pdf', docType: 'packing_list', identifiers: { type: 'packing_list', shipperName: 'Seller Set 3', invoiceNumber: 'UKOWRU23002-Z-18' } },
        { name: 'pl4.pdf', docType: 'packing_list', identifiers: { type: 'packing_list', shipperName: 'Seller Set 4', invoiceNumber: '98139446' } },
        { name: 'pl5.pdf', docType: 'packing_list', identifiers: { type: 'packing_list', shipperName: 'Seller Set 5', invoiceNumber: '5GA00164' } },
      ]

      const result = smartGroupByIdentifiers(files)

      expect(result).toHaveLength(5)

      // Each group should have all 3 documents matched correctly
      for (let i = 1; i <= 5; i++) {
        const group = result.find((g) => g.bl === `bl${i}.pdf`)!
        expect(group).toBeDefined()
        expect(group.invoice).toBe(`inv${i}.pdf`)
        expect(group.packingList).toBe(`pl${i}.pdf`)
      }
    })

    it('prefers shipper+vessel over shipper-only when vessel is available', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-1', shipperName: 'Acme Co', vessel: 'Ship Alpha' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-2', shipperName: 'Acme Co', vessel: 'Ship Beta' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', shipperName: 'Acme Co', vessel: 'Ship Beta', invoiceNumber: 'INV-X' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      // Should match by shipper+vessel (Priority 2) — unique match for Ship Beta
      const groupBeta = result.find((g) => g.bl === 'bl2.pdf')!
      expect(groupBeta.invoice).toBe('inv.pdf')
    })

    it('uses shipper+vessel when only ONE group matches (unambiguous)', () => {
      const files: FileWithIdentifiers[] = [
        {
          name: 'bl1.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-A', shipperName: 'Alpha Corp', vessel: 'Ship Alpha' },
        },
        {
          name: 'bl2.pdf',
          docType: 'bill_of_lading',
          identifiers: { type: 'bill_of_lading', blNumber: 'BL-B', shipperName: 'Beta Corp', vessel: 'Ship Beta' },
        },
        {
          name: 'inv.pdf',
          docType: 'commercial_invoice',
          identifiers: { type: 'commercial_invoice', shipperName: 'Beta Corp', vessel: 'Ship Beta', invoiceNumber: 'INV-B' },
        },
      ]

      const result = smartGroupByIdentifiers(files)

      // Only one group has Beta Corp + Ship Beta → unambiguous match
      const groupB = result.find((g) => g.bl === 'bl2.pdf')!
      expect(groupB.invoice).toBe('inv.pdf')
    })
  })

  describe('mergeWeightsFromPackingList', () => {
    it('returns null when invoice has no product lines', () => {
      const invoice: NormalizedDocument = { productLines: undefined }
      const pl: NormalizedDocument = {
        productLines: [{ lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS', grossWeightKg: 100, netWeightKg: 90 }],
      }
      expect(mergeWeightsFromPackingList(invoice, pl)).toBeNull()
    })

    it('returns invoice lines unchanged when PL is null', () => {
      const invoice: NormalizedDocument = {
        productLines: [{ lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS', unitPrice: 50, totalValue: 500 }],
      }
      const result = mergeWeightsFromPackingList(invoice, null)
      expect(result).toHaveLength(1)
      expect(result![0].grossWeightKg).toBeUndefined()
    })

    it('merges weight data by lineNumber when line counts match', () => {
      const invoice: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'FAW 4x2 Chassis', quantity: 1, unit: 'UNITS', unitPrice: 30700, totalValue: 30700 },
          { lineNumber: 2, description: 'FAW 4x2 Chassis', quantity: 1, unit: 'UNITS', unitPrice: 30700, totalValue: 30700 },
          { lineNumber: 3, description: 'FAW 4x2 Chassis', quantity: 1, unit: 'UNITS', unitPrice: 30700, totalValue: 30700 },
        ],
      }
      const pl: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'FAW 4x2 Chassis', quantity: 1, unit: 'PCS', grossWeightKg: 5600, netWeightKg: 5600 },
          { lineNumber: 2, description: 'FAW 4x2 Chassis', quantity: 1, unit: 'PCS', grossWeightKg: 5600, netWeightKg: 5600 },
          { lineNumber: 3, description: 'FAW 4x2 Chassis', quantity: 1, unit: 'PCS', grossWeightKg: 5600, netWeightKg: 5600 },
        ],
      }
      const result = mergeWeightsFromPackingList(invoice, pl)!
      expect(result).toHaveLength(3)
      for (const line of result) {
        expect(line.grossWeightKg).toBe(5600)
        expect(line.netWeightKg).toBe(5600)
        // Pricing preserved from invoice
        expect(line.unitPrice).toBe(30700)
      }
    })

    it('sums weights from per-container PL breakdown when line counts differ', () => {
      const invoice: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'TYRES 33 00/R51', quantity: 24, unit: 'PCS', unitPrice: 16958, totalValue: 406992 },
        ],
      }
      const pl: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'TYRES 33 00/R51', quantity: 8, unit: 'SETS', grossWeightKg: 18722, netWeightKg: 18722 },
          { lineNumber: 2, description: 'TYRES 33 00/R51', quantity: 8, unit: 'SETS', grossWeightKg: 18722, netWeightKg: 18722 },
          { lineNumber: 3, description: 'TYRES 33 00/R51', quantity: 8, unit: 'SETS', grossWeightKg: 18723, netWeightKg: 18723 },
        ],
      }
      const result = mergeWeightsFromPackingList(invoice, pl)!
      expect(result).toHaveLength(1)
      expect(result[0].grossWeightKg).toBe(18722 + 18722 + 18723)
      expect(result[0].netWeightKg).toBe(18722 + 18722 + 18723)
      expect(result[0].unitPrice).toBe(16958)
    })

    it('handles mixed products with per-container breakdown', () => {
      const invoice: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'Steel Rods', quantity: 100, unit: 'PCS' },
          { lineNumber: 2, description: 'Copper Wire', quantity: 50, unit: 'KG' },
        ],
      }
      const pl: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'Steel Rods', quantity: 50, unit: 'PCS', grossWeightKg: 2000, netWeightKg: 1800 },
          { lineNumber: 2, description: 'Steel Rods', quantity: 50, unit: 'PCS', grossWeightKg: 2000, netWeightKg: 1800 },
          { lineNumber: 3, description: 'Copper Wire', quantity: 50, unit: 'KG', grossWeightKg: 500, netWeightKg: 450 },
        ],
      }
      const result = mergeWeightsFromPackingList(invoice, pl)!
      expect(result).toHaveLength(2)
      expect(result[0].grossWeightKg).toBe(4000)
      expect(result[0].netWeightKg).toBe(3600)
      expect(result[1].grossWeightKg).toBe(500)
      expect(result[1].netWeightKg).toBe(450)
    })

    it('does not overwrite existing invoice weight data', () => {
      const invoice: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS', grossWeightKg: 999, netWeightKg: 888 },
        ],
      }
      const pl: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS', grossWeightKg: 100, netWeightKg: 90 },
        ],
      }
      const result = mergeWeightsFromPackingList(invoice, pl)!
      expect(result[0].grossWeightKg).toBe(999)
      expect(result[0].netWeightKg).toBe(888)
    })

    it('does not mutate the original invoice productLines', () => {
      const invoice: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS' },
        ],
      }
      const pl: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS', grossWeightKg: 100, netWeightKg: 90 },
        ],
      }
      const result = mergeWeightsFromPackingList(invoice, pl)!
      expect(result[0].grossWeightKg).toBe(100)
      expect(invoice.productLines![0].grossWeightKg).toBeUndefined()
    })

    it('returns invoice lines unchanged when PL has no product lines', () => {
      const invoice: NormalizedDocument = {
        productLines: [
          { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS', unitPrice: 50 },
        ],
      }
      const pl: NormalizedDocument = { productLines: [] }
      const result = mergeWeightsFromPackingList(invoice, pl)!
      expect(result).toHaveLength(1)
      expect(result[0].grossWeightKg).toBeUndefined()
      expect(result[0].unitPrice).toBe(50)
    })
  })
})
