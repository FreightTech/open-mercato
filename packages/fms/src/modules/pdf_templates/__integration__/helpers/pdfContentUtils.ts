import pdfParse from 'pdf-parse'

/**
 * Extract text content from a PDF buffer.
 *
 * Uses pdf-parse library to extract all text from PDF pages.
 * Useful for verifying that placeholder substitution works correctly.
 *
 * @param pdfBuffer - The PDF file as a Buffer
 * @returns Extracted text content from all pages
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const data = await pdfParse(pdfBuffer)
  return data.text
}

/**
 * Extract PDF metadata along with text content.
 *
 * @param pdfBuffer - The PDF file as a Buffer
 * @returns Object containing text and metadata
 */
export async function extractPdfData(pdfBuffer: Buffer): Promise<{
  text: string
  numPages: number
  info: Record<string, unknown>
}> {
  const data = await pdfParse(pdfBuffer)
  return {
    text: data.text,
    numPages: data.numpages,
    info: data.info,
  }
}

/**
 * Default patterns that should NEVER appear in generated PDFs.
 * These indicate bugs in placeholder substitution or value sanitization.
 */
export const FORBIDDEN_PDF_PATTERNS = [
  /\[object Object\]/, // Objects converted to string incorrectly
  /\[Array\]/, // Arrays converted to string incorrectly
  /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/, // Unreplaced double-brace placeholders
]

/**
 * Patterns for unreplaced single-brace placeholders.
 * Separate from FORBIDDEN because some PDFs might legitimately contain braces.
 */
export const UNREPLACED_PLACEHOLDER_PATTERN = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/

/**
 * Options for PDF content assertion.
 */
export interface PdfContentAssertionOptions {
  /** Values that MUST appear in the PDF */
  expectedValues?: string[]
  /** Values that must NOT appear in the PDF */
  unexpectedValues?: string[]
  /** Regex patterns that must NOT match */
  unexpectedPatterns?: RegExp[]
  /** If true, also check for unreplaced single-brace placeholders */
  checkUnreplacedPlaceholders?: boolean
}

/**
 * Assert that PDF content meets expectations.
 *
 * Throws an error with descriptive message if any assertion fails.
 *
 * @param pdfText - Extracted text from PDF
 * @param options - Assertion options
 */
export function assertPdfContent(pdfText: string, options: PdfContentAssertionOptions): void {
  const errors: string[] = []

  // Check expected values are present
  for (const value of options.expectedValues ?? []) {
    if (!pdfText.includes(value)) {
      errors.push(`Expected PDF to contain: "${value}"`)
    }
  }

  // Check unexpected values are absent
  for (const value of options.unexpectedValues ?? []) {
    if (pdfText.includes(value)) {
      errors.push(`PDF should NOT contain: "${value}"`)
    }
  }

  // Check forbidden patterns (always checked)
  for (const pattern of FORBIDDEN_PDF_PATTERNS) {
    const match = pdfText.match(pattern)
    if (match) {
      errors.push(`PDF contains forbidden pattern ${pattern}: found "${match[0]}"`)
    }
  }

  // Check custom unexpected patterns
  for (const pattern of options.unexpectedPatterns ?? []) {
    const match = pdfText.match(pattern)
    if (match) {
      errors.push(`PDF contains unexpected pattern ${pattern}: found "${match[0]}"`)
    }
  }

  // Optionally check for unreplaced placeholders
  if (options.checkUnreplacedPlaceholders) {
    const match = pdfText.match(UNREPLACED_PLACEHOLDER_PATTERN)
    if (match) {
      errors.push(`PDF contains unreplaced placeholder: "${match[0]}"`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`PDF content assertion failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  }
}

/**
 * Quick check if PDF content has any obvious issues.
 *
 * Returns an object describing any problems found.
 * Useful for debugging without throwing.
 *
 * @param pdfText - Extracted text from PDF
 * @returns Object with boolean flags and found issues
 */
export function checkPdfContent(pdfText: string): {
  hasObjectObject: boolean
  hasDoubleBracePlaceholders: boolean
  hasUnreplacedPlaceholders: boolean
  issues: string[]
} {
  const issues: string[] = []

  const objectObjectMatch = pdfText.match(/\[object Object\]/)
  if (objectObjectMatch) {
    issues.push(`Found [object Object] - indicates unsanitized object value`)
  }

  const doubleBraceMatch = pdfText.match(/\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/)
  if (doubleBraceMatch) {
    issues.push(`Found unreplaced double-brace placeholder: ${doubleBraceMatch[0]}`)
  }

  const singleBraceMatch = pdfText.match(UNREPLACED_PLACEHOLDER_PATTERN)
  if (singleBraceMatch) {
    issues.push(`Found unreplaced placeholder: ${singleBraceMatch[0]}`)
  }

  return {
    hasObjectObject: !!objectObjectMatch,
    hasDoubleBracePlaceholders: !!doubleBraceMatch,
    hasUnreplacedPlaceholders: !!singleBraceMatch,
    issues,
  }
}
