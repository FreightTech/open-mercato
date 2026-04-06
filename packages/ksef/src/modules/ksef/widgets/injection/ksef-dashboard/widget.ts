import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import KsefDashboardWidget from './widget.client'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'ksef.injection.dashboard',
    title: 'KSeF Dashboard',
    features: ['ksef.view'],
    priority: 200,
  },
  Widget: KsefDashboardWidget,
}

export default widget
