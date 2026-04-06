import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import KsefInvoicesWidget from './widget.client'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'ksef.injection.invoices',
    title: 'KSeF Invoices',
    features: ['ksef.view'],
    priority: 190,
  },
  Widget: KsefInvoicesWidget,
}

export default widget
