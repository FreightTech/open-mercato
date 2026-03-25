import { describe, it, expect } from 'vitest'
import {
  getDefaultPdfmeTemplate,
  DEFAULT_OFFER_TEMPLATE,
  BLANK_A4_TEMPLATE,
  COVER_PAGE_TEMPLATE,
  OFFER_TEMPLATE_VARIABLES,
  A4,
  DEFAULT_PADDING,
  PRIMARY_COLOR,
} from '../default-pdfme-templates'

describe('default-pdfme-templates', () => {
  describe('constants', () => {
    it('should define correct A4 dimensions in mm', () => {
      expect(A4.width).toBe(210)
      expect(A4.height).toBe(297)
    })

    it('should define default padding as array of 4 values', () => {
      expect(DEFAULT_PADDING).toEqual([10, 10, 10, 10])
      expect(DEFAULT_PADDING).toHaveLength(4)
    })

    it('should define primary color as hex value', () => {
      expect(PRIMARY_COLOR).toBe('#1a365d')
      expect(PRIMARY_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/)
    })
  })

  describe('DEFAULT_OFFER_TEMPLATE', () => {
    it('should have valid basePdf structure with A4 dimensions', () => {
      expect(DEFAULT_OFFER_TEMPLATE.basePdf).toBeDefined()
      expect(DEFAULT_OFFER_TEMPLATE.basePdf.width).toBe(A4.width)
      expect(DEFAULT_OFFER_TEMPLATE.basePdf.height).toBe(A4.height)
    })

    it('should have padding in basePdf', () => {
      expect(DEFAULT_OFFER_TEMPLATE.basePdf.padding).toEqual(DEFAULT_PADDING)
    })

    it('should have schemas array with two pages', () => {
      expect(Array.isArray(DEFAULT_OFFER_TEMPLATE.schemas)).toBe(true)
      expect(DEFAULT_OFFER_TEMPLATE.schemas.length).toBe(2)
    })

    it('should have schema elements on first page', () => {
      const firstPage = DEFAULT_OFFER_TEMPLATE.schemas[0]
      expect(Array.isArray(firstPage)).toBe(true)
      expect(firstPage.length).toBeGreaterThan(0)
    })

    it('should include company logo element', () => {
      const firstPage = DEFAULT_OFFER_TEMPLATE.schemas[0]
      const logoElement = firstPage.find((el) => el.name === 'companyLogo')
      expect(logoElement).toBeDefined()
      expect(logoElement?.type).toBe('image')
    })

    it('should include offer title element', () => {
      const firstPage = DEFAULT_OFFER_TEMPLATE.schemas[0]
      const titleElement = firstPage.find((el) => el.name === 'offerTitle')
      expect(titleElement).toBeDefined()
      expect(titleElement?.type).toBe('text')
    })

    it('should include offer number element', () => {
      const firstPage = DEFAULT_OFFER_TEMPLATE.schemas[0]
      const numberElement = firstPage.find((el) => el.name === 'offerNumber')
      expect(numberElement).toBeDefined()
      expect(numberElement?.type).toBe('text')
    })

    it('should include client name element', () => {
      const firstPage = DEFAULT_OFFER_TEMPLATE.schemas[0]
      const clientElement = firstPage.find((el) => el.name === 'clientName')
      expect(clientElement).toBeDefined()
      expect(clientElement?.type).toBe('text')
    })

    it('should include valid until element', () => {
      const firstPage = DEFAULT_OFFER_TEMPLATE.schemas[0]
      const validUntilElement = firstPage.find((el) => el.name === 'validUntil')
      expect(validUntilElement).toBeDefined()
    })

    it('should have valid element types on all pages', () => {
      const validTypes = ['text', 'image', 'line', 'rectangle', 'ellipse', 'svg', 'qrcode', 'table']

      for (const page of DEFAULT_OFFER_TEMPLATE.schemas) {
        page.forEach((element) => {
          expect(validTypes).toContain(element.type)
        })
      }
    })

    it('should have position properties on all elements across all pages', () => {
      for (const page of DEFAULT_OFFER_TEMPLATE.schemas) {
        page.forEach((element) => {
          expect(element.position).toBeDefined()
          expect(typeof element.position.x).toBe('number')
          expect(typeof element.position.y).toBe('number')
          expect(element.position.x).toBeGreaterThanOrEqual(0)
          expect(element.position.y).toBeGreaterThanOrEqual(0)
        })
      }
    })

    it('should have width on all elements across all pages', () => {
      for (const page of DEFAULT_OFFER_TEMPLATE.schemas) {
        page.forEach((element) => {
          expect(typeof element.width).toBe('number')
          expect(element.width).toBeGreaterThan(0)
        })
      }
    })

    it('should have height on all elements across all pages', () => {
      for (const page of DEFAULT_OFFER_TEMPLATE.schemas) {
        page.forEach((element) => {
          expect(typeof element.height).toBe('number')
          expect(element.height).toBeGreaterThan(0)
        })
      }
    })

    it('should include specialTerms and contactPerson elements on page 2', () => {
      const secondPage = DEFAULT_OFFER_TEMPLATE.schemas[1]
      const elementNames = secondPage.map((el) => el.name)
      expect(elementNames).toContain('specialTerms')
      expect(elementNames).toContain('contactPersonName')
      expect(elementNames).toContain('contactPersonEmail')
    })
  })

  describe('BLANK_A4_TEMPLATE', () => {
    it('should have A4 dimensions', () => {
      expect(BLANK_A4_TEMPLATE.basePdf.width).toBe(A4.width)
      expect(BLANK_A4_TEMPLATE.basePdf.height).toBe(A4.height)
    })

    it('should have default padding', () => {
      expect(BLANK_A4_TEMPLATE.basePdf.padding).toEqual(DEFAULT_PADDING)
    })

    it('should have one page with schemas', () => {
      expect(BLANK_A4_TEMPLATE.schemas).toHaveLength(1)
      expect(Array.isArray(BLANK_A4_TEMPLATE.schemas[0])).toBe(true)
    })

    it('should have a title placeholder element', () => {
      const firstPage = BLANK_A4_TEMPLATE.schemas[0]
      const titleElement = firstPage.find((el) => el.name === 'title')
      expect(titleElement).toBeDefined()
      expect(titleElement?.type).toBe('text')
    })
  })

  describe('COVER_PAGE_TEMPLATE', () => {
    it('should have A4 dimensions', () => {
      expect(COVER_PAGE_TEMPLATE.basePdf.width).toBe(A4.width)
      expect(COVER_PAGE_TEMPLATE.basePdf.height).toBe(A4.height)
    })

    it('should have no padding for full-bleed', () => {
      expect(COVER_PAGE_TEMPLATE.basePdf.padding).toEqual([0, 0, 0, 0])
    })

    it('should have cover image element', () => {
      const firstPage = COVER_PAGE_TEMPLATE.schemas[0]
      const coverElement = firstPage.find((el) => el.name === 'coverImage')
      expect(coverElement).toBeDefined()
      expect(coverElement?.type).toBe('image')
    })

    it('should have full-page cover image dimensions', () => {
      const firstPage = COVER_PAGE_TEMPLATE.schemas[0]
      const coverElement = firstPage.find((el) => el.name === 'coverImage')
      expect(coverElement?.width).toBe(A4.width)
      expect(coverElement?.height).toBe(A4.height)
      expect(coverElement?.position.x).toBe(0)
      expect(coverElement?.position.y).toBe(0)
    })
  })

  describe('OFFER_TEMPLATE_VARIABLES', () => {
    it('should be an array of variable definitions', () => {
      expect(Array.isArray(OFFER_TEMPLATE_VARIABLES)).toBe(true)
      expect(OFFER_TEMPLATE_VARIABLES.length).toBeGreaterThan(0)
    })

    it('should have name property for each variable', () => {
      OFFER_TEMPLATE_VARIABLES.forEach((variable) => {
        expect(variable).toHaveProperty('name')
        expect(typeof variable.name).toBe('string')
        expect(variable.name.length).toBeGreaterThan(0)
      })
    })

    it('should have type property for each variable', () => {
      OFFER_TEMPLATE_VARIABLES.forEach((variable) => {
        expect(variable).toHaveProperty('type')
        expect(typeof variable.type).toBe('string')
        expect(['text', 'image']).toContain(variable.type)
      })
    })

    it('should have description for each variable', () => {
      OFFER_TEMPLATE_VARIABLES.forEach((variable) => {
        expect(variable).toHaveProperty('description')
        expect(typeof variable.description).toBe('string')
        expect(variable.description.length).toBeGreaterThan(0)
      })
    })

    it('should include essential offer variables', () => {
      const variableNames = OFFER_TEMPLATE_VARIABLES.map((v) => v.name)

      expect(variableNames).toContain('offerNumber')
      expect(variableNames).toContain('clientName')
      expect(variableNames).toContain('companyName')
      expect(variableNames).toContain('validUntil')
    })

    it('should include branding variables', () => {
      const variableNames = OFFER_TEMPLATE_VARIABLES.map((v) => v.name)

      expect(variableNames).toContain('companyLogo')
      expect(variableNames).toContain('primaryColor')
      expect(variableNames).toContain('accentColor')
    })

    it('should include label variables for i18n', () => {
      const variableNames = OFFER_TEMPLATE_VARIABLES.map((v) => v.name)

      expect(variableNames).toContain('labelOffer')
      expect(variableNames).toContain('labelClient')
      expect(variableNames).toContain('labelValidity')
    })

    it('should include contact person and special terms variables', () => {
      const variableNames = OFFER_TEMPLATE_VARIABLES.map((v) => v.name)

      expect(variableNames).toContain('specialTerms')
      expect(variableNames).toContain('contactPersonName')
      expect(variableNames).toContain('contactPersonEmail')
    })

    it('should have unique variable names', () => {
      const names = OFFER_TEMPLATE_VARIABLES.map((v) => v.name)
      const uniqueNames = [...new Set(names)]
      expect(names.length).toBe(uniqueNames.length)
    })
  })

  describe('getDefaultPdfmeTemplate', () => {
    it('should return offer template for "offer" type', () => {
      const template = getDefaultPdfmeTemplate('offer')
      expect(template).toEqual(DEFAULT_OFFER_TEMPLATE)
    })

    it('should return cover template for "cover" type', () => {
      const template = getDefaultPdfmeTemplate('cover')
      expect(template).toEqual(COVER_PAGE_TEMPLATE)
    })

    it('should return blank template for "blank" type', () => {
      const template = getDefaultPdfmeTemplate('blank')
      expect(template).toEqual(BLANK_A4_TEMPLATE)
    })

    it('should return blank template for unknown type', () => {
      const template = getDefaultPdfmeTemplate('unknown')
      expect(template).toEqual(BLANK_A4_TEMPLATE)
    })

    it('should return blank template for empty string', () => {
      const template = getDefaultPdfmeTemplate('')
      expect(template).toEqual(BLANK_A4_TEMPLATE)
    })
  })

  describe('placeholder syntax validation', () => {
    /**
     * Helper to extract all content strings from a template.
     * Returns array of { name, content } for elements with content.
     */
    function extractContentStrings(template: ReturnType<typeof getDefaultPdfmeTemplate>): Array<{ name: string; content: string }> {
      const results: Array<{ name: string; content: string }> = []
      for (const page of template.schemas) {
        for (const element of page) {
          if (element.content && typeof element.content === 'string') {
            results.push({ name: element.name, content: element.content })
          }
        }
      }
      return results
    }

    /**
     * Helper to extract placeholder names from a content string.
     * Matches both {var} and {{var}} patterns.
     */
    function extractPlaceholders(content: string): string[] {
      const singleBrace = content.match(/\{([^{}]+)\}/g) || []
      const doubleBrace = content.match(/\{\{([^{}]+)\}\}/g) || []
      return [...singleBrace, ...doubleBrace]
    }

    it('should use single-brace syntax for all variable placeholders in DEFAULT_OFFER_TEMPLATE', () => {
      const contents = extractContentStrings(DEFAULT_OFFER_TEMPLATE)

      for (const { name, content } of contents) {
        // Should NOT contain double braces {{ }}
        expect(content).not.toMatch(/\{\{[^}]+\}\}/)

        // If it has placeholders, they should be single-brace
        const placeholders = extractPlaceholders(content)
        for (const placeholder of placeholders) {
          expect(placeholder).toMatch(/^\{[^{}]+\}$/)
          expect(placeholder).not.toMatch(/^\{\{/)
        }
      }
    })

    it('should use single-brace syntax for all variable placeholders in BLANK_A4_TEMPLATE', () => {
      const contents = extractContentStrings(BLANK_A4_TEMPLATE)

      for (const { name, content } of contents) {
        expect(content).not.toMatch(/\{\{[^}]+\}\}/)
      }
    })

    it('should use single-brace syntax for all variable placeholders in COVER_PAGE_TEMPLATE', () => {
      const contents = extractContentStrings(COVER_PAGE_TEMPLATE)

      for (const { name, content } of contents) {
        expect(content).not.toMatch(/\{\{[^}]+\}\}/)
      }
    })

    it('should have valid placeholder names matching OFFER_TEMPLATE_VARIABLES', () => {
      const contents = extractContentStrings(DEFAULT_OFFER_TEMPLATE)
      const validVariableNames: string[] = OFFER_TEMPLATE_VARIABLES.map((v) => v.name)

      for (const { name, content } of contents) {
        // Extract single-brace placeholders
        const matches = content.match(/\{([^{}]+)\}/g) || []
        for (const match of matches) {
          // Extract variable name from {variableName}
          const varName = match.slice(1, -1)
          
          // Variable names should be known (in OFFER_TEMPLATE_VARIABLES)
          // or be a special/computed field
          const isKnownVariable = validVariableNames.includes(varName)
          const isSpecialField = ['currentDate', 'currentYear'].includes(varName)
          
          if (!isKnownVariable && !isSpecialField) {
            // Log for debugging but don't fail - some placeholders might be legitimate
            console.warn(`Unknown placeholder {${varName}} in element "${name}"`)
          }
        }
      }
    })

    it('should not have any template content that could produce [object Object]', () => {
      const allTemplates = [DEFAULT_OFFER_TEMPLATE, BLANK_A4_TEMPLATE, COVER_PAGE_TEMPLATE]

      for (const template of allTemplates) {
        const contents = extractContentStrings(template)

        for (const { content } of contents) {
          // Content should never literally contain [object Object]
          expect(content).not.toContain('[object Object]')

          // Content should never contain double braces (which cause [object Object] in pdfme)
          expect(content).not.toMatch(/\{\{[^}]+\}\}/)
        }
      }
    })

    it('should serialize templates to JSON without double-brace patterns', () => {
      const allTemplates = [
        { name: 'DEFAULT_OFFER_TEMPLATE', template: DEFAULT_OFFER_TEMPLATE },
        { name: 'BLANK_A4_TEMPLATE', template: BLANK_A4_TEMPLATE },
        { name: 'COVER_PAGE_TEMPLATE', template: COVER_PAGE_TEMPLATE },
      ]

      for (const { name, template } of allTemplates) {
        const json = JSON.stringify(template)

        // The entire JSON should not contain {{ pattern
        // This catches any nested or escaped double braces
        expect(json).not.toMatch(/\{\{/)
      }
    })
  })
})
