import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import KsefStatusColumnWidget from './widget.client'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'ksef.injection.status-column',
    title: 'KSeF Status',
    features: ['ksef.view'],
    priority: 90,
  },
  Widget: KsefStatusColumnWidget,
}

export default widget
