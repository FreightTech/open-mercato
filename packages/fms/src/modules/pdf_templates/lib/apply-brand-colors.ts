/**
 * Applies brand colors and logo to a pdfme template at render time.
 *
 * pdfme only substitutes {placeholders} inside text `content` fields —
 * it does NOT substitute values in style properties like `fontColor`,
 * `color`, or `backgroundColor`. This function replaces the hardcoded
 * default palette with actual brand colors across all element properties.
 */

import type { PdfmeTemplateJson } from '../data/entities'
import { PRIMARY_COLOR, ACCENT_COLOR } from './default-pdfme-templates'

export interface BrandOverrides {
  primaryColor?: string | null
  accentColor?: string | null
}

/**
 * Deep-clone a template and replace default PRIMARY_COLOR / ACCENT_COLOR
 * with the brand's actual colors wherever they appear in element properties.
 *
 * Logo injection is NOT handled here — pdfme image elements require base64
 * data, not URLs. Logos are passed via the `companyLogo` input variable
 * which is resolved to base64 by the offer PDF service.
 */
export function applyBrandColors(
  template: PdfmeTemplateJson,
  brand: BrandOverrides,
): PdfmeTemplateJson {
  const primary = brand.primaryColor || null
  const accent = brand.accentColor || null

  const needsColorReplace = (primary && primary !== PRIMARY_COLOR) || (accent && accent !== ACCENT_COLOR)

  if (!needsColorReplace) return template

  // Deep-clone to avoid mutating the shared default
  const cloned: PdfmeTemplateJson = JSON.parse(JSON.stringify(template))

  for (const page of cloned.schemas) {
    for (const element of page) {
      if (primary && primary !== PRIMARY_COLOR) {
        replaceColorInElement(element, PRIMARY_COLOR, primary)
      }
      if (accent && accent !== ACCENT_COLOR) {
        replaceColorInElement(element, ACCENT_COLOR, accent)
      }
    }
  }

  return cloned
}

/**
 * Walk all properties of a schema element and replace one hex color with another.
 * Handles flat string props, nested objects (headStyles, bodyStyles, tableStyles),
 * and nested objects with sub-objects (borderWidth within styles).
 */
function replaceColorInElement(
  element: Record<string, unknown>,
  oldColor: string,
  newColor: string,
): void {
  const oldLower = oldColor.toLowerCase()

  for (const [key, value] of Object.entries(element)) {
    if (typeof value === 'string') {
      if (value.toLowerCase() === oldLower) {
        element[key] = newColor
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested style objects (headStyles, bodyStyles, etc.)
      replaceColorInElement(value as Record<string, unknown>, oldColor, newColor)
    }
  }
}
