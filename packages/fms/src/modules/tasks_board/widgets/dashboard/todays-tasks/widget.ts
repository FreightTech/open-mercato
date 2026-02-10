import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateTodaysTasksSettings, type TodaysTasksSettings } from './config'

const TodaysTasksWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<TodaysTasksSettings> = {
  metadata: {
    id: 'tasks_board.dashboard.todaysTasks',
    title: "Today's Tasks",
    description: 'Overview of tasks scheduled for today.',
    features: ['dashboards.view', 'tasks_board.tasks.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['fms', 'tasks'],
    category: 'tasks_board',
    icon: 'check-square',
    supportsRefresh: true,
  },
  Widget: TodaysTasksWidget,
  hydrateSettings: hydrateTodaysTasksSettings,
  dehydrateSettings: () => ({}),
}

export default widget
