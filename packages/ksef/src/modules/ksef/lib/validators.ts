const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7] as const

export function validateNip(nip: string): boolean {
  const cleaned = nip.replace(/[\s-]/g, '')

  if (!/^\d{10}$/.test(cleaned)) {
    return false
  }

  const digits = cleaned.split('').map(Number)
  let checksum = 0

  for (let idx = 0; idx < NIP_WEIGHTS.length; idx++) {
    checksum += digits[idx] * NIP_WEIGHTS[idx]
  }

  const remainder = checksum % 11

  if (remainder === 10) {
    return false
  }

  return remainder === digits[9]
}

export function formatNipForKsef(nip: string): string {
  const cleaned = nip.replace(/[\s-]/g, '')

  if (!validateNip(cleaned)) {
    throw new Error(`Invalid NIP: ${nip}`)
  }

  return cleaned
}

export function validateKsefNumber(ksefNumber: string): boolean {
  if (ksefNumber.length !== 35) {
    return false
  }

  const pattern = /^\d{10}-\d{8}-[A-Z0-9]{6}-[A-Z0-9]{8}$/
  return pattern.test(ksefNumber)
}

export function validateInvoiceNumber(invoiceNumber: string): boolean {
  if (!invoiceNumber || invoiceNumber.trim().length === 0) {
    return false
  }

  if (invoiceNumber.length > 256) {
    return false
  }

  return true
}

export function validateTaxId(taxId: string, countryCode?: string | null): boolean {
  const cleaned = taxId.replace(/[\s-]/g, '')

  if (countryCode === 'PL' || !countryCode) {
    return validateNip(cleaned)
  }

  return cleaned.length >= 4 && cleaned.length <= 20
}

export function formatTaxIdForKsef(taxId: string, countryCode?: string | null): string {
  const cleaned = taxId.replace(/[\s-]/g, '')

  if (countryCode === 'PL' || !countryCode) {
    return formatNipForKsef(cleaned)
  }

  return cleaned
}

export function validateBankAccountNumber(account: string): boolean {
  const cleaned = account.replace(/[\s-]/g, '')

  if (/^\d{26}$/.test(cleaned)) {
    return validateIban(`PL${cleaned}`)
  }

  if (/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) {
    return validateIban(cleaned)
  }

  return false
}

function validateIban(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4)

  const numericString = rearranged
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0)
      if (code >= 65 && code <= 90) {
        return String(code - 55)
      }
      return char
    })
    .join('')

  let remainder = 0
  for (let idx = 0; idx < numericString.length; idx++) {
    remainder = (remainder * 10 + Number(numericString[idx])) % 97
  }

  return remainder === 1
}

export function validateCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code)
}

export function validateVatRate(rate: string): boolean {
  const numericRate = parseFloat(rate)
  if (isNaN(numericRate)) {
    return false
  }
  return numericRate >= 0 && numericRate <= 100
}
