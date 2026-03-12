import { describe, it, expect } from 'vitest'
import {
  parseDate,
  extractBookingData,
  type DocumentForExtraction,
} from '../booking-data-extractor'
import type { BookingConfirmationData } from '../../data/types'

describe('parseDate', () => {
  it('should return null for undefined', () => {
    expect(parseDate(undefined)).toBeNull()
  })

  it('should return null for null', () => {
    expect(parseDate(null)).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(parseDate('')).toBeNull()
  })

  it('should return null for invalid date string', () => {
    expect(parseDate('not-a-date')).toBeNull()
  })

  it('should parse ISO date string', () => {
    const result = parseDate('2024-03-15')
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('should parse ISO datetime string', () => {
    const result = parseDate('2024-03-15T10:30:00Z')
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString()).toBe('2024-03-15T10:30:00.000Z')
  })

  it('should parse various date formats', () => {
    // JavaScript Date constructor handles many formats
    expect(parseDate('March 15, 2024')).not.toBeNull()
    expect(parseDate('2024/03/15')).not.toBeNull()
  })
})

describe('extractBookingData', () => {
  const emptyDocument: DocumentForExtraction = {}

  describe('with null/undefined extractedData', () => {
    it('should return empty data for null extractedData', () => {
      const result = extractBookingData(emptyDocument, null)

      expect(result.bookingNumber).toBeNull()
      expect(result.blNumber).toBeNull()
      expect(result.mblNumber).toBeNull()
      expect(result.carrierName).toBeNull()
      expect(result.carrierCode).toBeNull()
      expect(result.vesselName).toBeNull()
      expect(result.voyageNumber).toBeNull()
      expect(result.portOfLoading).toBeNull()
      expect(result.portOfDischarge).toBeNull()
      expect(result.etd).toBeNull()
      expect(result.eta).toBeNull()
      expect(result.vgmCutoffDate).toBeNull()
      expect(result.docCutoffDate).toBeNull()
      expect(result.gateCloseDate).toBeNull()
      expect(result.commodityDescription).toBeNull()
      expect(result.containerNumbers).toEqual([])
      expect(result.rawContainers).toEqual([])
      expect(result.shipper).toBeUndefined()
      expect(result.consignee).toBeUndefined()
    })

    it('should return empty data for undefined extractedData', () => {
      const result = extractBookingData(emptyDocument, undefined)
      expect(result.bookingNumber).toBeNull()
      expect(result.containerNumbers).toEqual([])
    })
  })

  describe('identifier extraction', () => {
    it('should prefer document.bookingNumber over extractedData', () => {
      const document: DocumentForExtraction = { bookingNumber: 'DOC-123' }
      const extracted: BookingConfirmationData = { booking_number: 'EXT-456' }

      const result = extractBookingData(document, extracted)
      expect(result.bookingNumber).toBe('DOC-123')
    })

    it('should fall back to extractedData.booking_number', () => {
      const extracted: BookingConfirmationData = { booking_number: 'EXT-456' }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.bookingNumber).toBe('EXT-456')
    })

    it('should fall back to transportation.booking_number', () => {
      const extracted: BookingConfirmationData = {
        transportation: { booking_number: 'TRANS-789' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.bookingNumber).toBe('TRANS-789')
    })

    it('should fall back to transportation.job_no', () => {
      const extracted: BookingConfirmationData = {
        transportation: { job_no: 'JOB-001' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.bookingNumber).toBe('JOB-001')
    })

    it('should extract blNumber from multiple sources', () => {
      // Test document field
      expect(
        extractBookingData({ blNumber: 'DOC-BL' }, {}).blNumber
      ).toBe('DOC-BL')

      // Test extractedData.bl_number
      expect(
        extractBookingData(emptyDocument, { bl_number: 'EXT-BL' }).blNumber
      ).toBe('EXT-BL')

      // Test transportation.hbl_number
      expect(
        extractBookingData(emptyDocument, {
          transportation: { hbl_number: 'HBL-123' },
        }).blNumber
      ).toBe('HBL-123')

      // Test transportation.hbl_no
      expect(
        extractBookingData(emptyDocument, {
          transportation: { hbl_no: 'HBL-NO-456' },
        }).blNumber
      ).toBe('HBL-NO-456')
    })

    it('should extract mblNumber from multiple sources', () => {
      expect(
        extractBookingData({ mblNumber: 'DOC-MBL' }, {}).mblNumber
      ).toBe('DOC-MBL')

      expect(
        extractBookingData(emptyDocument, { mbl_number: 'EXT-MBL' }).mblNumber
      ).toBe('EXT-MBL')

      expect(
        extractBookingData(emptyDocument, {
          transportation: { mbl_no: 'MBL-NO' },
        }).mblNumber
      ).toBe('MBL-NO')
    })
  })

  describe('carrier extraction', () => {
    it('should extract carrier name', () => {
      const extracted: BookingConfirmationData = {
        carrier: { name: 'Maersk Line' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.carrierName).toBe('Maersk Line')
    })

    it('should detect carrier code from carrier object', () => {
      const extracted: BookingConfirmationData = {
        carrier: { name: 'MSC', scac_code: 'MSCU' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      // detectCarrierCode should find MSCU from the carrier object
      expect(result.carrierCode).toBeTruthy()
    })

    it('should return null for missing carrier', () => {
      const result = extractBookingData(emptyDocument, {})
      expect(result.carrierName).toBeNull()
      expect(result.carrierCode).toBeNull()
    })
  })

  describe('vessel extraction', () => {
    it('should extract vesselName from vessel object', () => {
      const extracted: BookingConfirmationData = {
        vessel: { name: 'EVER GIVEN' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.vesselName).toBe('EVER GIVEN')
    })

    it('should fall back to transportation.vessel_name', () => {
      const extracted: BookingConfirmationData = {
        transportation: { vessel_name: 'MSC OSCAR' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.vesselName).toBe('MSC OSCAR')
    })

    it('should fall back to transportation.vessel', () => {
      const extracted: BookingConfirmationData = {
        transportation: { vessel: 'MAERSK EINDHOVEN' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.vesselName).toBe('MAERSK EINDHOVEN')
    })

    it('should extract voyageNumber', () => {
      const extracted: BookingConfirmationData = {
        vessel: { voyage_number: '024W' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.voyageNumber).toBe('024W')
    })

    it('should fall back to transportation.voyage_number', () => {
      const extracted: BookingConfirmationData = {
        transportation: { voyage_number: '025E' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.voyageNumber).toBe('025E')
    })
  })

  describe('routing extraction', () => {
    it('should extract ports from routing object', () => {
      const extracted: BookingConfirmationData = {
        routing: {
          port_of_loading: 'SHANGHAI',
          port_of_discharge: 'ROTTERDAM',
        },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.portOfLoading).toBe('SHANGHAI')
      expect(result.portOfDischarge).toBe('ROTTERDAM')
    })

    it('should fall back to transportation fields', () => {
      const extracted: BookingConfirmationData = {
        transportation: {
          port_of_loading: 'NINGBO',
          port_of_discharge: 'HAMBURG',
        },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.portOfLoading).toBe('NINGBO')
      expect(result.portOfDischarge).toBe('HAMBURG')
    })

    it('should fall back to pol/pod shorthand', () => {
      const extracted: BookingConfirmationData = {
        transportation: {
          pol: 'YANTIAN',
          pod: 'FELIXSTOWE',
        },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.portOfLoading).toBe('YANTIAN')
      expect(result.portOfDischarge).toBe('FELIXSTOWE')
    })
  })

  describe('dates extraction', () => {
    it('should extract dates from dates object', () => {
      const extracted: BookingConfirmationData = {
        dates: {
          etd: '2024-03-15',
          eta: '2024-04-01',
          cutoff_vgm: '2024-03-10',
          cutoff_si: '2024-03-12',
          cutoff_cy: '2024-03-14',
        },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.etd?.toISOString().startsWith('2024-03-15')).toBe(true)
      expect(result.eta?.toISOString().startsWith('2024-04-01')).toBe(true)
      expect(result.vgmCutoffDate?.toISOString().startsWith('2024-03-10')).toBe(true)
      expect(result.docCutoffDate?.toISOString().startsWith('2024-03-12')).toBe(true)
      expect(result.gateCloseDate?.toISOString().startsWith('2024-03-14')).toBe(true)
    })

    it('should fall back to transportation.etd/eta', () => {
      const extracted: BookingConfirmationData = {
        transportation: {
          etd: '2024-05-01',
          eta: '2024-05-15',
        },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.etd?.toISOString().startsWith('2024-05-01')).toBe(true)
      expect(result.eta?.toISOString().startsWith('2024-05-15')).toBe(true)
    })

    it('should return null for invalid dates', () => {
      const extracted: BookingConfirmationData = {
        dates: {
          etd: 'invalid-date',
          eta: 'also-invalid',
        },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.etd).toBeNull()
      expect(result.eta).toBeNull()
    })
  })

  describe('cargo extraction', () => {
    it('should extract commodityDescription from cargo.description', () => {
      const extracted: BookingConfirmationData = {
        cargo: { description: 'Electronics and machinery' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.commodityDescription).toBe('Electronics and machinery')
    })

    it('should fall back to cargo_description', () => {
      const extracted: BookingConfirmationData = {
        cargo_description: 'Textile goods',
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.commodityDescription).toBe('Textile goods')
    })
  })

  describe('container extraction', () => {
    it('should extract container numbers from containers array', () => {
      const extracted: BookingConfirmationData = {
        containers: [
          { container_number: 'MSKU1234567' },
          { container_number: 'TCLU7654321' },
          { container_number: '' }, // empty should be filtered
          { container_number: '  ' }, // whitespace should be filtered
        ],
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.containerNumbers).toEqual(['MSKU1234567', 'TCLU7654321'])
    })

    it('should extract from container_details array', () => {
      const extracted: BookingConfirmationData = {
        container_details: [
          { container_number: 'HLXU1234560', type: '40HC' },
          { container_number: 'CMAU9876543', container_type: '20GP' },
        ],
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.containerNumbers).toEqual(['HLXU1234560', 'CMAU9876543'])
      expect(result.rawContainers).toHaveLength(2)
      expect(result.rawContainers[0].type).toBe('40HC')
      expect(result.rawContainers[1].container_type).toBe('20GP')
    })

    it('should prefer containers over container_details', () => {
      const extracted: BookingConfirmationData = {
        containers: [{ container_number: 'FROM_CONTAINERS' }],
        container_details: [{ container_number: 'FROM_DETAILS' }],
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.containerNumbers).toEqual(['FROM_CONTAINERS'])
    })

    it('should handle missing containers', () => {
      const result = extractBookingData(emptyDocument, {})
      expect(result.containerNumbers).toEqual([])
      expect(result.rawContainers).toEqual([])
    })
  })

  describe('party extraction', () => {
    it('should extract shipper and consignee', () => {
      const extracted: BookingConfirmationData = {
        shipper: { name: 'Acme Corp' },
        consignee: { name: 'Global Imports Ltd' },
      }

      const result = extractBookingData(emptyDocument, extracted)
      expect(result.shipper).toEqual({ name: 'Acme Corp' })
      expect(result.consignee).toEqual({ name: 'Global Imports Ltd' })
    })

    it('should handle missing parties', () => {
      const result = extractBookingData(emptyDocument, {})
      expect(result.shipper).toBeUndefined()
      expect(result.consignee).toBeUndefined()
    })
  })

  describe('full extraction scenario', () => {
    it('should extract all fields from a complete booking confirmation', () => {
      const document: DocumentForExtraction = {
        bookingNumber: 'BKG-2024-001',
        blNumber: 'MAEU123456789',
      }

      const extracted: BookingConfirmationData = {
        carrier: { name: 'Maersk', scac_code: 'MAEU' },
        vessel: { name: 'MAERSK EINDHOVEN', voyage_number: '024W' },
        routing: {
          port_of_loading: 'SHANGHAI (CNSHA)',
          port_of_discharge: 'ROTTERDAM (NLRTM)',
        },
        dates: {
          etd: '2024-03-15',
          eta: '2024-04-20',
          cutoff_vgm: '2024-03-10',
          cutoff_si: '2024-03-12',
          cutoff_cy: '2024-03-14',
        },
        cargo: { description: 'Electronics', weight_kg: 15000 },
        containers: [
          { container_number: 'MSKU1806510', type: '40HC' },
          { container_number: 'TCLU7284859', type: '40HC' },
        ],
        shipper: { name: 'Tech Manufacturing Co' },
        consignee: { name: 'European Distributors BV' },
      }

      const result = extractBookingData(document, extracted)

      expect(result.bookingNumber).toBe('BKG-2024-001')
      expect(result.blNumber).toBe('MAEU123456789')
      expect(result.carrierName).toBe('Maersk')
      expect(result.vesselName).toBe('MAERSK EINDHOVEN')
      expect(result.voyageNumber).toBe('024W')
      expect(result.portOfLoading).toBe('SHANGHAI (CNSHA)')
      expect(result.portOfDischarge).toBe('ROTTERDAM (NLRTM)')
      expect(result.etd).not.toBeNull()
      expect(result.eta).not.toBeNull()
      expect(result.vgmCutoffDate).not.toBeNull()
      expect(result.docCutoffDate).not.toBeNull()
      expect(result.gateCloseDate).not.toBeNull()
      expect(result.commodityDescription).toBe('Electronics')
      expect(result.containerNumbers).toEqual(['MSKU1806510', 'TCLU7284859'])
      expect(result.shipper?.name).toBe('Tech Manufacturing Co')
      expect(result.consignee?.name).toBe('European Distributors BV')
    })
  })
})
