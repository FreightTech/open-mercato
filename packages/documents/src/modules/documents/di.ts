import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { StorageDriver } from '@open-mercato/shared/lib/drivers'
import { SchemaRegistry, createSchemaRegistry } from './services/schema-registry.service'
import { DocumentDetector, createDocumentDetector } from './services/document-detector.service'
import {
  TransportationMetadataExtractor,
  createTransportationExtractor,
} from './services/transportation-extractor.service'
import { MistralOcrService, createMistralOcrService } from './services/mistral-ocr.service'
import { PageImageService } from './services/page-image.service'
import { createPipelineOrchestrator } from './services/pipeline/orchestrator'

export function register(container: AppContainer) {
  container.register({
    documentSchemaRegistry: asFunction(() => createSchemaRegistry()).singleton(),
  })

  container.register({
    documentDetector: asFunction(() =>
      createDocumentDetector(container.resolve('documentSchemaRegistry') as SchemaRegistry)
    ).scoped(),
  })

  container.register({
    documentTransportationExtractor: asFunction(() => createTransportationExtractor()).scoped(),
  })

  container.register({
    documentMistralOcrService: asFunction(() =>
      createMistralOcrService(
        container.resolve('documentSchemaRegistry') as SchemaRegistry,
        container.resolve('documentDetector') as DocumentDetector,
        container.resolve('documentTransportationExtractor') as TransportationMetadataExtractor
      )
    ).scoped(),
  })

  container.register({
    documentPageImageService: asFunction(() =>
      new PageImageService({
        storageDriver: container.resolve('storageDriver') as StorageDriver,
        bucketKey: 'documentPages',
      })
    ).scoped(),
  })

  container.register({
    documentPipelineOrchestrator: asFunction(() =>
      createPipelineOrchestrator(
        container.resolve('documentMistralOcrService') as MistralOcrService,
        container.resolve('documentDetector') as DocumentDetector,
        container.resolve('documentTransportationExtractor') as TransportationMetadataExtractor
      )
    ).scoped(),
  })
}
