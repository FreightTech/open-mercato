import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import KsefCredentialsWidget from './widget.client'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'ksef.injection.credentials',
    title: 'KSeF Credentials',
    features: ['ksef.view'],
    priority: 300,
  },
  Widget: KsefCredentialsWidget,
}

export default widget
