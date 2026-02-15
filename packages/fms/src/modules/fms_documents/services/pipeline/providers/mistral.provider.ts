import { Mistral } from '@mistralai/mistralai'
import type { z } from 'zod'
import type { DocumentType } from '../../../data/schema-types'
import type { ExtractionProvider, ExtractionProviderResult } from '../types'
import { zodSchemaToJsonDescription } from '../../../data/extraction-schemas'

export class MistralExtractionProvider implements ExtractionProvider {
  readonly id = 'mistral'
  readonly name = 'Mistral Large'
  private client: Mistral | null = null

  private getClient(): Mistral {
    if (!this.client) {
      const apiKey = process.env.MISTRAL_API_KEY
      if (!apiKey) throw new Error('MISTRAL_API_KEY not set')
      this.client = new Mistral({ apiKey })
    }
    return this.client
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.MISTRAL_API_KEY
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

      const systemPrompt = `You are a document data extraction assistant specializing in ${documentType.replace(/_/g, ' ')} documents.
Extract structured data from the provided text. Return a JSON object with the following structure:

${schemaDescription}

Rules:
- Extract all monetary values as numbers (e.g., 1234.56)
- Use ISO 8601 date format (YYYY-MM-DD) for all dates
- Currency should be 3-letter ISO code (PLN, EUR, USD, etc.)
- VAT rate should be the percentage number (e.g., 23 not "23%")
- If a field cannot be found, omit it from the response
- Extract all available line items/array entries`

      const response = await client.chat.complete({
        model: 'mistral-large-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract data from this ${documentType.replace(/_/g, ' ')}:\n\n${ocrText}` },
        ],
        responseFormat: { type: 'json_object' },
      })

      const content = response.choices?.[0]?.message?.content
      if (!content || typeof content !== 'string') {
        return {
          providerId: this.id,
          success: false,
          data: {},
          processingTimeMs: Date.now() - startTime,
          error: 'Empty response from Mistral',
        }
      }

      const data = JSON.parse(content)
      return {
        providerId: this.id,
        success: true,
        data,
        rawResponse: response,
        processingTimeMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        providerId: this.id,
        success: false,
        data: {},
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Mistral extraction failed',
      }
    }
  }
}
