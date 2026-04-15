/**
 * Strip namespace prefixes from XML tags so that `<tns:Fa>` becomes `<Fa>`.
 * This lets the simple indexOf-based parser handle any namespace prefix
 * that KSeF invoices may carry (e.g. `tns:`, `ns0:`).
 */
function stripNsPrefixes(xml: string): string {
  return xml.replace(/<(\/?)\w+:/g, '<$1')
}

function getTagContent(xml: string, tagName: string): string | null {
  const normalized = stripNsPrefixes(xml)
  const openTag = `<${tagName}`
  const closeTag = `</${tagName}>`

  const startIdx = normalized.indexOf(openTag)
  if (startIdx === -1) {
    return null
  }

  const contentStart = normalized.indexOf('>', startIdx) + 1
  if (contentStart === 0) {
    return null
  }

  const endIdx = normalized.indexOf(closeTag, contentStart)
  if (endIdx === -1) {
    return null
  }

  return normalized.substring(contentStart, endIdx).trim()
}

function getAllTagContents(xml: string, tagName: string): string[] {
  const normalized = stripNsPrefixes(xml)
  const results: string[] = []
  const openTag = `<${tagName}`
  const closeTag = `</${tagName}>`

  let searchStart = 0
  while (searchStart < normalized.length) {
    const startIdx = normalized.indexOf(openTag, searchStart)
    if (startIdx === -1) {
      break
    }

    const contentStart = normalized.indexOf('>', startIdx) + 1
    if (contentStart === 0) {
      break
    }

    const endIdx = normalized.indexOf(closeTag, contentStart)
    if (endIdx === -1) {
      break
    }

    results.push(normalized.substring(contentStart, endIdx).trim())
    searchStart = endIdx + closeTag.length
  }

  return results
}

function getNestedTagContent(xml: string, parentTag: string, childTag: string): string | null {
  const parentContent = getTagContent(xml, parentTag)
  if (!parentContent) {
    return null
  }
  return getTagContent(parentContent, childTag)
}

export function parseKsefXmlResponse(xml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  const referenceNumber = getTagContent(xml, 'ReferenceNumber')
  if (referenceNumber) {
    result.referenceNumber = referenceNumber
  }

  const sessionToken = getTagContent(xml, 'SessionToken')
  if (sessionToken) {
    result.sessionToken = sessionToken
  }

  const timestamp = getTagContent(xml, 'Timestamp')
  if (timestamp) {
    result.timestamp = timestamp
  }

  const processingCode = getTagContent(xml, 'ProcessingCode')
  if (processingCode) {
    result.processingCode = parseInt(processingCode, 10)
  }

  const processingDescription = getTagContent(xml, 'ProcessingDescription')
  if (processingDescription) {
    result.processingDescription = processingDescription
  }

  const elementReferenceNumber = getTagContent(xml, 'ElementReferenceNumber')
  if (elementReferenceNumber) {
    result.elementReferenceNumber = elementReferenceNumber
  }

  const ksefReferenceNumber = getTagContent(xml, 'KsefReferenceNumber')
  if (ksefReferenceNumber) {
    result.ksefReferenceNumber = ksefReferenceNumber
  }

  const acquisitionTimestamp = getTagContent(xml, 'AcquisitionTimestamp')
  if (acquisitionTimestamp) {
    result.acquisitionTimestamp = acquisitionTimestamp
  }

  const invoiceNumber = getTagContent(xml, 'InvoiceNumber')
  if (invoiceNumber) {
    result.invoiceNumber = invoiceNumber
  }

  const challenge = getTagContent(xml, 'Challenge')
  if (challenge) {
    result.challenge = challenge
  }

  const upo = getTagContent(xml, 'Upo')
  if (upo) {
    result.upo = upo
  }

  return result
}

export function extractUpoFromXml(xml: string): string | null {
  const upoContent = getTagContent(xml, 'Upo')
  if (upoContent) {
    return upoContent
  }

  const upoBase64 = getTagContent(xml, 'UPO')
  if (upoBase64) {
    return upoBase64
  }

  return null
}

export function extractInvoiceNumberFromFa3(xml: string): string | null {
  return getNestedTagContent(xml, 'Fa', 'P_2')
}

export function extractSellerNipFromFa3(xml: string): string | null {
  const podmiot1 = getTagContent(xml, 'Podmiot1')
  if (!podmiot1) {
    return null
  }
  return getTagContent(podmiot1, 'NIP')
}

export function extractBuyerNipFromFa3(xml: string): string | null {
  const podmiot2 = getTagContent(xml, 'Podmiot2')
  if (!podmiot2) {
    return null
  }
  return getTagContent(podmiot2, 'NIP')
}

export function extractInvoiceDateFromFa3(xml: string): string | null {
  return getNestedTagContent(xml, 'Fa', 'P_1')
}

export function extractGrossAmountFromFa3(xml: string): string | null {
  return getNestedTagContent(xml, 'Fa', 'P_15')
}

export function extractLineItemsFromFa3(xml: string): Array<{
  lineNumber: string | null
  description: string | null
  quantity: string | null
  unitPrice: string | null
  netAmount: string | null
  vatRate: string | null
}> {
  const faContent = getTagContent(xml, 'Fa')
  if (!faContent) {
    return []
  }

  const lineXmls = getAllTagContents(faContent, 'FaWiersz')
  return lineXmls.map((lineXml) => ({
    lineNumber: getTagContent(lineXml, 'NrWierszaFa'),
    description: getTagContent(lineXml, 'P_7'),
    quantity: getTagContent(lineXml, 'P_8B'),
    unitPrice: getTagContent(lineXml, 'P_9A'),
    netAmount: getTagContent(lineXml, 'P_11'),
    vatRate: getTagContent(lineXml, 'P_12'),
  }))
}

export function extractSellerNameFromFa3(xml: string): string | null {
  const podmiot1 = getTagContent(xml, 'Podmiot1')
  if (!podmiot1) {
    return null
  }
  return getTagContent(podmiot1, 'Nazwa') ?? getTagContent(podmiot1, 'NazwaHandlowa')
}

export function extractBuyerNameFromFa3(xml: string): string | null {
  const podmiot2 = getTagContent(xml, 'Podmiot2')
  if (!podmiot2) {
    return null
  }
  return getTagContent(podmiot2, 'Nazwa') ?? getTagContent(podmiot2, 'NazwaHandlowa')
}

export function extractDueDateFromFa3(xml: string): string | null {
  return getNestedTagContent(xml, 'Fa', 'TerminPlatnosci') ?? getNestedTagContent(xml, 'Platnosc', 'TerminPlatnosci')
}

export function extractCurrencyFromFa3(xml: string): string | null {
  return getNestedTagContent(xml, 'Fa', 'KodWaluty')
}

export function extractPaymentMethodFromFa3(xml: string): string | null {
  return getNestedTagContent(xml, 'Fa', 'FormaPlatnosci') ?? getNestedTagContent(xml, 'Platnosc', 'FormaPlatnosci')
}

export function extractExceptionDetails(xml: string): Array<{ code: number; description: string }> {
  const exceptionDetails = getAllTagContents(xml, 'ExceptionDetail')
  return exceptionDetails.map((detail) => ({
    code: parseInt(getTagContent(detail, 'ExceptionCode') ?? '0', 10),
    description: getTagContent(detail, 'ExceptionDescription') ?? '',
  }))
}
