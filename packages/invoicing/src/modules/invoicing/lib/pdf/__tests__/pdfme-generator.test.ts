import {
  extractSchemaDefaults,
  sanitizeInputs,
  mergeInputsWithDefaults,
  fixDoubleBraceSyntax,
} from '../pdfme-generator'

describe('extractSchemaDefaults', () => {
  it('extracts static content from schema elements', () => {
    const template = {
      basePdf: {},
      schemas: [
        [
          { name: 'title', type: 'text', content: 'Invoice Title' },
          { name: 'logo', type: 'image', content: 'data:image/png;base64,abc' },
          { name: 'dynamicField', type: 'text', content: '{customerName}' },
          { name: 'noContent', type: 'text' },
        ],
      ],
    }

    const defaults = extractSchemaDefaults(template)

    expect(defaults.title).toBe('Invoice Title')
    expect(defaults.logo).toBe('data:image/png;base64,abc')
    expect(defaults.dynamicField).toBeUndefined()
    expect(defaults.noContent).toBeUndefined()
  })

  it('handles multiple pages', () => {
    const template = {
      basePdf: {},
      schemas: [
        [{ name: 'page1Header', type: 'text', content: 'Page 1' }],
        [{ name: 'page2Header', type: 'text', content: 'Page 2' }],
      ],
    }

    const defaults = extractSchemaDefaults(template)

    expect(defaults.page1Header).toBe('Page 1')
    expect(defaults.page2Header).toBe('Page 2')
  })

  it('returns empty object for empty schemas', () => {
    const template = { basePdf: {}, schemas: [[]] }
    expect(extractSchemaDefaults(template)).toEqual({})
  })
})

describe('sanitizeInputs', () => {
  it('converts all values to strings', () => {
    const input = {
      stringVal: 'hello',
      numberVal: 42,
      boolVal: true,
      nullVal: null,
      undefinedVal: undefined,
      arrayVal: [1, 2, 3],
      objectVal: { key: 'value' },
    }

    const result = sanitizeInputs(input)

    expect(result.stringVal).toBe('hello')
    expect(result.numberVal).toBe('42')
    expect(result.boolVal).toBe('true')
    expect(result.nullVal).toBe('')
    expect(result.undefinedVal).toBe('')
    expect(result.arrayVal).toBe('1, 2, 3')
    expect(result.objectVal).toBe('{\n  "key": "value"\n}')
  })

  it('handles empty array', () => {
    const result = sanitizeInputs({ arr: [] })
    expect(result.arr).toBe('')
  })
})

describe('mergeInputsWithDefaults', () => {
  it('merges defaults with provided inputs', () => {
    const template = {
      basePdf: {},
      schemas: [
        [
          { name: 'staticLabel', type: 'text', content: 'Company Name' },
          { name: 'dynamic', type: 'text', content: '{value}' },
        ],
      ],
    }

    const inputs = [{ dynamic: 'Custom Value', extra: 'Extra Field' }]
    const result = mergeInputsWithDefaults(template, inputs)

    expect(result).toHaveLength(1)
    expect(result[0].staticLabel).toBe('Company Name')
    expect(result[0].dynamic).toBe('Custom Value')
    expect(result[0].extra).toBe('Extra Field')
  })

  it('provided inputs override defaults', () => {
    const template = {
      basePdf: {},
      schemas: [[{ name: 'field', type: 'text', content: 'Default' }]],
    }

    const inputs = [{ field: 'Override' }]
    const result = mergeInputsWithDefaults(template, inputs)

    expect(result[0].field).toBe('Override')
  })
})

describe('fixDoubleBraceSyntax', () => {
  it('converts {{variable}} to {variable}', () => {
    const template = {
      basePdf: {},
      schemas: [
        [
          { name: 'field', type: 'text', content: '{{customerName}}' },
          { name: 'multi', type: 'text', content: 'Hello {{name}}, your total is {{total}}' },
        ],
      ],
    }

    const fixed = fixDoubleBraceSyntax(template)

    expect(fixed.schemas[0][0].content).toBe('{customerName}')
    expect(fixed.schemas[0][1].content).toBe('Hello {name}, your total is {total}')
  })

  it('leaves single braces unchanged', () => {
    const template = {
      basePdf: {},
      schemas: [
        [{ name: 'field', type: 'text', content: '{alreadySingle}' }],
      ],
    }

    const fixed = fixDoubleBraceSyntax(template)
    expect(fixed.schemas[0][0].content).toBe('{alreadySingle}')
  })

  it('leaves elements without content unchanged', () => {
    const template = {
      basePdf: {},
      schemas: [
        [{ name: 'field', type: 'line' }],
      ],
    }

    const fixed = fixDoubleBraceSyntax(template)
    expect(fixed.schemas[0][0]).toEqual({ name: 'field', type: 'line' })
  })
})
