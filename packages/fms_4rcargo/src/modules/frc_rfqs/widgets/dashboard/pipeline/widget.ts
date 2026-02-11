import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydratePipelineSettings, dehydratePipelineSettings, type PipelineSettings } from './config'

const PipelineWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<PipelineSettings> = {
  metadata: {
    id: 'frc_rfqs.dashboard.pipeline',
    title: 'RFQ Pipeline',
    description: 'Shows RFQs by sales stage with total values',
    features: ['dashboards.view', 'frc_rfqs.view'],
    defaultSize: 'lg',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['4rcargo', 'rfqs', 'sales'],
    category: 'frc_rfqs',
    icon: 'git-branch',
    supportsRefresh: true,
  },
  Widget: PipelineWidget,
  hydrateSettings: hydratePipelineSettings,
  dehydrateSettings: dehydratePipelineSettings,
}

export default widget
