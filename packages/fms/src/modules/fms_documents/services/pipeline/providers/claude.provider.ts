import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'
import type { DocumentType } from '../../../data/schema-types'
import type { ExtractionProvider, ExtractionProviderResult } from '../types'
import { zodSchemaToJsonDescription } from '../../../data/extraction-schemas'

export class ClaudeExtractionProvider implements ExtractionProvider {
  readonly id = 'claude'
  readonly name = 'Claude Sonnet'
  private client: Anthropic | null = null

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
      this.client = new Anthropic({ apiKey })
    }
    return this.client
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY
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
Extract structured data from the provided text. Return ONLY a valid JSON object with the following structure:

${schemaDescription}

Rules:
- Extract all monetary values as numbers (e.g., 1234.56)
- Use ISO 8601 date format (YYYY-MM-DD) for all dates
- Currency should be 3-letter ISO code (PLN, EUR, USD, etc.)
- VAT rate should be the percentage number (e.g., 23 not "23%")
- If a field cannot be found, omit it from the response
- Extract all available line items/array entries
- Return ONLY valid JSON, no other text`

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Extract data from this ${documentType.replace(/_/g, ' ')}:\n\n${ocrText}`,
          },
        ],
      })

      const textBlock = response.content.find((block) => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        return {
          providerId: this.id,
          success: false,
          data: {},
          processingTimeMs: Date.now() - startTime,
          error: 'Empty response from Claude',
        }
      }

      // Extract JSON from response - Claude may wrap it in markdown code blocks
      let jsonText = textBlock.text.trim()
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim()
      }

      const data = JSON.parse(jsonText)
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
        error: error instanceof Error ? error.message : 'Claude extraction failed',
      }
    }
  }
}
