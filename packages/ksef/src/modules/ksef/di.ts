import { asFunction, asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { KsefAuthService } from './services/auth.service'
import { KsefCryptoService } from './services/crypto.service'
import { KsefSessionService } from './services/session.service'
import { KsefReceiverService } from './services/receiver.service'
import { KsefXmlService } from './services/xml.service'
import { ksefHealthCheck } from './lib/health'

export function register(container: AppContainer) {
  container.register({
    ksefAuthService: asFunction(() =>
      new KsefAuthService({ container })
    ).scoped(),

    ksefXmlService: asFunction(() => new KsefXmlService()).scoped(),

    ksefCryptoService: asFunction(() => new KsefCryptoService()).scoped(),

    ksefSessionService: asFunction(() =>
      new KsefSessionService({ container })
    ).scoped(),

    ksefReceiverService: asFunction(() =>
      new KsefReceiverService({ container })
    ).scoped(),

    ksefHealthCheck: asValue(ksefHealthCheck),
  })
}
