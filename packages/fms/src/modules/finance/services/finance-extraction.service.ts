import { financeExtractionConfig, type FinanceExtractionConfig } from '../lib/config'
import {
  extractionResponseSchema,
  normalizeResponseSchema,
  validationResponseSchema,
  visualizeResponseSchema,
} from '../data/validators'
import type {
  ExtractionResponse,
  ExtractionStrategies,
  InvoiceData,
  NormalizationConfig,
  NormalizeResponse,
  ExtractionResult,
  ValidationRules,
  ValidationResponse,
  ValidationResult,
  VisualizeOptions,
  VisualizeResponse,
  FinanceApiError,
} from '../data/types'

/**
 * Error thrown when the Finance Extraction API returns an error
 */
export class FinanceExtractionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'FinanceExtractionError'
  }
}

/**
 * Error thrown when the API request times out
 */
export class FinanceExtractionTimeoutError extends Error {
  constructor(message: string = 'Finance Extraction API request timed out') {
    super(message)
    this.name = 'FinanceExtractionTimeoutError'
  }
}

/**
 * Error thrown when response validation fails
 */
export class FinanceExtractionValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: unknown
  ) {
    super(message)
    this.name = 'FinanceExtractionValidationError'
  }
}

/**
 * Service for interacting with the Finance Extraction API
 */
export class FinanceExtractionService {
  private config: FinanceExtractionConfig

  constructor(config: FinanceExtractionConfig = financeExtractionConfig) {
    this.config = config
  }

  /**
   * Extract invoice data from a PDF file
   */
  async extractInvoice(
    fileUrl: string,
    options?: {
      strategies?: Partial<ExtractionStrategies>
      parallel?: boolean
      pageNum?: number
    },
    authToken?: string
  ): Promise<ExtractionResponse> {
    const body = {
      file_url: fileUrl,
      strategies: {
        ...this.config.defaultStrategies,
        ...options?.strategies,
      },
      parallel: options?.parallel ?? true,
      page_num: options?.pageNum ?? 0,
    }

    const response = await this.makeRequest<ExtractionResponse>(
      this.config.endpoints.extract,
      body,
      authToken
    )

    const parseResult = extractionResponseSchema.safeParse(response)
    if (!parseResult.success) {
      throw new FinanceExtractionValidationError(
        'Invalid response from extraction API',
        parseResult.error.format()
      )
    }

    return parseResult.data
  }

  /**
   * Normalize extracted invoice data (Polish invoice formats)
   */
  async normalizeInvoice(
    data: InvoiceData,
    schemaConfig?: NormalizationConfig,
    authToken?: string
  ): Promise<NormalizeResponse> {
    const body = {
      data,
      schema_config: schemaConfig,
    }

    const response = await this.makeRequest<NormalizeResponse>(
      this.config.endpoints.normalize,
      body,
      authToken
    )

    const parseResult = normalizeResponseSchema.safeParse(response)
    if (!parseResult.success) {
      throw new FinanceExtractionValidationError(
        'Invalid response from normalize API',
        parseResult.error.format()
      )
    }

    return parseResult.data
  }

  /**
   * Validate extraction results using Claude as judge
   */
  async validateExtraction(
    extractionResults: ExtractionResult[],
    validationRules?: ValidationRules,
    authToken?: string
  ): Promise<ValidationResponse> {
    const body = {
      extraction_results: extractionResults,
      validation_rules: validationRules,
    }

    const response = await this.makeRequest<ValidationResponse>(
      this.config.endpoints.validate,
      body,
      authToken
    )

    const parseResult = validationResponseSchema.safeParse(response)
    if (!parseResult.success) {
      throw new FinanceExtractionValidationError(
        'Invalid response from validate API',
        parseResult.error.format()
      )
    }

    return parseResult.data
  }

  /**
   * Generate annotated invoice image with confidence colors
   */
  async visualizeResults(
    fileUrl: string,
    validationResult: ValidationResult,
    options?: VisualizeOptions,
    pageNum?: number,
    authToken?: string
  ): Promise<VisualizeResponse> {
    const body = {
      file_url: fileUrl,
      validation_result: validationResult,
      options: {
        scale: options?.scale ?? 2.0,
        show_legend: options?.show_legend ?? true,
        format: options?.format ?? 'png',
      },
      page_num: pageNum ?? 0,
    }

    const response = await this.makeRequest<VisualizeResponse>(
      this.config.endpoints.visualize,
      body,
      authToken
    )

    const parseResult = visualizeResponseSchema.safeParse(response)
    if (!parseResult.success) {
      throw new FinanceExtractionValidationError(
        'Invalid response from visualize API',
        parseResult.error.format()
      )
    }

    return parseResult.data
  }

  /**
   * Make HTTP request to the Finance Extraction API
   */
  private async makeRequest<T>(
    endpoint: string,
    body: unknown,
    authToken?: string
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorData: FinanceApiError | null = null
        try {
          errorData = await response.json()
        } catch {
          // Response body is not JSON
        }

        throw new FinanceExtractionError(
          errorData?.error || `API request failed with status ${response.status}`,
          response.status,
          errorData?.details,
          errorData?.code
        )
      }

      const data = await response.json()
      return data as T
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof FinanceExtractionError) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new FinanceExtractionTimeoutError()
      }

      throw new FinanceExtractionError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        500
      )
    }
  }
}
