import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateConversionRateSettings, dehydrateConversionRateSettings, type ConversionRateSettings } from './config'

const ConversionRateWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<ConversionRateSettings> = {
  metadata: {
    id: 'frc_offers.dashboard.conversionRate',
    title: 'Offer Conversion Rate',
    description: 'Shows percentage of offers converted to bookings',
    features: ['dashboards.view', 'frc_offers.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['4rcargo', 'offers', 'analytics'],
    category: 'frc_offers',
    icon: 'percent',
    supportsRefresh: true,
  },
  Widget: ConversionRateWidget,
  hydrateSettings: hydrateConversionRateSettings,
  dehydrateSettings: dehydrateConversionRateSettings,
}

export default widget
