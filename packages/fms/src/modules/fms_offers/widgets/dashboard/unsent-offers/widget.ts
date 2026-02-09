import type { DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import UnsentOffersWidget from './widget.client'
import { DEFAULT_SETTINGS, hydrateUnsentOffersSettings, type UnsentOffersSettings } from './config'

const widget: DashboardWidgetModule<UnsentOffersSettings> = {
  metadata: {
    id: 'fms_offers.dashboard.unsentOffers',
    title: 'Unsent Offers',
    features: ['dashboards.view', 'fms_offers.offers.view'],
    defaultSize: 'sm',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'offers'],
    category: 'fms_offers',
    icon: 'mail',
    supportsRefresh: true,
  },
  Widget: UnsentOffersWidget,
  hydrateSettings: hydrateUnsentOffersSettings,
  dehydrateSettings: () => ({}),
}

export default widget
