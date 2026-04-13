/** @jest-environment node */
import { crc8Ksef, isKsefNumber, validateKsefNumber } from '../ksef-number'

describe('crc8Ksef', () => {
  it('matches the canonical example from the spec', () => {
    // From ksef-docs/faktury/numer-ksef.md:
    // 5265877635-20250826-0100001AF629-AF
    // The CRC-8 of "5265877635-20250826-0100001AF629" is 0xAF.
    const computed = crc8Ksef('5265877635-20250826-0100001AF629')
    expect(computed.toString(16).toUpperCase().padStart(2, '0')).toBe('AF')
  })

  it('returns 0 for an empty string (initial value = 0x00)', () => {
    expect(crc8Ksef('')).toBe(0)
  })
})

describe('validateKsefNumber', () => {
  it('accepts the canonical example from the spec', () => {
    const result = validateKsefNumber('5265877635-20250826-0100001AF629-AF')
    expect(result.valid).toBe(true)
    expect(result.parts).toEqual({
      nip: '5265877635',
      date: '20250826',
      technical: '0100001AF629',
      checksum: 'AF',
    })
  })

  it('rejects a missing input', () => {
    expect(validateKsefNumber(null).valid).toBe(false)
    expect(validateKsefNumber(undefined).valid).toBe(false)
    expect(validateKsefNumber('').valid).toBe(false)
  })

  it('rejects wrong length', () => {
    const result = validateKsefNumber('5265877635-20250826-0100001AF629-A')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/35 characters/)
  })

  it('rejects lowercase hex in the checksum', () => {
    const result = validateKsefNumber('5265877635-20250826-0100001AF629-af')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/shape/)
  })

  it('rejects lowercase hex in the technical identifier', () => {
    // Mixed case should be rejected by the pattern before checksum check.
    const result = validateKsefNumber('5265877635-20250826-0100001af629-AF')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/shape/)
  })

  it('rejects a non-numeric NIP', () => {
    const result = validateKsefNumber('A265877635-20250826-0100001AF629-AF')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/shape/)
  })

  it('rejects a good-shape number with a wrong checksum', () => {
    // Flip the checksum from AF to 00.
    const result = validateKsefNumber('5265877635-20250826-0100001AF629-00')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/CRC-8/)
  })

  it('rejects hand-written fixtures that do not satisfy CRC-8', () => {
    // The 4-char pattern we use in the XSD test suite satisfies the regex
    // but will not satisfy the CRC — good: the validator rejects our own
    // test placeholders, so we won't accidentally promote them to live data.
    const result = validateKsefNumber('7980332920-20260228-ABCDEFABCDEF-A1')
    expect(result.valid).toBe(false)
  })

  it('trims surrounding whitespace before validating', () => {
    const result = validateKsefNumber('   5265877635-20250826-0100001AF629-AF  ')
    expect(result.valid).toBe(true)
  })
})

describe('isKsefNumber', () => {
  it('returns a boolean wrapper around validateKsefNumber', () => {
    expect(isKsefNumber('5265877635-20250826-0100001AF629-AF')).toBe(true)
    expect(isKsefNumber('not a ksef number')).toBe(false)
    expect(isKsefNumber(null)).toBe(false)
  })
})
