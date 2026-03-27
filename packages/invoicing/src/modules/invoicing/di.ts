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
    invoicingService: asFunction(() =>
      new InvoicingService({
        container,
      })
    ).scoped(),
  })

  container.register({
    invoicingImportService: asFunction(() =>
      new InvoiceImportService({
        container,
      })
    ).scoped(),
  })

  container.register({
    invoicingKsefAuthService: asFunction(() =>
      new KsefAuthService({
        container,
      })
    ).scoped(),
  })

  container.register({
    invoicingKsefXmlService: asFunction(() =>
      new KsefXmlService()
    ).scoped(),
  })

  container.register({
    invoicingKsefCryptoService: asFunction(() =>
      new KsefCryptoService()
    ).scoped(),
  })

  container.register({
    invoicingKsefSessionService: asFunction(() =>
      new KsefSessionService({
        container,
      })
    ).scoped(),
  })

  container.register({
    invoicingKsefReceiverService: asFunction(() =>
      new KsefReceiverService({
        container,
      })
    ).scoped(),
  })
}
