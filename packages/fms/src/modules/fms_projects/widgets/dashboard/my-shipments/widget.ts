import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateMyShipmentsSettings, type MyShipmentsSettings } from './config'

const MyShipmentsWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<MyShipmentsSettings> = {
  metadata: {
    id: 'fms_projects.dashboard.myShipments',
    title: 'My Shipments',
    description: 'Active shipments assigned to you.',
    features: ['dashboards.view', 'fms_projects.projects.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'projects', 'shipments'],
    category: 'fms_projects',
    icon: 'truck',
    supportsRefresh: true,
  },
  Widget: MyShipmentsWidget,
  hydrateSettings: hydrateMyShipmentsSettings,
  dehydrateSettings: () => ({}),
}

export default widget
