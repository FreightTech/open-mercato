import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateRfqInboxSettings, type RfqInboxSettings } from './config'

const RfqInboxWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<RfqInboxSettings> = {
  metadata: {
    id: 'fms_offers.dashboard.rfqInbox',
    title: 'RFQ Inbox',
    description: 'Recent requests for quotation awaiting response.',
    features: ['dashboards.view', 'fms_offers.offers.view'],
    defaultSize: 'lg',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'offers', 'rfq'],
    category: 'fms_offers',
    icon: 'inbox',
    supportsRefresh: true,
  },
  Widget: RfqInboxWidget,
  hydrateSettings: hydrateRfqInboxSettings,
  dehydrateSettings: () => ({}),
}

export default widget
