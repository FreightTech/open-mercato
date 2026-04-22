import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'
import { ksefDetailWidgetSpotId } from '../integration'

export const injectionTable: ModuleInjectionTable = {
  // KSeF status column injected into the FMS invoicing DataTable
  'data-table:fms_invoicing:fms_invoicing_invoice': [
    {
      widgetId: 'ksef.injection.status-column',
      priority: 90,
    },
  ],
  // KSeF Invoices tab on the Integration Marketplace detail page
  [ksefDetailWidgetSpotId]: [
    {
      widgetId: 'ksef.injection.invoices',
      kind: 'tab',
      groupLabel: 'ksef.tabs.invoices',
      priority: 200,
    },
  ],
}

export default injectionTable
