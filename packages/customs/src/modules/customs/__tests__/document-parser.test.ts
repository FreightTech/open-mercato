jest.mock('@google/generative-ai', () => {
  const generateContentMock = jest.fn()
  const getGenerativeModelMock = jest.fn(() => ({
    generateContent: generateContentMock,
  }))
  return {
    GoogleGenerativeAI: jest.fn(() => ({
      getGenerativeModel: getGenerativeModelMock,
    })),
    __mocks: { generateContentMock, getGenerativeModelMock },
  }
})

import { DocumentParserService } from '../services/document-parser.service'
import type { NormalizedDocument } from '../data/entities'

const { __mocks } = jest.requireMock('@google/generative-ai') as {
  __mocks: {
    generateContentMock: jest.Mock
    getGenerativeModelMock: jest.Mock
  }
}

describe('DocumentParserService', () => {
  let parser: DocumentParserService
  const originalEnv = process.env.GOOGLE_GENERATIVE_AI_API_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-api-key'
    parser = new DocumentParserService()
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalEnv
    } else {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    }
  })

  describe('parseDocument', () => {
    it('returns extracted data on successful parse', async () => {
      const expected: NormalizedDocument = {
        documentNumber: 'BL-001',
        shipperName: 'ACME CORP',
        totalGrossWeightKg: 5000,
        productLines: [
          { lineNumber: 1, description: 'Widget', quantity: 10, unit: 'PCS' },
        ],
      }

      __mocks.generateContentMock.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expected),
        },
      })

      const result = await parser.parseDocument('base64pdf', 'bill_of_lading')
      expect(result.extracted).toEqual(expected)
      expect(result.parseError).toBeNull()
    })

    it('passes PDF as inline data with correct MIME type', async () => {
      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => '{}' },
      })

      await parser.parseDocument('dGVzdA==', 'commercial_invoice')

      expect(__mocks.generateContentMock).toHaveBeenCalledWith([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: 'dGVzdA==',
          },
        },
        { text: expect.stringContaining('Commercial Invoice') },
      ])
    })

    it('uses correct prompt for bill_of_lading', async () => {
      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => '{}' },
      })

      await parser.parseDocument('base64', 'bill_of_lading')

      const callArgs = __mocks.generateContentMock.mock.calls[0][0]
      expect(callArgs[1].text).toContain('Bill of Lading')
    })

    it('uses correct prompt for commercial_invoice', async () => {
      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => '{}' },
      })

      await parser.parseDocument('base64', 'commercial_invoice')

      const callArgs = __mocks.generateContentMock.mock.calls[0][0]
      expect(callArgs[1].text).toContain('Commercial Invoice')
    })

    it('uses correct prompt for packing_list', async () => {
      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => '{}' },
      })

      await parser.parseDocument('base64', 'packing_list')

      const callArgs = __mocks.generateContentMock.mock.calls[0][0]
      expect(callArgs[1].text).toContain('Packing List')
    })

    it('returns parseError when Gemini API throws', async () => {
      __mocks.generateContentMock.mockRejectedValue(new Error('API rate limit exceeded'))

      const result = await parser.parseDocument('base64', 'bill_of_lading')
      expect(result.extracted).toBeNull()
      expect(result.parseError).toBe('API rate limit exceeded')
    })

    it('returns parseError when response is not valid JSON', async () => {
      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => 'not json at all' },
      })

      const result = await parser.parseDocument('base64', 'bill_of_lading')
      expect(result.extracted).toBeNull()
      expect(result.parseError).toBeDefined()
      expect(result.parseError).not.toBeNull()
    })

    it('returns parseError when non-Error is thrown', async () => {
      __mocks.generateContentMock.mockRejectedValue('string error')

      const result = await parser.parseDocument('base64', 'bill_of_lading')
      expect(result.extracted).toBeNull()
      expect(result.parseError).toBe('string error')
    })

    it('configures model with correct parameters', async () => {
      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => '{}' },
      })

      await parser.parseDocument('base64', 'bill_of_lading')

      expect(__mocks.getGenerativeModelMock).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-lite-preview',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 8192,
        },
        systemInstruction: expect.stringContaining('customs clearance specialist'),
      })
    })
  })

  describe('source quotes', () => {
    it('preserves _sourceQuotes in extracted output', async () => {
      const responseData = {
        documentNumber: 'BL-999',
        shipperName: 'Test Shipper',
        totalGrossWeightKg: 1200,
        productLines: [
          { lineNumber: 1, description: 'Test item', quantity: 5, unit: 'PCS' },
        ],
        _sourceQuotes: {
          documentNumber: { quote: 'BL-999', page: 1 },
          shipperName: { quote: 'Test Shipper Co., Ltd', page: 1 },
          totalGrossWeightKg: { quote: '1,200.00 KGS', page: 2 },
        },
      }

      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => JSON.stringify(responseData) },
      })

      const result = await parser.parseDocument('base64', 'bill_of_lading')
      expect(result.extracted).toBeDefined()
      expect(result.extracted!._sourceQuotes).toBeDefined()

      const quotes = result.extracted!._sourceQuotes as Record<string, { quote: string; page: number }>
      expect(quotes.documentNumber).toEqual({ quote: 'BL-999', page: 1 })
      expect(quotes.shipperName).toEqual({ quote: 'Test Shipper Co., Ltd', page: 1 })
      expect(quotes.totalGrossWeightKg).toEqual({ quote: '1,200.00 KGS', page: 2 })
    })

    it('works without _sourceQuotes for backward compatibility', async () => {
      const responseData = {
        documentNumber: 'INV-001',
        shipperName: 'Old Shipper',
        totalGrossWeightKg: 500,
        productLines: [],
      }

      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => JSON.stringify(responseData) },
      })

      const result = await parser.parseDocument('base64', 'commercial_invoice')
      expect(result.extracted).toBeDefined()
      expect(result.extracted!.documentNumber).toBe('INV-001')
      expect(result.extracted!._sourceQuotes).toBeUndefined()
    })

    it('includes _sourceQuotes schema in all prompt types', async () => {
      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => '{}' },
      })

      for (const docType of ['bill_of_lading', 'commercial_invoice', 'packing_list'] as const) {
        __mocks.generateContentMock.mockClear()
        await parser.parseDocument('base64', docType)
        const callArgs = __mocks.generateContentMock.mock.calls[0][0]
        expect(callArgs[1].text).toContain('_sourceQuotes')
      }
    })

    it('includes source verification instructions in system instruction', async () => {
      __mocks.generateContentMock.mockResolvedValue({
        response: { text: () => '{}' },
      })

      await parser.parseDocument('base64', 'bill_of_lading')

      expect(__mocks.getGenerativeModelMock).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction: expect.stringContaining('_sourceQuotes'),
        }),
      )
    })
  })

  describe('API key validation', () => {
    it('throws when GOOGLE_GENERATIVE_AI_API_KEY is not set', async () => {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
      const parserWithoutKey = new DocumentParserService()

      const result = await parserWithoutKey.parseDocument('base64', 'bill_of_lading')
      expect(result.extracted).toBeNull()
      expect(result.parseError).toContain('GOOGLE_GENERATIVE_AI_API_KEY')
    })
  })
})
