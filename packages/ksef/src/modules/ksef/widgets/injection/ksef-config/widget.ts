import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import KsefConfigWidget from './widget.client'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'ksef.injection.config',
    title: 'KSeF Settings',
    features: ['ksef.settings.manage'],
    priority: 100,
  },
  Widget: KsefConfigWidget,
}

export default widget
