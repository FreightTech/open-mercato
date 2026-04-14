/**
 * KSeF number format + CRC-8 validation.
 *
 * Spec: `ksef-docs/faktury/numer-ksef.md`
 *
 * Canonical shape (35 characters total):
 *
 *   NNNNNNNNNN-YYYYMMDD-HHHHHHHHHHHH-CC
 *
 * where
 *   NNNNNNNNNN   10-digit seller NIP
 *   YYYYMMDD     date the invoice was accepted for processing
 *   HHHHHHHHHHHH 12-char hex (uppercase), the technical identifier
 *   CC           2-char hex CRC-8 checksum of the first 32 chars (the
 *                "data" portion, i.e. everything except the `-CC` suffix)
 *
 * CRC-8 parameters (per the reference implementations):
 *   polynomial      0x07
 *   initial value   0x00
 *   no reflection, no xor-out, no final inversion
 */

const KSEF_NUMBER_LENGTH = 35
const KSEF_NUMBER_PATTERN =
  /^(\d{10})-(\d{8})-([0-9A-F]{12})-([0-9A-F]{2})$/

export interface KsefNumberParts {
  nip: string
  /** `YYYYMMDD` */
  date: string
  /** 12-char technical identifier */
  technical: string
  /** 2-char checksum (uppercase hex) */
  checksum: string
}

export interface KsefNumberValidationResult {
  valid: boolean
  parts?: KsefNumberParts
  /** Populated when `valid` is false. */
  error?: string
}

/**
 * CRC-8 with polynomial 0x07, init 0x00, no reflection, no xor-out.
 *
 * The input is interpreted byte-by-byte in ASCII (the KSeF number is
 * ASCII-only, so this matches `utf-8` bytes too). The return value is the
 * raw 8-bit remainder.
 */
export function crc8Ksef(data: string): number {
  let crc = 0
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) & 0xff
    for (let bit = 0; bit < 8; bit++) {
      // tslint:disable-next-line:no-bitwise
      crc = ((crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) : (crc << 1)) & 0xff
    }
  }
  return crc
}

/**
 * Validates a KSeF number string against the documented shape + checksum.
 *
 * Returns a result object rather than throwing so callers can distinguish
 * "definitely bad" from "transient / unknown" at call sites.
 */
export function validateKsefNumber(input: string | null | undefined): KsefNumberValidationResult {
  if (input == null) {
    return { valid: false, error: 'KSeF number is empty.' }
  }
  const value = String(input).trim()
  if (value.length !== KSEF_NUMBER_LENGTH) {
    return {
      valid: false,
      error: `KSeF number must be exactly ${KSEF_NUMBER_LENGTH} characters, got ${value.length}.`,
    }
  }
  const match = KSEF_NUMBER_PATTERN.exec(value)
  if (!match) {
    return {
      valid: false,
      error:
        'KSeF number does not match the expected shape ' +
        'NNNNNNNNNN-YYYYMMDD-HHHHHHHHHHHH-CC with uppercase hex in the last two segments.',
    }
  }

  const [, nip, date, technical, checksum] = match
  const dataPart = value.slice(0, KSEF_NUMBER_LENGTH - 3) // everything up to and excluding "-CC"
  const computed = crc8Ksef(dataPart)
  const computedHex = computed.toString(16).toUpperCase().padStart(2, '0')

  if (computedHex !== checksum) {
    return {
      valid: false,
      error: `KSeF number CRC-8 mismatch — computed ${computedHex}, got ${checksum}.`,
    }
  }

  return {
    valid: true,
    parts: { nip, date, technical, checksum },
  }
}

/**
 * Convenience boolean wrapper — use this in non-validating call sites
 * (e.g. UI highlighting) where you don't care about the error message.
 */
export function isKsefNumber(input: string | null | undefined): boolean {
  return validateKsefNumber(input).valid
}
