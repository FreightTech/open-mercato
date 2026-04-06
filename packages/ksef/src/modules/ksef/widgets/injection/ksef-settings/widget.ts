import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import KsefSettingsWidget from './widget.client'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'ksef.injection.settings',
    title: 'KSeF Settings',
    features: ['ksef.settings.manage'],
    priority: 180,
  },
  Widget: KsefSettingsWidget,
}

export default widget
