import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateUpcomingDeparturesSettings, dehydrateUpcomingDeparturesSettings, type UpcomingDeparturesSettings } from './config'

const UpcomingDeparturesWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<UpcomingDeparturesSettings> = {
  metadata: {
    id: 'frc_offers.dashboard.upcomingDepartures',
    title: 'Upcoming Departures',
    description: 'Shows upcoming flight departures',
    features: ['dashboards.view', 'frc_offers.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['4rcargo', 'offers', 'operations'],
    category: 'frc_offers',
    icon: 'plane-takeoff',
    supportsRefresh: true,
  },
  Widget: UpcomingDeparturesWidget,
  hydrateSettings: hydrateUpcomingDeparturesSettings,
  dehydrateSettings: dehydrateUpcomingDeparturesSettings,
}

export default widget
