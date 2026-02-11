import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateDelayedShipmentsSettings, type DelayedShipmentsSettings } from './config'

const DelayedShipmentsWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<DelayedShipmentsSettings> = {
  metadata: {
    id: 'frc_rfqs.dashboard.delayed',
    title: 'Delayed Shipments',
    description: 'Shows RFQs that are delayed or in-transit-delayed',
    features: ['dashboards.view', 'frc_rfqs.view'],
    defaultSize: 'sm',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['4rcargo', 'rfqs', 'alerts'],
    category: 'frc_rfqs',
    icon: 'alert-triangle',
    supportsRefresh: true,
  },
  Widget: DelayedShipmentsWidget,
  hydrateSettings: hydrateDelayedShipmentsSettings,
  dehydrateSettings: () => ({}),
}

export default widget
