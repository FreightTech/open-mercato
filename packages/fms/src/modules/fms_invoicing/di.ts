import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { InvoicingService } from './services/invoicing.service'
import { InvoiceImportService } from './services/import.service'
import { KsefAuthService } from './services/ksef/auth.service'
import { KsefXmlService } from './services/ksef/xml.service'
import { KsefCryptoService } from './services/ksef/crypto.service'
import { KsefSessionService } from './services/ksef/session.service'
import { KsefReceiverService } from './services/ksef/receiver.service'

export function register(container: AppContainer) {
  container.register({
    fmsInvoicingService: asFunction(() =>
      new InvoicingService({
        container,
      })
    ).scoped(),
  })

  container.register({
    fmsInvoiceImport: asFunction(() =>
      new InvoiceImportService({
        container,
      })
    ).scoped(),
  })

  container.register({
    fmsKsefAuthService: asFunction(() =>
      new KsefAuthService({
        container,
      })
    ).scoped(),
  })

  container.register({
    fmsKsefXmlService: asFunction(() =>
      new KsefXmlService()
    ).scoped(),
  })

  container.register({
    fmsKsefCryptoService: asFunction(() =>
      new KsefCryptoService()
    ).scoped(),
  })

  container.register({
    fmsKsefSessionService: asFunction(() =>
      new KsefSessionService({
        container,
      })
    ).scoped(),
  })

  container.register({
    fmsKsefReceiverService: asFunction(() =>
      new KsefReceiverService({
        container,
      })
    ).scoped(),
  })
}
