import type { DocumentType, TransportationMetadata } from '../../data/schema-types'
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

  async processDocument(
    fileBuffer: Buffer,
    filename: string
  ): Promise<DocumentProcessingResult> {
    const startTime = Date.now()

    // Step 1: OCR — extract raw text using Mistral OCR
    const { text: rawText } = await this.mistralOcrService.extractText(fileBuffer, filename)

    if (!rawText || rawText.trim().length === 0) {
      return this.emptyResult(startTime)
    }

    // Step 2: Classify document type
    const detection = await this.documentDetector.detect(rawText)
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
      provider
        .extract(rawText, documentType, schema)
        .catch((error): ExtractionProviderResult => ({
          providerId: provider.id,
          success: false,
          data: {},
          processingTimeMs: 0,
          error: error instanceof Error ? error.message : 'Provider failed',
        }))
    )

    const providerResults = await Promise.all(extractionPromises)

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
    const result: TransportationMetadata = { ...regexData }
    const transportation = consensusData.transportation as Record<string, unknown> | undefined
    const routing = consensusData.routing as Record<string, unknown> | undefined
    const vessel = consensusData.vessel as Record<string, unknown> | undefined

    if (!result.blNumber && transportation?.bl_number) result.blNumber = String(transportation.bl_number)
    if (!result.blNumber && consensusData.bl_number) result.blNumber = String(consensusData.bl_number)

    if (!result.vesselName && vessel?.name) result.vesselName = String(vessel.name)
    if (!result.vesselName && transportation?.vessel_name) result.vesselName = String(transportation.vessel_name)

    if (!result.voyageNumber && vessel?.voyage_number) result.voyageNumber = String(vessel.voyage_number)
    if (!result.portOfLoading && routing?.port_of_loading) result.portOfLoading = String(routing.port_of_loading)
    if (!result.portOfDischarge && routing?.port_of_discharge) result.portOfDischarge = String(routing.port_of_discharge)

    const containers = transportation?.container_numbers
    if (containers && Array.isArray(containers)) {
      const existing = result.containerNumbers ?? []
      result.containerNumbers = [...new Set([...existing, ...containers.map(String)])]
    }

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
