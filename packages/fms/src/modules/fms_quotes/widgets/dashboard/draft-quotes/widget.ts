import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateDraftQuotesSettings, type DraftQuotesSettings } from './config'

const DraftQuotesWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<DraftQuotesSettings> = {
  metadata: {
    id: 'fms_quotes.dashboard.draftQuotes',
    title: 'Draft Quotes',
    features: ['dashboards.view', 'fms_quotes.quotes.view'],
    defaultSize: 'sm',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'quotes'],
    category: 'fms_quotes',
    icon: 'file-text',
    supportsRefresh: true,
  },
  Widget: DraftQuotesWidget,
  hydrateSettings: hydrateDraftQuotesSettings,
  dehydrateSettings: () => ({}),
}

export default widget
