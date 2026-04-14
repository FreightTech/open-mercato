import { asClass } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { DocumentParserService } from './services/document-parser.service'
import { ConsistencyCheckerService } from './services/consistency-checker.service'
import { Isztar4Service } from './services/isztar4.service'

export function register(container: AppContainer) {
  container.register({
    documentParserService: asClass(DocumentParserService).singleton(),
    consistencyCheckerService: asClass(ConsistencyCheckerService).singleton(),
    isztar4Service: asClass(Isztar4Service).singleton(),
  })
}
