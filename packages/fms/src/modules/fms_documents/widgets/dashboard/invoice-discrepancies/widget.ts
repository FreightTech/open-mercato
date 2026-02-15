import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateInvoiceDiscrepanciesSettings, type InvoiceDiscrepanciesSettings } from './config'

const InvoiceDiscrepanciesWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<InvoiceDiscrepanciesSettings> = {
  metadata: {
    id: 'fms_documents.dashboard.invoiceDiscrepancies',
    title: 'Invoice Discrepancies',
    description: 'Invoices with cost mismatches that need review.',
    features: ['dashboards.view', 'fms_documents.invoices.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'documents', 'invoices'],
    category: 'fms_documents',
    icon: 'file-diff',
    supportsRefresh: true,
  },
  Widget: InvoiceDiscrepanciesWidget,
  hydrateSettings: hydrateInvoiceDiscrepanciesSettings,
  dehydrateSettings: () => ({}),
}

export default widget
