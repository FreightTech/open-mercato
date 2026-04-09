import type { DocumentType, TransportationMetadata } from '../../data/schema-types'

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}
import { getExtractionSchema } from '../../data/extraction-schemas'
import type { MistralOcrService } from '../mistral-ocr.service'
import type { DocumentDetector } from '../document-detector.service'
import type { TransportationMetadataExtractor } from '../transportation-extractor.service'
import { ConsensusEngine } from './consensus-engine'
import type {
  ExtractionProvider,
  ExtractionProviderResult,
  DocumentProcessingResult,
  PipelineConfig,
  TokenUsage,
} from './types'
import { loadPipelineConfig } from './types'
import { MistralExtractionProvider } from './providers/mistral.provider'
import { ClaudeExtractionProvider } from './providers/claude.provider'
import { GeminiExtractionProvider } from './providers/gemini.provider'

export class PipelineOrchestrator {
  private providers: ExtractionProvider[] = []
  private consensusEngine: ConsensusEngine
  private config: PipelineConfig
  private mistralOcrService: MistralOcrService
  private documentDetector: DocumentDetector
  private transportationExtractor: TransportationMetadataExtractor

  constructor(
    mistralOcrService: MistralOcrService,
    documentDetector: DocumentDetector,
    transportationExtractor: TransportationMetadataExtractor,
    config?: PipelineConfig
  ) {
    this.config = config ?? loadPipelineConfig()
    this.consensusEngine = new ConsensusEngine(this.config)
    this.mistralOcrService = mistralOcrService
    this.documentDetector = documentDetector
    this.transportationExtractor = transportationExtractor

    this.initializeProviders()
  }

  private initializeProviders(): void {
    if (this.config.mistralEnabled) {
      this.providers.push(new MistralExtractionProvider())
    }
    if (this.config.claudeEnabled) {
      this.providers.push(new ClaudeExtractionProvider())
    }
    if (this.config.geminiEnabled) {
      this.providers.push(new GeminiExtractionProvider())
    }
  }

  /**
   * Detect if a document is a bundle (multiple document types in one PDF).
   * Returns detected types if 2+ types score above their minScore * 0.7.
   */
  async detectBundle(rawText: string): Promise<DocumentType[]> {
    const configs = await this.documentDetector['schemaRegistry'].getDetectionConfigs()
    const detection = await this.documentDetector.detect(rawText)
    const allScores = detection.allScores

    const bundleTypes: DocumentType[] = []
    for (const { documentType, schema } of configs) {
      const threshold = schema.detection.minScore * 0.7
      const score = allScores[documentType] ?? 0
      if (score >= threshold && documentType !== 'unknown') {
        bundleTypes.push(documentType)
      }
    }

    return bundleTypes.length >= 2 ? bundleTypes : []
  }

  /**
   * Process a bundle — runs extraction for each detected sub-document type.
   * Returns results keyed by document type.
   */
  async processBundle(
    rawText: string,
    bundleTypes: DocumentType[],
    startTime: number
  ): Promise<{ bundleResults: Map<DocumentType, DocumentProcessingResult> }> {
    const bundleResults = new Map<DocumentType, DocumentProcessingResult>()
    const transportationMetadata = this.transportationExtractor.extract(rawText)

    for (const docType of bundleTypes) {
      const schema = getExtractionSchema(docType)
      if (!schema) continue

      const availableProviders = await this.filterAvailable()
      if (availableProviders.length === 0) continue

      const extractionPromises = availableProviders.map((provider) =>
        withTimeout(
          provider.extract(rawText, docType, schema),
          this.config.providerTimeoutMs,
          `Provider:${provider.id}`,
        ).catch((error): ExtractionProviderResult => ({
            providerId: provider.id,
            success: false,
            data: {},
            processingTimeMs: 0,
            error: error instanceof Error ? error.message : 'Provider failed',
          }))
      )

      const providerResults = await Promise.all(extractionPromises)
      const consensus = this.consensusEngine.buildConsensus(providerResults)
      const mergedTransportation = this.mergeTransportation(transportationMetadata, consensus.consensusData)

      bundleResults.set(docType, {
        documentType: docType,
        documentTypeConfidence: 80,
        consensus,
        transportationMetadata: mergedTransportation,
        rawText,
        processingTimeMs: Date.now() - startTime,
      })
    }

    return { bundleResults }
  }

  async processDocument(
    fileBuffer: Buffer,
    filename: string
  ): Promise<DocumentProcessingResult> {
    const startTime = Date.now()

    // Step 1: OCR — extract raw text using Mistral OCR
    const { text: rawText } = await withTimeout(
      this.mistralOcrService.extractText(fileBuffer, filename),
      this.config.ocrTimeoutMs,
      'OCR',
    )

    if (!rawText || rawText.trim().length === 0) {
      return this.emptyResult(startTime)
    }

    // Step 2: Classify document type
    const detection = await withTimeout(
      this.documentDetector.detect(rawText),
      this.config.detectionTimeoutMs,
      'Detection',
    )
    const documentType: DocumentType = detection.documentType
    const documentTypeConfidence = detection.confidence

    // Step 3: Extract transportation metadata (regex-based, instant)
    const transportationMetadata = this.transportationExtractor.extract(rawText)

    // Step 4: Get Zod schema for the detected type
    const schema = getExtractionSchema(documentType)

    if (!schema || this.providers.length === 0) {
      return {
        documentType,
        documentTypeConfidence,
        consensus: {
          recommendation: 'MANUAL',
          overallConfidence: 0,
          consensusData: {},
          fieldConfidences: {},
          disagreements: [],
          providerResults: [],
        },
        transportationMetadata,
        rawText,
        processingTimeMs: Date.now() - startTime,
      }
    }

    // Step 5: Parallel extraction from all enabled providers
    const availableProviders = await this.filterAvailable()

    const extractionPromises = availableProviders.map((provider) =>
      withTimeout(
        provider.extract(rawText, documentType, schema),
        this.config.providerTimeoutMs,
        `Provider:${provider.id}`,
      ).catch((error): ExtractionProviderResult => ({
          providerId: provider.id,
          success: false,
          data: {},
          processingTimeMs: 0,
          error: error instanceof Error ? error.message : 'Provider failed',
        }))
    )

    const providerResults = await Promise.all(extractionPromises)

    // Aggregate token usage from all providers
    const totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      byProvider: {} as Record<string, TokenUsage>,
    }
    for (const result of providerResults) {
      if (result.usage) {
        totalUsage.inputTokens += result.usage.inputTokens
        totalUsage.outputTokens += result.usage.outputTokens
        totalUsage.totalTokens += result.usage.totalTokens
        totalUsage.byProvider[result.providerId] = result.usage
      }
    }

