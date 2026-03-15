import { describe, it, expect } from 'vitest'
import {
  extractSchemaDefaults,
  fixDoubleBraceSyntax,
  sanitizeInputs,
  mergeInputsWithDefaults,
  normalizeTemplateForSave,
} from '../pdfme-generator'
import type { PdfmeTemplateJson } from '../../data/entities'

describe('pdfme-generator', () => {
  describe('extractSchemaDefaults', () => {
    it('should extract static content from template schemas', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'staticField',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Static Value',
            },
          ],
        ],
      }

      const defaults = extractSchemaDefaults(template)

      expect(defaults).toEqual({ staticField: 'Static Value' })
    })

    it('should NOT extract variable placeholders with single braces', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'variableField',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: '{offerNumber}',
            },
          ],
        ],
      }

      const defaults = extractSchemaDefaults(template)

      expect(defaults).toEqual({})
    })

    it('should NOT extract variable placeholders with text around them', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'mixedField',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Offer: {offerNumber}',
            },
          ],
        ],
      }

      const defaults = extractSchemaDefaults(template)

      expect(defaults).toEqual({})
    })

    it('should handle empty content', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'emptyField',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: '',
            },
          ],
        ],
      }

      const defaults = extractSchemaDefaults(template)

      expect(defaults).toEqual({})
    })

    it('should handle elements without content property', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'noContentField',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
            },
          ],
        ],
      }

      const defaults = extractSchemaDefaults(template)

      expect(defaults).toEqual({})
    })

    it('should extract from multiple pages', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'page1Field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Page 1 Value',
            },
          ],
          [
            {
              name: 'page2Field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Page 2 Value',
            },
          ],
        ],
      }

      const defaults = extractSchemaDefaults(template)

      expect(defaults).toEqual({
        page1Field: 'Page 1 Value',
        page2Field: 'Page 2 Value',
      })
    })
  })

  describe('fixDoubleBraceSyntax', () => {
    it('should convert {{variable}} to {variable}', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: '{{offerNumber}}',
            },
          ],
        ],
      }

      const fixed = fixDoubleBraceSyntax(template)

      expect(fixed.schemas[0][0].content).toBe('{offerNumber}')
    })

    it('should leave single braces {variable} unchanged', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: '{offerNumber}',
            },
          ],
        ],
      }

      const fixed = fixDoubleBraceSyntax(template)

      expect(fixed.schemas[0][0].content).toBe('{offerNumber}')
    })

    it('should handle multiple placeholders in one content string', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Offer: {{offerNumber}} - Client: {{clientName}}',
            },
          ],
        ],
      }

      const fixed = fixDoubleBraceSyntax(template)

      expect(fixed.schemas[0][0].content).toBe('Offer: {offerNumber} - Client: {clientName}')
    })

    it('should handle templates with no placeholders', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Static text with no variables',
            },
          ],
        ],
      }

      const fixed = fixDoubleBraceSyntax(template)

      expect(fixed.schemas[0][0].content).toBe('Static text with no variables')
    })

    it('should handle mixed static and variable content', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'This is custom pdf template for offer: {{offerNumber}}',
            },
          ],
        ],
      }

      const fixed = fixDoubleBraceSyntax(template)

      expect(fixed.schemas[0][0].content).toBe('This is custom pdf template for offer: {offerNumber}')
    })

    it('should handle elements without content', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'field',
              type: 'image',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
            },
          ],
        ],
      }

      const fixed = fixDoubleBraceSyntax(template)

      expect(fixed.schemas[0][0].content).toBeUndefined()
    })

    it('should not modify original template (immutability)', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: '{{offerNumber}}',
            },
          ],
        ],
      }

      fixDoubleBraceSyntax(template)

      expect(template.schemas[0][0].content).toBe('{{offerNumber}}')
    })
  })

  describe('sanitizeInputs', () => {
    it('should pass through strings unchanged', () => {
      const input = { name: 'Test Value', number: 'OFF-001' }

      const result = sanitizeInputs(input)

      expect(result).toEqual({ name: 'Test Value', number: 'OFF-001' })
    })

    it('should convert numbers to strings', () => {
      const input = { count: 42, price: 19.99 }

      const result = sanitizeInputs(input)

      expect(result).toEqual({ count: '42', price: '19.99' })
    })

    it('should convert booleans to strings', () => {
      const input = { active: true, disabled: false }

      const result = sanitizeInputs(input)

      expect(result).toEqual({ active: 'true', disabled: 'false' })
    })

    it('should convert null and undefined to empty strings', () => {
      const input = { nullVal: null, undefinedVal: undefined }

      const result = sanitizeInputs(input)

      expect(result).toEqual({ nullVal: '', undefinedVal: '' })
    })

    it('should convert objects to JSON strings (not [object Object])', () => {
      const input = { data: { nested: 'value', count: 5 } }

      const result = sanitizeInputs(input)

      expect(result.data).not.toBe('[object Object]')
      expect(result.data).toContain('nested')
      expect(result.data).toContain('value')
    })

    it('should convert simple arrays to comma-separated strings', () => {
      const input = { items: ['apple', 'banana', 'orange'] }

      const result = sanitizeInputs(input)

      expect(result.items).toBe('apple, banana, orange')
    })

    it('should convert numeric arrays to comma-separated strings', () => {
      const input = { numbers: [1, 2, 3] }

      const result = sanitizeInputs(input)

      expect(result.numbers).toBe('1, 2, 3')
    })

    it('should convert complex arrays to JSON', () => {
      const input = { routes: [{ from: 'A', to: 'B' }] }

      const result = sanitizeInputs(input)

      expect(result.routes).not.toBe('[object Object]')
      expect(result.routes).toContain('from')
      expect(result.routes).toContain('to')
    })

    it('should handle empty arrays', () => {
      const input = { empty: [] }

      const result = sanitizeInputs(input)

      expect(result.empty).toBe('')
    })
  })

  describe('mergeInputsWithDefaults', () => {
    it('should merge schema defaults with provided inputs', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'staticField',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Default Value',
            },
          ],
        ],
      }

      const inputs = [{ dynamicField: 'User Value' }]

      const result = mergeInputsWithDefaults(template, inputs)

      expect(result[0]).toEqual({
        staticField: 'Default Value',
        dynamicField: 'User Value',
      })
    })

    it('should allow inputs to override defaults', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Default',
            },
          ],
        ],
      }

      const inputs = [{ field: 'Override' }]

      const result = mergeInputsWithDefaults(template, inputs)

      expect(result[0].field).toBe('Override')
    })

    it('should sanitize all merged values', () => {
      const template: PdfmeTemplateJson = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
        schemas: [[{ name: 'f', type: 'text', position: { x: 0, y: 0 }, width: 10, height: 10 }]],
      }

      const inputs = [{ objectField: { should: 'be sanitized' } }]

      const result = mergeInputsWithDefaults(template, inputs)

      expect(typeof result[0].objectField).toBe('string')
      expect(result[0].objectField).not.toBe('[object Object]')
    })
  })

  describe('normalizeTemplateForSave', () => {
    it('should mark elements with content as readOnly', () => {
      const template = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] as [number, number, number, number] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Some content',
              readOnly: undefined as boolean | undefined,
            },
          ],
        ],
      }

      const normalized = normalizeTemplateForSave(template)

      expect(normalized.schemas[0][0].readOnly).toBe(true)
    })

    it('should preserve existing readOnly elements', () => {
      const template = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] as [number, number, number, number] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Content',
              readOnly: true,
            },
          ],
        ],
      }

      const normalized = normalizeTemplateForSave(template)

      expect(normalized.schemas[0][0].readOnly).toBe(true)
    })

    it('should not mark elements without content as readOnly', () => {
      const template = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] as [number, number, number, number] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              readOnly: undefined as boolean | undefined,
            },
          ],
        ],
      }

      const normalized = normalizeTemplateForSave(template)

      expect(normalized.schemas[0][0].readOnly).toBeUndefined()
    })

    it('should not modify original template (immutability)', () => {
      const template = {
        basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] as [number, number, number, number] },
        schemas: [
          [
            {
              name: 'field',
              type: 'text',
              position: { x: 10, y: 10 },
              width: 100,
              height: 20,
              content: 'Content',
              readOnly: undefined as boolean | undefined,
            },
          ],
        ],
      }

      normalizeTemplateForSave(template)

      expect(template.schemas[0][0].readOnly).toBeUndefined()
    })
  })
})
