/**
 * Finance Extraction API Configuration
 */
export const financeExtractionConfig = {
  /**
   * Base URL for the Finance Extraction API
   */
  baseUrl: process.env.FINANCE_EXTRACTION_API_URL || 'http://0.0.0.0:8000',

  /**
   * Request timeout in milliseconds (2 minutes - extraction can take time)
   */
  timeout: 120000,

  /**
   * API endpoints
   */
  endpoints: {
    extract: '/api/v1/extract',
    normalize: '/api/v1/normalize',
    validate: '/api/v1/validate',
    visualize: '/api/v1/visualize',
  },

  /**
   * Default extraction strategies (Anthropic + Gemini for LLM, PyMuPDF for non-LLM)
   */
  defaultStrategies: {
    anthropic: true,
    openai: false,
    gemini: true,
    pymupdf_pdfplumber: true,
  },
} as const

export type FinanceExtractionConfig = typeof financeExtractionConfig
