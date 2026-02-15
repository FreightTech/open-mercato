import { asFunction, asClass } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { StorageDriver } from '@open-mercato/shared/lib/drivers'
import { SchemaRegistry, createSchemaRegistry } from './services/schema-registry.service'
import { DocumentDetector, createDocumentDetector } from './services/document-detector.service'
import {
  TransportationMetadataExtractor,
  createTransportationExtractor,
} from './services/transportation-extractor.service'
import { MistralOcrService, createMistralOcrService } from './services/mistral-ocr.service'
import { ChargeCodeMatcherService } from './services/charge-code-matcher.service'
import { PageImageService } from './services/page-image.service'
import { createPipelineOrchestrator } from './services/pipeline/orchestrator'

export function register(container: AppContainer) {
  // Schema registry - singleton for caching loaded schemas
  container.register({
    fmsSchemaRegistry: asFunction(() => createSchemaRegistry()).singleton(),
  })

  // Document detector - scoped, needs schema registry
  container.register({
    fmsDocumentDetector: asFunction(({ fmsSchemaRegistry }) =>
      createDocumentDetector(fmsSchemaRegistry as SchemaRegistry)
    ).scoped(),
  })

  // Transportation metadata extractor - scoped
  container.register({
    fmsTransportationExtractor: asFunction(() => createTransportationExtractor()).scoped(),
  })

  // Mistral OCR service - scoped, needs all the above services
  container.register({
    fmsMistralOcrService: asFunction(
      ({ fmsSchemaRegistry, fmsDocumentDetector, fmsTransportationExtractor }) =>
        createMistralOcrService(
          fmsSchemaRegistry as SchemaRegistry,
          fmsDocumentDetector as DocumentDetector,
          fmsTransportationExtractor as TransportationMetadataExtractor
        )
    ).scoped(),
  })

  // Charge code matcher - scoped
  container.register({
    fmsChargeCodeMatcher: asClass(ChargeCodeMatcherService).scoped(),
  })

  // Page image service for invoices - uses StorageDriver with 'invoicePages' bucket
  // Note: resolve storageDriver explicitly — Awilix CLASSIC mode doesn't reliably
  // inject cross-module dependencies via destructured parameter names
  container.register({
    fmsPageImageService: asFunction(() =>
      new PageImageService({
        storageDriver: container.resolve('storageDriver') as StorageDriver,
        bucketKey: 'invoicePages',
      })
    ).scoped(),
  })

  // Page image service for documents - uses StorageDriver with 'documentPages' bucket
  container.register({
    fmsDocumentPageImageService: asFunction(() =>
      new PageImageService({
        storageDriver: container.resolve('storageDriver') as StorageDriver,
        bucketKey: 'documentPages',
      })
    ).scoped(),
  })

  // Pipeline orchestrator - scoped, needs OCR service + detector + transportation extractor
  container.register({
    fmsPipelineOrchestrator: asFunction(
      ({ fmsMistralOcrService, fmsDocumentDetector, fmsTransportationExtractor }) =>
        createPipelineOrchestrator(
          fmsMistralOcrService as MistralOcrService,
          fmsDocumentDetector as DocumentDetector,
          fmsTransportationExtractor as TransportationMetadataExtractor
        )
    ).scoped(),
  })
}
