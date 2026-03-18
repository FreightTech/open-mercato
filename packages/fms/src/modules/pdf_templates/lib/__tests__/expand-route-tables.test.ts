import { describe, it, expect } from 'vitest'
import { expandRouteTables } from '../expand-route-tables'
import { DEFAULT_OFFER_TEMPLATE } from '../default-pdfme-templates'
import type { PdfmeTemplateJson } from '../../data/entities'
import type { OfferData } from '../offer-variable-mapper'

function makeRoutes(count: number): OfferData['routes'] {
  return Array.from({ length: count }, (_, i) => ({
    id: `route-${i}`,
    routeLabel: `EXPORT  City${i} → City${i + 1}`,
    transportMode: 'sea',
    lines: [
      {
        lineNumber: 1,
        productName: 'Ocean Freight',
        currencyCode: 'EUR',
        containerSize: "40'HC",
        quantity: 1,
        unitPrice: 1800,
        amount: 1800,
      },
      {
        lineNumber: 2,
        productName: 'THC Origin',
        currencyCode: 'EUR',
        containerSize: "40'HC",
        quantity: 1,
        unitPrice: 350,
        amount: 350,
      },
    ],
  }))
}

function makeTemplate(): PdfmeTemplateJson {
  return JSON.parse(JSON.stringify(DEFAULT_OFFER_TEMPLATE))
}

describe('expandRouteTables', () => {
  it('should return unchanged when routes is empty', () => {
    const template = makeTemplate()
    const inputs = { routesTable: '[]', foo: 'bar' }
    const result = expandRouteTables(template, inputs, [], 'USD')
    expect(result.template).toEqual(template)
    expect(result.inputs).toEqual(inputs)
  })

  it('should return unchanged when routes is undefined', () => {
    const template = makeTemplate()
    const inputs = { routesTable: '[]' }
    const result = expandRouteTables(template, inputs, undefined, 'USD')
    expect(result.template).toEqual(template)
    expect(result.inputs).toEqual(inputs)
  })

  it('should produce 1 route table for a single route', () => {
    const template = makeTemplate()
    const routes = makeRoutes(1)
    const result = expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')

    const page0 = result.template.schemas[0]
    const routeTables = page0.filter(el => el.name.startsWith('routeTable_'))
    expect(routeTables).toHaveLength(1)

    expect(routeTables[0].name).toBe('routeTable_0')

    // Input keys should exist
    expect(result.inputs.routeTable_0).toBeDefined()

    // Original routesTable key should be removed
    expect(result.inputs.routesTable).toBeUndefined()
  })

  it('should produce 2 route tables for two routes', () => {
    const template = makeTemplate()
    const routes = makeRoutes(2)
    const result = expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')

    const page0 = result.template.schemas[0]
    const routeTables = page0.filter(el => el.name.startsWith('routeTable_'))
    expect(routeTables).toHaveLength(2)

    expect(routeTables[0].name).toBe('routeTable_0')
    expect(routeTables[1].name).toBe('routeTable_1')
  })

  it('should produce 3 route tables for three routes', () => {
    const template = makeTemplate()
    const routes = makeRoutes(3)
    const result = expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')

    const page0 = result.template.schemas[0]
    const routeTables = page0.filter(el => el.name.startsWith('routeTable_'))
    expect(routeTables).toHaveLength(3)
  })

  it('should position tables sequentially with gaps', () => {
    const template = makeTemplate()
    const routes = makeRoutes(2)
    const result = expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')

    const page0 = result.template.schemas[0]
    const table0 = page0.find(el => el.name === 'routeTable_0')!
    const table1 = page0.find(el => el.name === 'routeTable_1')!

    // table1 should start after table0 height + gap
    expect(table1.position.y).toBe(table0.position.y + table0.height + 4)
  })

  it('should embed route label in table head', () => {
    const template = makeTemplate()
    const routes = makeRoutes(1)
    routes![0].routeLabel = 'EXPORT  Warsaw → Shanghai'
    const result = expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')

    const page0 = result.template.schemas[0]
    const table0 = page0.find(el => el.name === 'routeTable_0')!
    const head = table0.head as string[]
    expect(head[1]).toBe('EXPORT  Warsaw → Shanghai')
  })

  it('should shift elements below the original routesTable', () => {
    const template = makeTemplate()
    const page0 = template.schemas[0]

    // Find footerLine — it's below the routesTable
    const footerBefore = page0.find(el => el.name === 'footerLine')!
    const footerYBefore = footerBefore.position.y

    const routes = makeRoutes(2)
    const result = expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')

    const resultPage0 = result.template.schemas[0]
    const footerAfter = resultPage0.find(el => el.name === 'footerLine')!

    // Footer should have shifted (could be up or down depending on content)
    // With 2 routes × 2 lines each, the tables will be shorter than the original 140mm height
    // so delta could be negative — just verify it changed
    expect(footerAfter.position.y).not.toBe(footerYBefore)
  })

  it('should not mutate the original template', () => {
    const template = makeTemplate()
    const originalJson = JSON.stringify(template)
    const routes = makeRoutes(2)
    expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')
    expect(JSON.stringify(template)).toBe(originalJson)
  })

  it('should preserve non-routesTable inputs', () => {
    const template = makeTemplate()
    const routes = makeRoutes(1)
    const inputs = { routesTable: '[]', clientName: 'ACME', offerNumber: 'OFF-001' }
    const result = expandRouteTables(template, inputs, routes, 'EUR')

    expect(result.inputs.clientName).toBe('ACME')
    expect(result.inputs.offerNumber).toBe('OFF-001')
  })

  it('should produce valid JSON for each route table input', () => {
    const template = makeTemplate()
    const routes = makeRoutes(2)
    const result = expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')

    const parsed0 = JSON.parse(result.inputs.routeTable_0)
    expect(Array.isArray(parsed0)).toBe(true)
    // 2 lines per route (no subtotal or total rows)
    expect(parsed0).toHaveLength(2)

    // No total table
    expect(result.inputs.routeTable_total).toBeUndefined()
  })

  it('should clone headStyles from original routesTable', () => {
    const template = makeTemplate()
    const routes = makeRoutes(1)
    const result = expandRouteTables(template, { routesTable: '[]' }, routes, 'EUR')

    const page0 = result.template.schemas[0]
    const table0 = page0.find(el => el.name === 'routeTable_0')!
    const headStyles = table0.headStyles as Record<string, unknown>

    expect(headStyles).toBeDefined()
    expect(headStyles.backgroundColor).toBe('#1a365d')
    expect(headStyles.fontColor).toBe('#ffffff')
  })

  it('should return unchanged when routesTable element is missing from template', () => {
    const template: PdfmeTemplateJson = {
      basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
      schemas: [[
        { name: 'someOtherElement', type: 'text', position: { x: 10, y: 10 }, width: 100, height: 10 },
      ]],
    }
    const routes = makeRoutes(1)
    const inputs = { foo: 'bar' }
    const result = expandRouteTables(template, inputs, routes, 'EUR')
    expect(result.template).toEqual(template)
    expect(result.inputs).toEqual(inputs)
  })
})