    // Step 6: Consensus
    const consensus = this.consensusEngine.buildConsensus(providerResults)

    // Merge transportation metadata from consensus data
    const mergedTransportation = this.mergeTransportation(
      transportationMetadata,
      consensus.consensusData
    )

    return {
      documentType,
      documentTypeConfidence,
      consensus,
      transportationMetadata: mergedTransportation,
      rawText,
      processingTimeMs: Date.now() - startTime,
      totalUsage: totalUsage.totalTokens > 0 ? totalUsage : undefined,
    }
  }

  private async filterAvailable(): Promise<ExtractionProvider[]> {
    const checks = await Promise.all(
      this.providers.map(async (p) => ({ provider: p, available: await p.isAvailable() }))
    )
    return checks.filter((c) => c.available).map((c) => c.provider)
  }

  private mergeTransportation(
    regexData: TransportationMetadata,
    consensusData: Record<string, unknown>
  ): TransportationMetadata {
    const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null

    // Start from LLM consensus data, fall back to regex for any gaps
    const transportation = consensusData.transportation as Record<string, unknown> | undefined
    const routing = consensusData.routing as Record<string, unknown> | undefined
    const vessel = consensusData.vessel as Record<string, unknown> | undefined

    const result: TransportationMetadata = {}

    // LLM first (handle alternate field names), regex fallback
    result.blNumber = str(transportation?.hbl_number) ?? str(transportation?.hbl_no) ?? str(transportation?.bl_number) ?? str(consensusData.bl_number) ?? regexData.blNumber ?? null
    result.mblNumber = str(transportation?.mbl_number) ?? str(transportation?.mbl_no) ?? str(consensusData.mbl_number) ?? regexData.mblNumber ?? null
    result.bookingNumber = str(transportation?.booking_number) ?? str(transportation?.job_no) ?? str(consensusData.booking_number) ?? regexData.bookingNumber ?? null

    // Vessel: handle combined "VESSEL/VOYAGE" format
    const rawVessel = str(transportation?.vessel_name) ?? str(transportation?.vessel) ?? str(vessel?.name)
    if (rawVessel && rawVessel.includes('/')) {
      const [vesselPart, voyagePart] = rawVessel.split('/')
      result.vesselName = vesselPart.trim() || regexData.vesselName || null
      result.voyageNumber = str(transportation?.voyage_number) ?? (voyagePart.trim() || regexData.voyageNumber || null)
    } else {
      result.vesselName = rawVessel ?? regexData.vesselName ?? null
      result.voyageNumber = str(transportation?.voyage_number) ?? str(vessel?.voyage_number) ?? regexData.voyageNumber ?? null
    }

    result.portOfLoading = str(transportation?.port_of_loading) ?? str(transportation?.pol) ?? str(routing?.port_of_loading) ?? regexData.portOfLoading ?? null
    result.portOfDischarge = str(transportation?.port_of_discharge) ?? str(transportation?.pod) ?? str(routing?.port_of_discharge) ?? regexData.portOfDischarge ?? null
    result.etd = str(transportation?.etd) ?? regexData.etd ?? null
    result.eta = str(transportation?.eta) ?? regexData.eta ?? null
    result.carrierName = regexData.carrierName ?? null
    result.carrierScac = regexData.carrierScac ?? null

    // Containers: merge LLM + regex, deduplicate (handle alternate field names)
    const llmContainerSrc = transportation?.container_numbers ?? transportation?.containers_no
    const llmContainers = Array.isArray(llmContainerSrc)
      ? (llmContainerSrc as unknown[]).map(String)
      : []
    const allContainers = [...new Set([...llmContainers, ...(regexData.containerNumbers ?? [])])]
    result.containerNumbers = allContainers.length > 0 ? allContainers : undefined

    return result
  }

  private emptyResult(startTime: number): DocumentProcessingResult {
    return {
      documentType: 'unknown',
      documentTypeConfidence: 0,
      consensus: {
        recommendation: 'MANUAL',
        overallConfidence: 0,
        consensusData: {},
        fieldConfidences: {},
        disagreements: [],
        providerResults: [],
      },
      transportationMetadata: {},
      rawText: '',
      processingTimeMs: Date.now() - startTime,
    }
  }
}

export function createPipelineOrchestrator(
  mistralOcrService: MistralOcrService,
  documentDetector: DocumentDetector,
  transportationExtractor: TransportationMetadataExtractor,
  config?: PipelineConfig
): PipelineOrchestrator {
  return new PipelineOrchestrator(
    mistralOcrService,
    documentDetector,
    transportationExtractor,
    config
  )
}
