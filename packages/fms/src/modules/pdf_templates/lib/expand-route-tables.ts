/**
 * Expands a single `routesTable` pdfme element into N per-route table elements.
 *
 * pdfme `headStyles` renders white-on-dark headers while `bodyStyles` applies
 * uniformly to all body rows. By emitting one table per route we get visually
 * distinct coloured route headers for free — no per-row styling hack required.
 */

import type { PdfmeTemplateJson } from '../data/entities'
import type { OfferData } from './offer-variable-mapper'

// Height constants derived from the default template's headStyles / bodyStyles
const HEAD_HEIGHT = 8   // fontSize 9 + padding 4+4
const ROW_HEIGHT = 7    // fontSize 9 + padding 3+3
const TABLE_GAP = 4     // spacing between successive route tables

type SchemaElement = PdfmeTemplateJson['schemas'][0][0]

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Replace the single `routesTable` element with one table per route.
 *
 * Returns an updated (deep-copied) template and a new inputs object
 * containing per-route table data keys (`routeTable_0`, `routeTable_1`, …).
 *
 * If no `routesTable` element exists, or routes is empty, returns unchanged.
 */
export function expandRouteTables(
  template: PdfmeTemplateJson,
  inputs: Record<string, string>,
  routes: OfferData['routes'],
  currencyCode: string,
): { template: PdfmeTemplateJson; inputs: Record<string, string> } {
  if (!routes || routes.length === 0) {
    return { template, inputs }
  }

  // Find `routesTable` on page 0
  const page0 = template.schemas[0]
  if (!page0) return { template, inputs }
  const tableIndex = page0.findIndex(el => el.name === 'routesTable')
  if (tableIndex === -1) return { template, inputs }

  const original = page0[tableIndex]

  // Deep-clone schemas so we don't mutate the shared default template
  const clonedSchemas: PdfmeTemplateJson['schemas'] = JSON.parse(JSON.stringify(template.schemas))
  const clonedPage0 = clonedSchemas[0]

  // Extract style props from the original element to clone into each sub-table
  const {
    headStyles,
    bodyStyles,
    tableStyles,
    headWidthPercentages,
    width,
    columnStyles,
    showHead,
    repeatHead,
  } = original as Record<string, unknown>

  const originalY = original.position.y
  const originalHeight = original.height

  // Build replacement elements
  const replacementElements: SchemaElement[] = []
  const newInputs: Record<string, string> = { ...inputs }

  // Remove the flat routesTable input — it's superseded by per-route keys
  delete newInputs.routesTable

  let currentY = originalY
  let lineNum = 1
  let grandTotal = 0

  let tableIdx = 0
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]
    if (route.lines.length === 0) continue
    const rows: string[][] = []
    let routeTotal = 0

    for (const line of route.lines) {
      const lineCurrency = line.currencyCode || currencyCode
      routeTotal += line.amount
      rows.push([
        String(lineNum++),
        line.productName,
        line.containerSize || '-',
        lineCurrency,
        formatCurrency(line.amount),
      ])
    }

    grandTotal += routeTotal

    // Estimate table height
    const tableHeight = HEAD_HEIGHT + rows.length * ROW_HEIGHT

    const tableElement: SchemaElement = {
      name: `routeTable_${tableIdx}`,
      type: 'table',
      position: { x: original.position.x, y: currentY },
      width: (width as number) || original.width,
      height: tableHeight,
      head: ['#', route.routeLabel, 'Container', 'Currency', 'Amount'],
      showHead: showHead ?? true,
      repeatHead: repeatHead ?? false,
      ...(headWidthPercentages ? { headWidthPercentages } : {}),
      ...(headStyles ? { headStyles: JSON.parse(JSON.stringify(headStyles)) } : {}),
      ...(bodyStyles ? { bodyStyles: JSON.parse(JSON.stringify(bodyStyles)) } : {}),
      ...(tableStyles ? { tableStyles: JSON.parse(JSON.stringify(tableStyles)) } : {}),
      ...(columnStyles ? { columnStyles: JSON.parse(JSON.stringify(columnStyles)) } : {}),
    }

    replacementElements.push(tableElement)
    newInputs[`routeTable_${tableIdx}`] = JSON.stringify(rows)

    currentY += tableHeight + TABLE_GAP
    tableIdx++
  }

  // Calculate height delta for shifting elements below the original table
  const originalBottom = originalY + originalHeight
  const heightDelta = currentY - originalBottom

  // Shift elements that were below the original routesTable
  for (let j = 0; j < clonedPage0.length; j++) {
    if (j === tableIndex) continue
    const el = clonedPage0[j]
    if (el.position.y >= originalBottom) {
      el.position.y += heightDelta
    }
  }

  // Replace the routesTable with the new elements
  clonedPage0.splice(tableIndex, 1, ...replacementElements)

  return {
    template: { ...template, schemas: clonedSchemas },
    inputs: newInputs,
  }
}
