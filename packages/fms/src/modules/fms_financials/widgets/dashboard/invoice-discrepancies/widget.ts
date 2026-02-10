import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateInvoiceDiscrepanciesSettings, type InvoiceDiscrepanciesSettings } from './config'

const InvoiceDiscrepanciesWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<InvoiceDiscrepanciesSettings> = {
  metadata: {
    id: 'fms_financials.dashboard.invoiceDiscrepancies',
    title: 'Invoice Discrepancies',
    description: 'Invoices with cost mismatches that need review.',
    features: ['dashboards.view', 'fms_financials.invoices.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'financials', 'invoices'],
    category: 'fms_financials',
    icon: 'file-diff',
    supportsRefresh: true,
  },
  Widget: InvoiceDiscrepanciesWidget,
  hydrateSettings: hydrateInvoiceDiscrepanciesSettings,
  dehydrateSettings: () => ({}),
}

export default widget
