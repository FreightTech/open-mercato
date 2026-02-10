import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateNeedsAttentionSettings, type NeedsAttentionSettings } from './config'

const NeedsAttentionWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<NeedsAttentionSettings> = {
  metadata: {
    id: 'fms_projects.dashboard.needsAttention',
    title: 'Needs Attention',
    description: 'Projects and shipments that require immediate action.',
    features: ['dashboards.view', 'fms_projects.projects.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'projects', 'alerts'],
    category: 'fms_projects',
    icon: 'alert-triangle',
    supportsRefresh: true,
  },
  Widget: NeedsAttentionWidget,
  hydrateSettings: hydrateNeedsAttentionSettings,
  dehydrateSettings: () => ({}),
}

export default widget
