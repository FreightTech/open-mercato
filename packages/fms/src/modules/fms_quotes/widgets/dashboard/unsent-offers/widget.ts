import type { DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import UnsentOffersWidget from './widget.client'
import { DEFAULT_SETTINGS, hydrateUnsentOffersSettings, type UnsentOffersSettings } from './config'

const widget: DashboardWidgetModule<UnsentOffersSettings> = {
  metadata: {
    id: 'fms_quotes.dashboard.unsentOffers',
    title: 'Unsent Offers',
    features: ['dashboards.view', 'fms_quotes.offers.view'],
    defaultSize: 'sm',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'offers'],
    category: 'fms_quotes',
    icon: 'mail',
    supportsRefresh: true,
  },
  Widget: UnsentOffersWidget,
  hydrateSettings: hydrateUnsentOffersSettings,
  dehydrateSettings: () => ({}),
}

export default widget
