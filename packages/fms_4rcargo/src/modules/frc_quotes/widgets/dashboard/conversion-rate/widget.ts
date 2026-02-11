import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateConversionRateSettings, dehydrateConversionRateSettings, type ConversionRateSettings } from './config'

const ConversionRateWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<ConversionRateSettings> = {
  metadata: {
    id: 'frc_quotes.dashboard.conversionRate',
    title: 'Quote Conversion Rate',
    description: 'Shows percentage of quotes converted to bookings',
    features: ['dashboards.view', 'frc_quotes.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['4rcargo', 'quotes', 'analytics'],
    category: 'frc_quotes',
    icon: 'percent',
    supportsRefresh: true,
  },
  Widget: ConversionRateWidget,
  hydrateSettings: hydrateConversionRateSettings,
  dehydrateSettings: dehydrateConversionRateSettings,
}

export default widget
