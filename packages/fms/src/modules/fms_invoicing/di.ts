import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { FmsInvoicingService } from './services/invoicing.service'
import { FmsInvoiceImportService } from './services/import.service'

export function register(container: AppContainer) {
  container.register({
    fmsInvoicingService: asFunction(() =>
      new FmsInvoicingService({
        container,
      })
    ).scoped(),
  })

  container.register({
    fmsInvoicingImportService: asFunction(() =>
      new FmsInvoiceImportService({
        container,
      })
    ).scoped(),
  })
}
