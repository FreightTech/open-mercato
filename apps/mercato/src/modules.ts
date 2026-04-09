// Central place to enable modules and their source.
// - id: module id (plural snake_case; special cases: 'auth')
// - from: '@open-mercato/core' | '@app' | custom alias/path in future
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

export type ModuleEntry = { id: string; from?: '@open-mercato/core' | '@app' | string }

export const enabledModules: ModuleEntry[] = [
  { id: 'dashboards', from: '@open-mercato/core' },
  { id: 'auth', from: '@open-mercato/core' },
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'customers', from: '@open-mercato/core' },
  { id: 'perspectives', from: '@open-mercato/core' },
  { id: 'entities', from: '@open-mercato/core' },
  { id: 'configs', from: '@open-mercato/core' },
  { id: 'query_index', from: '@open-mercato/core' },
  { id: 'audit_logs', from: '@open-mercato/core' },
  { id: 'attachments', from: '@open-mercato/core' },
  { id: 'catalog', from: '@open-mercato/core' },
  { id: 'sales', from: '@open-mercato/core' },
  // { id: 'example', from: '@open-mercato/example' },
  { id: 'api_keys', from: '@open-mercato/core' },
  { id: 'dictionaries', from: '@open-mercato/core' },
  { id: 'content', from: '@open-mercato/content' },
  { id: 'onboarding', from: '@open-mercato/onboarding' },
  { id: 'api_docs', from: '@open-mercato/core' },
  { id: 'business_rules', from: '@open-mercato/core' },
  // { id: 'shipments', from: '@open-mercato/fms' },
  // { id: 'fms_tracking', from: '@open-mercato/fms_tracking' },
  { id: 'feature_toggles', from: '@open-mercato/core' },
  { id: 'workflows', from: '@open-mercato/core' },
  // { id: 'booking', from: '@open-mercato/core' },
  { id: 'search', from: '@open-mercato/search' },
  { id: 'progress', from: '@open-mercato/core' },
  { id: 'currencies', from: '@open-mercato/core' },
  { id: 'annotations', from: '@open-mercato/core' },
  { id: 'planner', from: '@open-mercato/core' },
  { id: 'resources', from: '@open-mercato/core' },
  { id: 'staff', from: '@open-mercato/core' },
  { id: 'events', from: '@open-mercato/events' },
  { id: 'messaging', from: '@open-mercato/messaging' },
  { id: 'notifications', from: '@open-mercato/core' },
  { id: 'integrations', from: '@open-mercato/core' },
  { id: 'data_sync', from: '@open-mercato/core' },
  { id: 'messages', from: '@open-mercato/core' },
  { id: 'ai_assistant', from: '@open-mercato/ai-assistant' },
  { id: 'contractors', from: '@open-mercato/fms' },
  { id: 'fms_offers', from: '@open-mercato/fms' },
  { id: 'fms_locations', from: '@open-mercato/fms' },
  { id: 'fms_products', from: '@open-mercato/fms' },
  { id: 'fms_documents', from: '@open-mercato/fms' },
  { id: 'fms_invoicing', from: '@open-mercato/fms' },
  { id: 'ksef', from: '@open-mercato/ksef' },
  { id: 'templating', from: '@open-mercato/templating' },
  { id: 'documents', from: '@open-mercato/documents' },
  { id: 'fms_projects', from: '@open-mercato/fms' },
  { id: 'fms_files', from: '@open-mercato/fms' },
  // fms_financials merged into fms_documents
  { id: 'fms_teams', from: '@open-mercato/fms' },
  { id: 'transports', from: '@open-mercato/fms' },
  { id: 'email_templates', from: '@open-mercato/fms' },
  { id: 'pdf_templates', from: '@open-mercato/fms' },
  { id: 'truck_loading', from: '@open-mercato/fms' },
  { id: 'scheduler', from: '@open-mercato/scheduler' },
  { id: 'shipment_tracking', from: '@open-mercato/shipment-tracking' },
  { id: 'tasks_board', from: '@open-mercato/fms' },
  { id: 'example', from: '@app' },
  // 4R Cargo FMS modules
  { id: 'frc_airports', from: '@open-mercato/fms_4rcargo' },
  { id: 'frc_rfqs', from: '@open-mercato/fms_4rcargo' },
  { id: 'frc_offers', from: '@open-mercato/fms_4rcargo' },
  { id: 'frc_trucks', from: '@open-mercato/fms_4rcargo' },
  { id: 'frc_projects', from: '@open-mercato/fms_4rcargo' },
  { id: 'frc_console', from: '@open-mercato/fms_4rcargo' },
  { id: 'air_cargo', from: '@open-mercato/fms_4rcargo' },
  { id: 'frc_contractors', from: '@open-mercato/fms_4rcargo' },
  { id: 'frc_settings', from: '@open-mercato/fms_4rcargo' },
  { id: 'translations', from: '@open-mercato/core' },
  { id: 'inbox_ops', from: '@open-mercato/core' },
  { id: 'payment_gateways', from: '@open-mercato/core' },
  { id: 'checkout', from: '@open-mercato/checkout' },
  { id: 'gateway_stripe', from: '@open-mercato/gateway-stripe' },
  { id: 'sync_akeneo', from: '@open-mercato/sync-akeneo' },
  { id: 'shipping_carriers', from: '@open-mercato/core' },
  { id: 'webhooks', from: '@open-mercato/webhooks' },
  { id: 'customer_accounts', from: '@open-mercato/core' },
  { id: 'portal', from: '@open-mercato/core' },
]

const enterpriseModulesEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES, false)
const enterpriseSsoEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SSO, false)
const enterpriseSecurityEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SECURITY, false)

if (enterpriseModulesEnabled) {
  enabledModules.push(
    { id: 'record_locks', from: '@open-mercato/enterprise' },
    { id: 'system_status_overlays', from: '@open-mercato/enterprise' },
  )
}

if (enterpriseModulesEnabled && enterpriseSsoEnabled) {
  enabledModules.push({ id: 'sso', from: '@open-mercato/enterprise' })
}

if (enterpriseModulesEnabled && enterpriseSecurityEnabled) {
  enabledModules.push({ id: 'security', from: '@open-mercato/enterprise' })
}