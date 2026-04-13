import { GoogleGenerativeAI } from '@google/generative-ai'
import type { z } from 'zod'
import type { DocumentType } from '../../../data/schema-types'
import type { ExtractionProvider, ExtractionProviderResult } from '../types'
import { zodSchemaToJsonDescription } from '../../../data/extraction-schemas'

export class GeminiExtractionProvider implements ExtractionProvider {
  readonly id = 'gemini'
  readonly name = 'Gemini Pro'
  private client: GoogleGenerativeAI | null = null

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) throw new Error('GEMINI_API_KEY not set')
      this.client = new GoogleGenerativeAI(apiKey)
    }
    return this.client
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GEMINI_API_KEY
  }

  async extract(
    ocrText: string,
    documentType: DocumentType,
    schema: z.ZodType
  ): Promise<ExtractionProviderResult> {
    const startTime = Date.now()
    try {
      const client = this.getClient()
      const schemaDescription = zodSchemaToJsonDescription(schema)

      const model = client.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          responseMimeType: 'application/json',
        },
      })

      const prompt = `You are a document data extraction assistant specializing in ${documentType.replace(/_/g, ' ')} documents.
Extract structured data from the provided text. Return a JSON object with the following structure:

${schemaDescription}

Rules:
- Extract all monetary values as numbers (e.g., 1234.56)
- Use ISO 8601 date format (YYYY-MM-DD) for all dates
- Currency should be 3-letter ISO code (PLN, EUR, USD, etc.)
- VAT rate should be the percentage number (e.g., 23 not "23%")
- If a field cannot be found, omit it from the response
- Extract all available line items/array entries

Document text:

${ocrText}`

      const result = await model.generateContent(prompt)
      const response = result.response
      const text = response.text()

      if (!text) {
        return {
          providerId: this.id,
          success: false,
          data: {},
          processingTimeMs: Date.now() - startTime,
          error: 'Empty response from Gemini',
        }
      }

      const data = JSON.parse(text)
      return {
        providerId: this.id,
        success: true,
        data,
        rawResponse: response,
        processingTimeMs: Date.now() - startTime,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
        },
      }
    } catch (error) {
      return {
        providerId: this.id,
        success: false,
        data: {},
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Gemini extraction failed',
      }
    }
  }
}
