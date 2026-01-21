import type { DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import PendingResponseOffersWidget from './widget.client'
import { DEFAULT_SETTINGS, hydratePendingResponseOffersSettings, type PendingResponseOffersSettings } from './config'

const widget: DashboardWidgetModule<PendingResponseOffersSettings> = {
  metadata: {
    id: 'fms_quotes.dashboard.pendingResponseOffers',
    title: 'Pending Response Offers',
    features: ['dashboards.view', 'fms_quotes.offers.view'],
    defaultSize: 'sm',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'offers', 'follow-up'],
    category: 'fms_quotes',
    icon: 'clock',
    supportsRefresh: true,
  },
  Widget: PendingResponseOffersWidget,
  hydrateSettings: hydratePendingResponseOffersSettings,
  dehydrateSettings: () => ({}),
}

export default widget
