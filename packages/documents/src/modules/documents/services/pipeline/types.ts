import type { z } from 'zod'
import type { DocumentType, TransportationMetadata } from '../../data/schema-types'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ExtractionProvider {
  readonly id: string
  readonly name: string
  extract(
    ocrText: string,
    documentType: DocumentType,
    schema: z.ZodType
  ): Promise<ExtractionProviderResult>
  isAvailable(): Promise<boolean>
}

export interface ExtractionProviderResult {
  providerId: string
  success: boolean
  data: Record<string, unknown>
  rawResponse?: unknown
  processingTimeMs: number
  error?: string
  usage?: TokenUsage
}

export type ConsensusRecommendation = 'AUTO_ACCEPT' | 'REVIEW' | 'MANUAL'

export interface ConsensusResult {
  recommendation: ConsensusRecommendation
  overallConfidence: number
  consensusData: Record<string, unknown>
  fieldConfidences: Record<string, FieldConsensus>
  disagreements: Disagreement[]
  providerResults: ExtractionProviderResult[]
}

export interface FieldConsensus {
  value: unknown
  confidence: number
  agreedProviders: string[]
  allValues: Record<string, unknown>
}

export interface Disagreement {
  field: string
  values: Record<string, unknown>
  selectedValue: unknown
  reason: string
}

export interface DocumentProcessingResult {
  documentType: DocumentType
  documentTypeConfidence: number
  consensus: ConsensusResult
  transportationMetadata: TransportationMetadata
  rawText: string
  processingTimeMs: number
  totalUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    byProvider: Record<string, TokenUsage>
  }
}

export type ProcessingStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed'

export interface PipelineConfig {
  mistralEnabled: boolean
  claudeEnabled: boolean
  geminiEnabled: boolean
  autoAcceptThreshold: number
  reviewThreshold: number
  ocrTimeoutMs: number
  providerTimeoutMs: number
  detectionTimeoutMs: number
}

export function loadPipelineConfig(): PipelineConfig {
  return {
    mistralEnabled: process.env.EXTRACTION_MISTRAL_ENABLED !== 'false' && !!process.env.MISTRAL_API_KEY,
    claudeEnabled: process.env.EXTRACTION_CLAUDE_ENABLED === 'true' && !!process.env.ANTHROPIC_API_KEY,
    geminiEnabled: process.env.EXTRACTION_GEMINI_ENABLED === 'true' && !!process.env.GEMINI_API_KEY,
    autoAcceptThreshold: parseFloat(process.env.CONSENSUS_AUTO_ACCEPT_THRESHOLD || '0.9'),
    reviewThreshold: parseFloat(process.env.CONSENSUS_REVIEW_THRESHOLD || '0.6'),
    ocrTimeoutMs: parseInt(process.env.FMS_OCR_TIMEOUT_MS || '120000', 10),
    providerTimeoutMs: parseInt(process.env.FMS_PROVIDER_TIMEOUT_MS || '90000', 10),
    detectionTimeoutMs: parseInt(process.env.FMS_DETECTION_TIMEOUT_MS || '30000', 10),
  }
}
