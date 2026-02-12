import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { MicrosoftGraphService } from './services/microsoftGraphService'
import { SharePointExcelService } from './services/sharePointExcelService'

export function register(container: AppContainer) {
  container.register({
    microsoftGraphService: asFunction(() => {
      return new MicrosoftGraphService()
    })
      .singleton()
      .proxy(),
    sharePointExcelService: asFunction(({ microsoftGraphService }: { microsoftGraphService: MicrosoftGraphService }) => {
      return new SharePointExcelService(microsoftGraphService)
    })
      .singleton()
      .proxy(),
  })
}
