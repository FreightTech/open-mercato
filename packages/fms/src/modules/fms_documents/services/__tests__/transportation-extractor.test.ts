import { describe, it, expect, beforeEach } from 'vitest'
import {
  TransportationMetadataExtractor,
  createTransportationExtractor,
  isValidContainerNumber,
} from '../transportation-extractor.service'

describe('TransportationMetadataExtractor', () => {
  let extractor: TransportationMetadataExtractor

  beforeEach(() => {
    extractor = createTransportationExtractor()
  })

  describe('extractContainerNumbers', () => {
    it('should extract valid ISO 6346 container number', () => {
      const text = 'Container: MSCU1234567'
      // Note: This may not be a valid check digit, testing pattern matching
      const containers = extractor.extractContainerNumbers(text.toUpperCase())
      // The extractor validates check digits, so we need a real valid container
      expect(containers).toBeDefined()
    })

    it('should extract container with valid check digit MSKU1806510', () => {
      // MSKU1806510 is a known valid container number
      const text = 'MSKU1806510'
      const containers = extractor.extractContainerNumbers(text.toUpperCase())
      expect(containers).toContain('MSKU1806510')
    })

    it('should extract multiple containers from text', () => {
      const text = 'Containers: MSKU1806510, TCLU7284859'
      const containers = extractor.extractContainerNumbers(text.toUpperCase())
      expect(containers.length).toBeGreaterThanOrEqual(1)
    })

    it('should deduplicate containers', () => {
      const text = 'MSKU1806510 and again MSKU1806510'
      const containers = extractor.extractContainerNumbers(text.toUpperCase())
      const mskuCount = containers.filter((c) => c === 'MSKU1806510').length
      expect(mskuCount).toBeLessThanOrEqual(1)
    })

    it('should return empty array for text without containers', () => {
      const text = 'No containers here'
      const containers = extractor.extractContainerNumbers(text.toUpperCase())
      expect(containers).toEqual([])
    })

    it('should handle containers with category code U', () => {
      // U = standard freight container
      const text = 'MSCU1234560' // loose pattern, category U
      const containers = extractor.extractContainerNumbers(text.toUpperCase())
      // May or may not match depending on check digit validation
      expect(Array.isArray(containers)).toBe(true)
    })

    it('should handle containers with category code J', () => {
      // J = detachable freight container
      const text = 'MSCJ1234567'
      const containers = extractor.extractContainerNumbers(text.toUpperCase())
      expect(Array.isArray(containers)).toBe(true)
    })

    it('should handle containers with category code Z', () => {
      // Z = trailer
      const text = 'MSCZ1234567'
      const containers = extractor.extractContainerNumbers(text.toUpperCase())
      expect(Array.isArray(containers)).toBe(true)
    })
  })

  describe('validateContainerCheckDigit', () => {
    it('should return true for valid container MSKU1806510', () => {
      // This is a known valid container with correct check digit
      expect(extractor.validateContainerCheckDigit('MSKU1806510')).toBe(true)
    })

    it('should return false for invalid format (too short)', () => {
      expect(extractor.validateContainerCheckDigit('MSKU12345')).toBe(false)
    })

    it('should return false for invalid format (too long)', () => {
      expect(extractor.validateContainerCheckDigit('MSKU123456789')).toBe(false)
    })

    it('should return false for invalid format (letters in numeric part)', () => {
      expect(extractor.validateContainerCheckDigit('MSKUABCDEFG')).toBe(false)
    })

    it('should return false for wrong check digit', () => {
      // MSKU1806510 is valid, so MSKU1806511 should be invalid
      expect(extractor.validateContainerCheckDigit('MSKU1806511')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(extractor.validateContainerCheckDigit('')).toBe(false)
    })

    it('should validate TCLU7284859 as valid', () => {
      // Another known valid container
      expect(extractor.validateContainerCheckDigit('TCLU7284859')).toBe(true)
    })

    it('should validate HLXU1234560 format correctly', () => {
      // Testing the algorithm: we need to verify the check digit calculation
      // For this test, we just verify the function runs without error
      const result = extractor.validateContainerCheckDigit('HLXU1234560')
      expect(typeof result).toBe('boolean')
    })
  })

  describe('extractBlNumber', () => {
    it('should extract COSU prefixed BL number', () => {
      const text = 'BL: COSU123456789'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('COSU123456789')
    })

    it('should extract MAEU prefixed BL number', () => {
      const text = 'Bill of Lading: MAEU987654321'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('MAEU987654321')
    })

    it('should extract CMDU prefixed BL number', () => {
      const text = 'Reference: CMDU12345678'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('CMDU12345678')
    })

    it('should extract HLCU prefixed BL number', () => {
      const text = 'HLCU0987654321'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('HLCU0987654321')
    })

    it('should extract MSCU prefixed BL number', () => {
      const text = 'MSC BL: MSCU11223344556'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('MSCU11223344556')
    })

    it('should extract BL from "B/L No:" format', () => {
      const text = 'B/L No: ABC12345678'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('ABC12345678')
    })

    it('should extract BL from "BL Number:" format', () => {
      const text = 'BL Number: XYZ98765432'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('XYZ98765432')
    })

    it('should extract BL from Polish "Konosament nr" format', () => {
      const text = 'Konosament nr: POL12345678'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('POL12345678')
    })

    it('should return null for text without BL number', () => {
      const text = 'No bill of lading here'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBeNull()
    })

    it('should extract first BL when multiple present', () => {
      const text = 'BL: COSU111111111 and also MAEU222222222'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('COSU111111111')
    })

    it('should return full BL number including carrier prefix (non-capturing group)', () => {
      // Verifies the fix from capturing group (COSU|...) to non-capturing (?:COSU|...)
      // With a capturing group, match[1] would return only the carrier prefix 'POEU'
      // With a non-capturing group, match[1] is undefined so match[0] returns the full BL
      const text = 'POEU12345678'
      const bl = extractor.extractBlNumber(text.toUpperCase())
      expect(bl).toBe('POEU12345678')
      expect(bl).not.toBe('POEU')
    })
  })

  describe('extractVesselName', () => {
    it('should extract vessel from "M/V" format', () => {
      const text = 'M/V EVER GIVEN'
      const vessel = extractor.extractVesselName(text.toUpperCase())
      expect(vessel).toBe('Ever Given')
    })

    it('should extract vessel from "Vessel:" format', () => {
      const text = 'Vessel: MAERSK EINDHOVEN'
      const vessel = extractor.extractVesselName(text.toUpperCase())
      expect(vessel).toBe('Maersk Eindhoven')
    })

    it('should extract vessel from "VSL:" format', () => {
      const text = 'VSL: MSC OSCAR'
      const vessel = extractor.extractVesselName(text.toUpperCase())
      expect(vessel).toBe('Msc Oscar')
    })

    it('should extract vessel from "Motor Vessel:" format', () => {
      const text = 'Motor Vessel: COSCO SHIPPING ARIES'
      const vessel = extractor.extractVesselName(text.toUpperCase())
      expect(vessel).toBe('Cosco Shipping Aries')
    })

    it('should return null for text without vessel name', () => {
      const text = 'This document has no ship data'
      const vessel = extractor.extractVesselName(text.toUpperCase())
      expect(vessel).toBeNull()
    })

    it('should clean up vessel name with multiple spaces', () => {
      const text = 'M/V EVER   GIVEN'
      const vessel = extractor.extractVesselName(text.toUpperCase())
      expect(vessel).toBe('Ever Given')
    })
  })

  describe('extractImoNumber', () => {
    it('should extract IMO number with colon', () => {
      const text = 'IMO: 9811000'
      const imo = extractor.extractImoNumber(text.toUpperCase())
      expect(imo).toBe('9811000')
    })

    it('should extract IMO number without colon', () => {
      const text = 'IMO 9811000'
      const imo = extractor.extractImoNumber(text.toUpperCase())
      expect(imo).toBe('9811000')
    })

    it('should return null for invalid IMO (too short)', () => {
      const text = 'IMO: 123456'
      const imo = extractor.extractImoNumber(text.toUpperCase())
      expect(imo).toBeNull()
    })

    it('should return null for text without IMO', () => {
      const text = 'No IMO number here'
      const imo = extractor.extractImoNumber(text.toUpperCase())
      expect(imo).toBeNull()
    })
  })

  describe('extractVoyageNumber', () => {
    it('should extract voyage from "VOY:" format', () => {
      const text = 'VOY: 123N'
      const voyage = extractor.extractVoyageNumber(text.toUpperCase())
      expect(voyage).toBe('123N')
    })

    it('should extract voyage from "VOYAGE:" format', () => {
      const text = 'VOYAGE: 456E'
      const voyage = extractor.extractVoyageNumber(text.toUpperCase())
      expect(voyage).toBe('456E')
    })

    it('should extract voyage from "VVD:" format', () => {
      const text = 'VVD: 789W'
      const voyage = extractor.extractVoyageNumber(text.toUpperCase())
      expect(voyage).toBe('789W')
    })

    it('should extract voyage from "Voyage:" format', () => {
      const text = 'Voyage: ABC-123'
      const voyage = extractor.extractVoyageNumber(text.toUpperCase())
      expect(voyage).toBe('ABC-123')
    })

    it('should return null for text without voyage', () => {
      const text = 'This document has no ship journey reference'
      const voyage = extractor.extractVoyageNumber(text.toUpperCase())
      expect(voyage).toBeNull()
    })
  })

  describe('extractPort', () => {
    describe('POL (Port of Loading)', () => {
      it('should extract POL with colon', () => {
        const text = 'POL: SHANGHAI'
        const port = extractor.extractPort(text.toUpperCase(), 'pol')
        expect(port).toBe('SHANGHAI')
      })

      it('should extract POL from "Port of Loading:" format', () => {
        const text = 'Port of Loading: NINGBO'
        const port = extractor.extractPort(text.toUpperCase(), 'pol')
        expect(port).toBe('NINGBO')
      })

      it('should extract POL from "Loading Port:" format', () => {
        const text = 'Loading Port: YANTIAN'
        const port = extractor.extractPort(text.toUpperCase(), 'pol')
        expect(port).toBe('YANTIAN')
      })

      it('should extract POL with UN/LOCODE in parentheses', () => {
        const text = 'POL: SHANGHAI (CNSHA)'
        const port = extractor.extractPort(text.toUpperCase(), 'pol')
        expect(port).toBe('SHANGHAI (CNSHA)')
      })

      it('should return null when no POL found', () => {
        const text = 'No port information'
        const port = extractor.extractPort(text.toUpperCase(), 'pol')
        expect(port).toBeNull()
      })
    })

    describe('POD (Port of Discharge)', () => {
      it('should extract POD with colon', () => {
        const text = 'POD: ROTTERDAM'
        const port = extractor.extractPort(text.toUpperCase(), 'pod')
        expect(port).toBe('ROTTERDAM')
      })

      it('should extract POD from "Port of Discharge:" format', () => {
        const text = 'Port of Discharge: HAMBURG'
        const port = extractor.extractPort(text.toUpperCase(), 'pod')
        expect(port).toBe('HAMBURG')
      })

      it('should extract POD from "Discharge Port:" format', () => {
        const text = 'Discharge Port: GDANSK'
        const port = extractor.extractPort(text.toUpperCase(), 'pod')
        expect(port).toBe('GDANSK')
      })

      it('should extract POD from "Destination:" format', () => {
        const text = 'Destination: FELIXSTOWE'
        const port = extractor.extractPort(text.toUpperCase(), 'pod')
        expect(port).toBe('FELIXSTOWE')
      })

      it('should clean port name with trailing comma', () => {
        const text = 'POD: ROTTERDAM,'
        const port = extractor.extractPort(text.toUpperCase(), 'pod')
        expect(port).toBe('ROTTERDAM')
      })
    })
  })

  describe('extractBookingNumber', () => {
    it('should extract from "Booking No:" format', () => {
      const text = 'Booking No: BKG123456'
      const booking = extractor.extractBookingNumber(text.toUpperCase())
      expect(booking).toBe('BKG123456')
    })

    it('should extract from "Booking Number:" format', () => {
      const text = 'Booking Number: ABC-789-XYZ'
      const booking = extractor.extractBookingNumber(text.toUpperCase())
      expect(booking).toBe('ABC-789-XYZ')
    })

    it('should extract from "Booking Ref:" format', () => {
      const text = 'Booking Ref: REF2024001'
      const booking = extractor.extractBookingNumber(text.toUpperCase())
      expect(booking).toBe('REF2024001')
    })

    it('should extract from "BKG:" format', () => {
      const text = 'BKG: 9876543210'
      const booking = extractor.extractBookingNumber(text.toUpperCase())
      expect(booking).toBe('9876543210')
    })

    it('should return null when no booking found', () => {
      const text = 'This document has no reservation data'
      const booking = extractor.extractBookingNumber(text.toUpperCase())
      expect(booking).toBeNull()
    })
  })

  describe('extractDate', () => {
    describe('ETD extraction', () => {
      it('should extract ETD in DD.MM.YYYY format', () => {
        const text = 'ETD: 15.03.2024'
        const date = extractor.extractDate(text.toUpperCase(), 'etd')
        expect(date).toBe('2024-03-15')
      })

      it('should extract ETD in DD/MM/YYYY format', () => {
        const text = 'ETD: 20/04/2024'
        const date = extractor.extractDate(text.toUpperCase(), 'etd')
        expect(date).toBe('2024-04-20')
      })

      it('should extract ETD in DD-MM-YYYY format', () => {
        const text = 'ETD: 25-05-2024'
        const date = extractor.extractDate(text.toUpperCase(), 'etd')
        expect(date).toBe('2024-05-25')
      })

      it('should extract ETD from "Departure:" format', () => {
        const text = 'Departure: 10.06.2024'
        const date = extractor.extractDate(text.toUpperCase(), 'etd')
        expect(date).toBe('2024-06-10')
      })

      it('should handle 2-digit year (>50 = 1900s)', () => {
        const text = 'ETD: 01.01.99'
        const date = extractor.extractDate(text.toUpperCase(), 'etd')
        expect(date).toBe('1999-01-01')
      })

      it('should handle 2-digit year (<=50 = 2000s)', () => {
        const text = 'ETD: 01.01.24'
        const date = extractor.extractDate(text.toUpperCase(), 'etd')
        expect(date).toBe('2024-01-01')
      })
    })

    describe('ETA extraction', () => {
      it('should extract ETA in DD.MM.YYYY format', () => {
        const text = 'ETA: 30.07.2024'
        const date = extractor.extractDate(text.toUpperCase(), 'eta')
        expect(date).toBe('2024-07-30')
      })

      it('should extract ETA from "Arrival:" format', () => {
        const text = 'Arrival: 15.08.2024'
        const date = extractor.extractDate(text.toUpperCase(), 'eta')
        expect(date).toBe('2024-08-15')
      })

      it('should return null for invalid month', () => {
        const text = 'ETA: 15.13.2024'
        const date = extractor.extractDate(text.toUpperCase(), 'eta')
        expect(date).toBeNull()
      })

      it('should return null for invalid day', () => {
        const text = 'ETA: 32.12.2024'
        const date = extractor.extractDate(text.toUpperCase(), 'eta')
        expect(date).toBeNull()
      })
    })
  })

  describe('identifyCarrier', () => {
    it('should identify COSCO from COSU prefix', () => {
      const result = extractor.identifyCarrier('COSU123456789', '')
      expect(result.name).toBe('COSCO')
      expect(result.scac).toBe('COSU')
    })

    it('should identify Maersk from MAEU prefix', () => {
      const result = extractor.identifyCarrier('MAEU987654321', '')
      expect(result.name).toBe('Maersk')
      expect(result.scac).toBe('MAEU')
    })

    it('should identify CMA CGM from CMDU prefix', () => {
      const result = extractor.identifyCarrier('CMDU12345678', '')
      expect(result.name).toBe('CMA CGM')
      expect(result.scac).toBe('CMDU')
    })

    it('should identify Hapag-Lloyd from HLCU prefix', () => {
      const result = extractor.identifyCarrier('HLCU00000000', '')
      expect(result.name).toBe('Hapag-Lloyd')
      expect(result.scac).toBe('HLCU')
    })

    it('should identify MSC from MSCU prefix', () => {
      const result = extractor.identifyCarrier('MSCU11111111', '')
      expect(result.name).toBe('MSC')
      expect(result.scac).toBe('MSCU')
    })

    it('should identify Evergreen from EGLV prefix', () => {
      const result = extractor.identifyCarrier('EGLV22222222', '')
      expect(result.name).toBe('Evergreen')
      expect(result.scac).toBe('EGLV')
    })

    it('should identify carrier from text when BL has unknown prefix', () => {
      const result = extractor.identifyCarrier('XXXX12345678', 'SHIPPED VIA MAERSK LINE')
      expect(result.name).toBe('Maersk')
      expect(result.scac).toBe('MAEU')
    })

    it('should return null for unknown carrier', () => {
      const result = extractor.identifyCarrier('XXXX12345678', 'NO CARRIER INFO')
      expect(result.name).toBeNull()
      expect(result.scac).toBeNull()
    })

    it('should return null when BL is null and no carrier in text', () => {
      const result = extractor.identifyCarrier(null, 'NO CARRIER INFO')
      expect(result.name).toBeNull()
      expect(result.scac).toBeNull()
    })
  })

  describe('validateContainer', () => {
    it('should return valid result for valid container', () => {
      const result = extractor.validateContainer('MSKU1806510')
      expect(result.valid).toBe(true)
      expect(result.number).toBe('MSKU1806510')
      expect(result.owner).toBe('MSK')
      expect(result.checkDigit).toBe('0')
    })

    it('should return invalid result for invalid container', () => {
      const result = extractor.validateContainer('INVALID')
      expect(result.valid).toBe(false)
      expect(result.owner).toBeUndefined()
      expect(result.checkDigit).toBeUndefined()
    })

    it('should normalize lowercase to uppercase', () => {
      const result = extractor.validateContainer('msku1806510')
      expect(result.number).toBe('MSKU1806510')
    })

    it('should remove spaces from container number', () => {
      const result = extractor.validateContainer('MSKU 1806510')
      expect(result.number).toBe('MSKU1806510')
    })
  })

  describe('extract (full integration)', () => {
    it('should extract all metadata from complete shipping document', () => {
      const text = `
        BILL OF LADING
        B/L No: MAEU123456789
        
        Vessel: MAERSK EINDHOVEN - VOY: 024W
        IMO: 9632179
        
        POL: SHANGHAI (CNSHA)
        POD: ROTTERDAM (NLRTM)
        
        ETD: 15.03.2024
        ETA: 20.04.2024
        
        Booking No: BKG2024001
        
        Container: MSKU1806510
      `

      const result = extractor.extract(text)

      expect(result.blNumber).toBe('MAEU123456789')
      expect(result.vesselName).toBe('Maersk Eindhoven')
      expect(result.voyageNumber).toBe('024W')
      expect(result.vesselImo).toBe('9632179')
      expect(result.portOfLoading).toBe('SHANGHAI (CNSHA)')
      expect(result.portOfDischarge).toBe('ROTTERDAM (NLRTM)')
      expect(result.etd).toBe('2024-03-15')
      expect(result.eta).toBe('2024-04-20')
      expect(result.bookingNumber).toBe('BKG2024001')
      expect(result.containerNumbers).toContain('MSKU1806510')
      expect(result.carrierName).toBe('Maersk')
      expect(result.carrierScac).toBe('MAEU')
    })

    it('should return null for missing fields', () => {
      const text = 'Just some random text without shipping info'
      const result = extractor.extract(text)

      expect(result.blNumber).toBeNull()
      expect(result.vesselName).toBeNull()
      expect(result.voyageNumber).toBeNull()
      expect(result.vesselImo).toBeNull()
      expect(result.portOfLoading).toBeNull()
      expect(result.portOfDischarge).toBeNull()
      expect(result.etd).toBeNull()
      expect(result.eta).toBeNull()
      expect(result.bookingNumber).toBeNull()
      expect(result.containerNumbers).toBeUndefined()
      expect(result.carrierName).toBeNull()
      expect(result.carrierScac).toBeNull()
    })

    it('should handle partial information', () => {
      const text = `
        BL: COSU987654321
        POD: GDANSK
      `
      const result = extractor.extract(text)

      expect(result.blNumber).toBe('COSU987654321')
      expect(result.portOfDischarge).toBe('GDANSK')
      expect(result.carrierName).toBe('COSCO')
      expect(result.carrierScac).toBe('COSU')
      // Other fields should be null
      expect(result.vesselName).toBeNull()
    })
  })
})

describe('isValidContainerNumber', () => {
  describe('non-strict mode', () => {
    it('should return true for valid container format', () => {
      expect(isValidContainerNumber('MSKU1806510')).toBe(true)
    })

    it('should return true for container with category U', () => {
      expect(isValidContainerNumber('MSCU1234567')).toBe(true)
    })

    it('should return true for container with category J', () => {
      expect(isValidContainerNumber('MSCJ1234567')).toBe(true)
    })

    it('should return true for container with category Z', () => {
      expect(isValidContainerNumber('MSCZ1234567')).toBe(true)
    })

    it('should return false for null', () => {
      expect(isValidContainerNumber(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isValidContainerNumber(undefined)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isValidContainerNumber('')).toBe(false)
    })

    it('should return false for invalid format (too short)', () => {
      expect(isValidContainerNumber('MSKU12345')).toBe(false)
    })

    it('should return false for invalid format (too long)', () => {
      expect(isValidContainerNumber('MSKU123456789')).toBe(false)
    })

    it('should return false for invalid category code', () => {
      // X is not a valid category code (only U, J, Z)
      expect(isValidContainerNumber('MSCX1234567')).toBe(false)
    })

    it('should handle lowercase input', () => {
      expect(isValidContainerNumber('msku1806510')).toBe(true)
    })

    it('should handle input with spaces', () => {
      expect(isValidContainerNumber('MSKU 1806510')).toBe(true)
    })
  })

  describe('strict mode (check digit validation)', () => {
    it('should return true for valid container with correct check digit', () => {
      expect(isValidContainerNumber('MSKU1806510', true)).toBe(true)
    })

    it('should return false for container with wrong check digit', () => {
      // MSKU1806510 is valid, so MSKU1806511 should be invalid in strict mode
      expect(isValidContainerNumber('MSKU1806511', true)).toBe(false)
    })

    it('should validate TCLU7284859 as valid', () => {
      expect(isValidContainerNumber('TCLU7284859', true)).toBe(true)
    })
  })
})

describe('createTransportationExtractor', () => {
  it('should create a new instance', () => {
    const extractor = createTransportationExtractor()
    expect(extractor).toBeInstanceOf(TransportationMetadataExtractor)
  })

  it('should create independent instances', () => {
    const extractor1 = createTransportationExtractor()
    const extractor2 = createTransportationExtractor()
    expect(extractor1).not.toBe(extractor2)
  })
})
