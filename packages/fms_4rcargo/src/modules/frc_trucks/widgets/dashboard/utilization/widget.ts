import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateUtilizationSettings, dehydrateUtilizationSettings, type UtilizationSettings } from './config'

const UtilizationWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<UtilizationSettings> = {
  metadata: {
    id: 'frc_trucks.dashboard.utilization',
    title: 'Truck Utilization',
    description: 'Shows truck booking performance and profit/loss',
    features: ['dashboards.view', 'frc_trucks.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['4rcargo', 'trucks', 'analytics'],
    category: 'frc_trucks',
    icon: 'truck',
    supportsRefresh: true,
  },
  Widget: UtilizationWidget,
  hydrateSettings: hydrateUtilizationSettings,
  dehydrateSettings: dehydrateUtilizationSettings,
}

export default widget
