"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type SugarCrmConfig = {
  credentials: {
    configured: boolean
    instanceUrl: string | null
    missingVars: string[]
  }
  isEnabled: boolean
  lastSyncAt: string | null
  lastSyncStatus: 'success' | 'error' | null
  lastSyncMessage: string | null
}

type SugarCrmModule = {
  name: string
  label: string
  labelPlural: string
  isMappable: boolean
  targetEntity: string | null
  description: string | null
}

type ModulesResponse = {
  modules: SugarCrmModule[]
  totalCount: number
  mappableCount: number
}

type ModuleSyncStats = {
  moduleName: string
  targetEntity: string
  totalRecords: number
  created: number
  updated: number
  skipped: number
  errors: number
  errorMessages?: string[]
}

type SyncResult = {
  success: boolean
  message: string
  syncedAt: string
  durationMs: number
  statistics: {
    totalRecords: number
    created: number
    updated: number
    skipped: number
    errors: number
  }
  modules: ModuleSyncStats[]
}

const DEFAULT_CONFIG: SugarCrmConfig = {
  credentials: {
    configured: false,
    instanceUrl: null,
    missingVars: [],
  },
  isEnabled: false,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncMessage: null,
}

// Default mappable modules (before fetching from API)
const DEFAULT_MODULES: SugarCrmModule[] = [
  { name: 'Accounts', label: 'Accounts', labelPlural: 'Accounts', isMappable: true, targetEntity: 'Contractor', description: 'Client/Customer companies' },
  { name: 'Contacts', label: 'Contacts', labelPlural: 'Contacts', isMappable: true, targetEntity: 'ContractorContact', description: 'People at client companies' },
  { name: 'Opportunities', label: 'Opportunities', labelPlural: 'Opportunities', isMappable: true, targetEntity: 'FrcRfq', description: 'Sales opportunities / RFQs' },
]

export function SugarCrmIntegration() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()

  // Config state
  const [config, setConfig] = React.useState<SugarCrmConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)

  // Modules state
  const [modules, setModules] = React.useState<SugarCrmModule[]>(DEFAULT_MODULES)
  const [selectedModules, setSelectedModules] = React.useState<string[]>(['Accounts', 'Contacts', 'Opportunities'])
  const [loadingModules, setLoadingModules] = React.useState(false)
  const [modulesLoaded, setModulesLoaded] = React.useState(false)

  // Sync state
  const [syncing, setSyncing] = React.useState(false)
  const [syncingModule, setSyncingModule] = React.useState<string | null>(null)
  const [lastSyncResult, setLastSyncResult] = React.useState<SyncResult | null>(null)
  const [showAllErrors, setShowAllErrors] = React.useState(false)
  const [maxRecordsPerModule, setMaxRecordsPerModule] = React.useState<string>('')  // Empty = no limit

  // Load config on mount
  const loadConfig = React.useCallback(async () => {
    setLoading(true)
    try {
      const call = await apiCall<SugarCrmConfig>('/api/frc_settings/integrations/sugarcrm')
      if (call.ok && call.result) {
        setConfig(call.result)
      }
    } catch (err) {
      console.error('frc_settings.sugarcrm.load failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadConfig()
  }, [scopeVersion, loadConfig])

  // Toggle enabled state
  const handleToggleEnabled = async (enabled: boolean) => {
    setSaving(true)
    try {
      const call = await apiCall<SugarCrmConfig>('/api/frc_settings/integrations/sugarcrm', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isEnabled: enabled }),
      })

      if (call.ok && call.result) {
        setConfig(call.result)
        flash(
          t('frc_settings.integrations.sugarcrm.messages.settings_saved', 'SugarCRM settings saved'),
          'success'
        )
      }
    } catch (err) {
      console.error('frc_settings.sugarcrm.toggle failed', err)
    } finally {
      setSaving(false)
    }
  }

  // Test connection
  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const call = await apiCall<{ success: boolean; message: string }>('/api/frc_settings/integrations/sugarcrm/test', {
        method: 'POST',
      })

      if (call.ok && call.result?.success) {
        flash(call.result.message || t('frc_settings.integrations.sugarcrm.messages.test_success', 'Connection successful'), 'success')
      } else {
        flash(call.result?.message || t('frc_settings.integrations.sugarcrm.messages.test_failed', 'Connection failed'), 'error')
      }
    } catch (err) {
      flash(t('frc_settings.integrations.sugarcrm.messages.test_failed', 'Connection failed'), 'error')
    } finally {
      setTesting(false)
    }
  }

  // Load modules from SugarCRM
  const handleLoadModules = async () => {
    setLoadingModules(true)
    try {
      const call = await apiCall<ModulesResponse>('/api/frc_settings/integrations/sugarcrm/modules')

      if (call.ok && call.result) {
        // Filter to only mappable modules
        const mappableModules = call.result.modules.filter((m) => m.isMappable)
        setModules(mappableModules)
        setModulesLoaded(true)

        // Pre-select all mappable modules
        setSelectedModules(mappableModules.map((m) => m.name))

        flash(
          t('frc_settings.integrations.sugarcrm.messages.modules_loaded', `Found ${mappableModules.length} mappable modules`),
          'success'
        )
      } else {
        flash(t('frc_settings.integrations.sugarcrm.messages.modules_failed', 'Failed to load modules'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.sugarcrm.modules failed', err)
      flash(t('frc_settings.integrations.sugarcrm.messages.modules_failed', 'Failed to load modules'), 'error')
    } finally {
      setLoadingModules(false)
    }
  }

  // Toggle module selection
  const handleToggleModule = (moduleName: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleName) ? prev.filter((m) => m !== moduleName) : [...prev, moduleName]
    )
  }

  // Select/deselect all modules
  const handleSelectAll = () => {
    if (selectedModules.length === modules.length) {
      setSelectedModules([])
    } else {
      setSelectedModules(modules.map((m) => m.name))
    }
  }

  // Sync selected modules
  const handleSyncSelected = async () => {
    if (selectedModules.length === 0) {
      flash(t('frc_settings.integrations.sugarcrm.messages.no_modules_selected', 'Please select at least one module to sync'), 'error')
      return
    }

    setSyncing(true)
    setSyncingModule(null)
    setShowAllErrors(false)

    // Build request body
    const requestBody: { modules: string[]; maxRecordsPerModule?: number } = {
      modules: selectedModules,
    }
    const maxRecords = parseInt(maxRecordsPerModule, 10)
    if (!isNaN(maxRecords) && maxRecords > 0) {
      requestBody.maxRecordsPerModule = maxRecords
    }

    try {
      const call = await apiCall<SyncResult>('/api/frc_settings/integrations/sugarcrm/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (call.ok && call.result) {
        setLastSyncResult(call.result)
        flash(call.result.message, call.result.success ? 'success' : 'error')
        void loadConfig()
      } else {
        flash(t('frc_settings.integrations.sugarcrm.messages.sync_failed', 'Sync failed'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.sugarcrm.sync failed', err)
      flash(t('frc_settings.integrations.sugarcrm.messages.sync_failed', 'Sync failed'), 'error')
    } finally {
      setSyncing(false)
      setSyncingModule(null)
    }
  }

  // Sync all mappable modules
  const handleSyncAll = async () => {
    setSyncing(true)
    setSyncingModule(null)
    setShowAllErrors(false)

    // Build request body with optional max records
    const requestBody: { maxRecordsPerModule?: number } = {}
    const maxRecords = parseInt(maxRecordsPerModule, 10)
    if (!isNaN(maxRecords) && maxRecords > 0) {
      requestBody.maxRecordsPerModule = maxRecords
    }

    try {
      const call = await apiCall<SyncResult>('/api/frc_settings/integrations/sugarcrm/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (call.ok && call.result) {
        setLastSyncResult(call.result)
        flash(call.result.message, call.result.success ? 'success' : 'error')
        void loadConfig()
      } else {
        flash(t('frc_settings.integrations.sugarcrm.messages.sync_failed', 'Sync failed'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.sugarcrm.sync failed', err)
      flash(t('frc_settings.integrations.sugarcrm.messages.sync_failed', 'Sync failed'), 'error')
    } finally {
      setSyncing(false)
      setSyncingModule(null)
    }
  }

  // Format date for display
  const formatSyncDate = (date: string | null) => {
    if (!date) return t('frc_settings.integrations.sugarcrm.sync.never', 'Never')
    return new Date(date).toLocaleString()
  }

  // Collect all error messages from sync result
  const allErrors = React.useMemo(() => {
    if (!lastSyncResult) return []
    return lastSyncResult.modules.flatMap((m) => m.errorMessages || [])
  }, [lastSyncResult])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {t('frc_settings.integrations.sugarcrm.title', 'SugarCRM Integration')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('frc_settings.integrations.sugarcrm.description', 'Import customers, contacts, and opportunities from SugarCRM')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={config.credentials.configured ? (config.isEnabled ? 'default' : 'secondary') : 'destructive'}>
              {!config.credentials.configured
                ? t('frc_settings.integrations.sugarcrm.status.not_configured', 'Not Configured')
                : config.isEnabled
                  ? t('frc_settings.integrations.sugarcrm.status.enabled', 'Enabled')
                  : t('frc_settings.integrations.sugarcrm.status.disabled', 'Disabled')}
            </Badge>
            <Switch
              checked={config.isEnabled}
              onCheckedChange={handleToggleEnabled}
              disabled={saving || !config.credentials.configured}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6">
        {/* Not configured state */}
        {!config.credentials.configured ? (
          <Alert variant="destructive">
            <AlertTitle>
              {t('frc_settings.integrations.sugarcrm.env.title', 'Environment Variables Required')}
            </AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-2">
                {t(
                  'frc_settings.integrations.sugarcrm.env.description',
                  'SugarCRM credentials must be configured via environment variables. Add the following to your .env file:'
                )}
              </p>
              <ul className="list-disc list-inside space-y-1 font-mono text-xs">
                {config.credentials.missingVars.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Connection Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">
                {t('frc_settings.integrations.sugarcrm.connection.title', 'Connection')}
              </h4>
              <Alert>
                <AlertTitle>
                  {t('frc_settings.integrations.sugarcrm.env.configured', 'Credentials Configured')}
                </AlertTitle>
                <AlertDescription>
                  {t('frc_settings.integrations.sugarcrm.env.instance', 'Connected to:')}{' '}
                  <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                    {config.credentials.instanceUrl}
                  </code>
                </AlertDescription>
              </Alert>
              <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                {testing ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    {t('common.testing', 'Testing...')}
                  </>
                ) : (
                  t('frc_settings.integrations.sugarcrm.actions.test_connection', 'Test Connection')
                )}
              </Button>
            </div>

            {/* Modules & Sync Section (only when enabled) */}
            {config.isEnabled && (
              <>
                {/* Modules Section */}
                <div className="border-t pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      {t('frc_settings.integrations.sugarcrm.modules.title', 'Modules to Sync')}
                    </h4>
                    <Button variant="outline" size="sm" onClick={handleLoadModules} disabled={loadingModules}>
                      {loadingModules ? (
                        <>
                          <Spinner className="mr-2 h-3 w-3" />
                          {t('common.loading', 'Loading...')}
                        </>
                      ) : (
                        t('frc_settings.integrations.sugarcrm.actions.refresh_modules', 'Refresh Modules')
                      )}
                    </Button>
                  </div>

                  {/* Module Selection */}
                  <div className="space-y-2">
                    {/* Select All checkbox */}
                    <label className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2 cursor-pointer hover:bg-accent/50">
                      <Checkbox
                        checked={selectedModules.length === modules.length && modules.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-sm text-muted-foreground">
                        {selectedModules.length === modules.length
                          ? t('frc_settings.integrations.sugarcrm.modules.deselect_all', 'Deselect all')
                          : t('frc_settings.integrations.sugarcrm.modules.select_all', 'Select all')}
                      </span>
                    </label>

                    {/* Module list */}
                    {modules.map((module) => (
                      <label
                        key={module.name}
                        className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:border-primary/40 transition-colors"
                      >
                        <Checkbox
                          checked={selectedModules.includes(module.name)}
                          onCheckedChange={() => handleToggleModule(module.name)}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{module.label}</span>
                          <span className="text-muted-foreground mx-2">→</span>
                          <span className="text-sm text-primary">{module.targetEntity}</span>
                        </div>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {module.description}
                        </span>
                      </label>
                    ))}
                  </div>

                  {!modulesLoaded && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'frc_settings.integrations.sugarcrm.modules.hint',
                        'Click "Refresh Modules" to fetch the latest module list from SugarCRM.'
                      )}
                    </p>
                  )}
                </div>

                {/* Sync Section */}
                <div className="border-t pt-6 space-y-4">
                  <h4 className="text-sm font-semibold">
                    {t('frc_settings.integrations.sugarcrm.sync.title', 'Synchronization')}
                  </h4>

                  {/* Last sync info */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {t('frc_settings.integrations.sugarcrm.sync.last_sync', 'Last Sync')}:
                    </span>
                    <span>{formatSyncDate(config.lastSyncAt)}</span>
                    {config.lastSyncStatus && (
                      <Badge variant={config.lastSyncStatus === 'success' ? 'default' : 'destructive'}>
                        {config.lastSyncStatus === 'success'
                          ? t('frc_settings.integrations.sugarcrm.sync.success', 'Completed')
                          : t('frc_settings.integrations.sugarcrm.sync.error', 'Failed')}
                      </Badge>
                    )}
                  </div>

                  {/* Max records per module */}
                  <div className="flex items-center gap-3">
                    <Label htmlFor="maxRecords" className="text-sm text-muted-foreground whitespace-nowrap">
                      {t('frc_settings.integrations.sugarcrm.sync.max_records', 'Max records per module')}:
                    </Label>
                    <Input
                      id="maxRecords"
                      type="number"
                      min="1"
                      placeholder={t('frc_settings.integrations.sugarcrm.sync.no_limit', 'No limit')}
                      value={maxRecordsPerModule}
                      onChange={(e) => setMaxRecordsPerModule(e.target.value)}
                      className="w-32"
                      disabled={syncing}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t('frc_settings.integrations.sugarcrm.sync.max_records_hint', 'Leave empty for all records')}
                    </span>
                  </div>

                  {/* Sync buttons */}
                  <div className="flex gap-3">
                    <Button onClick={handleSyncSelected} disabled={syncing || selectedModules.length === 0}>
                      {syncing ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          {t('frc_settings.integrations.sugarcrm.sync.in_progress', 'Syncing...')}
                        </>
                      ) : (
                        t('frc_settings.integrations.sugarcrm.actions.sync_selected', `Sync Selected (${selectedModules.length})`)
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleSyncAll} disabled={syncing}>
                      {syncing ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          {t('frc_settings.integrations.sugarcrm.sync.in_progress', 'Syncing...')}
                        </>
                      ) : (
                        t('frc_settings.integrations.sugarcrm.actions.sync_all', 'Sync All')
                      )}
                    </Button>
                  </div>

                  {/* Sync Results */}
                  {lastSyncResult && (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-lg border overflow-hidden">
                        <div className="bg-muted/50 px-4 py-2 border-b">
                          <h5 className="text-sm font-medium">
                            {t('frc_settings.integrations.sugarcrm.sync.results', 'Last Sync Results')}
                          </h5>
                          <p className="text-xs text-muted-foreground">
                            {t('frc_settings.integrations.sugarcrm.sync.duration', 'Duration')}: {lastSyncResult.durationMs}ms
                          </p>
                        </div>

                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead>{t('frc_settings.integrations.sugarcrm.sync.column.module', 'Module')}</TableHead>
                              <TableHead>{t('frc_settings.integrations.sugarcrm.sync.column.target', 'Target Entity')}</TableHead>
                              <TableHead className="text-right">{t('frc_settings.integrations.sugarcrm.sync.column.total', 'Total')}</TableHead>
                              <TableHead className="text-right">{t('frc_settings.integrations.sugarcrm.sync.column.created', 'Created')}</TableHead>
                              <TableHead className="text-right">{t('frc_settings.integrations.sugarcrm.sync.column.updated', 'Updated')}</TableHead>
                              <TableHead className="text-right">{t('frc_settings.integrations.sugarcrm.sync.column.skipped', 'Skipped')}</TableHead>
                              <TableHead className="text-right">{t('frc_settings.integrations.sugarcrm.sync.column.errors', 'Errors')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lastSyncResult.modules.map((m) => (
                              <TableRow key={m.moduleName}>
                                <TableCell className="font-medium">{m.moduleName}</TableCell>
                                <TableCell className="text-muted-foreground">{m.targetEntity}</TableCell>
                                <TableCell className="text-right">{m.totalRecords}</TableCell>
                                <TableCell className="text-right text-green-600">{m.created}</TableCell>
                                <TableCell className="text-right text-blue-600">{m.updated}</TableCell>
                                <TableCell className="text-right text-yellow-600">{m.skipped}</TableCell>
                                <TableCell className="text-right text-red-600">{m.errors}</TableCell>
                              </TableRow>
                            ))}
                            {/* Total row */}
                            <TableRow className="bg-muted/30 font-semibold">
                              <TableCell>{t('frc_settings.integrations.sugarcrm.sync.total', 'Total')}</TableCell>
                              <TableCell></TableCell>
                              <TableCell className="text-right">{lastSyncResult.statistics.totalRecords}</TableCell>
                              <TableCell className="text-right text-green-600">{lastSyncResult.statistics.created}</TableCell>
                              <TableCell className="text-right text-blue-600">{lastSyncResult.statistics.updated}</TableCell>
                              <TableCell className="text-right text-yellow-600">{lastSyncResult.statistics.skipped}</TableCell>
                              <TableCell className="text-right text-red-600">{lastSyncResult.statistics.errors}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>

                      {/* Error messages */}
                      {allErrors.length > 0 && (
                        <div className="rounded-md bg-destructive/10 p-4">
                          <p className="text-sm font-medium text-destructive mb-2">
                            {t('frc_settings.integrations.sugarcrm.sync.errors_occurred', `${allErrors.length} error(s) occurred`)}
                          </p>
                          <ul className="text-xs space-y-1 text-destructive/80">
                            {allErrors.slice(0, showAllErrors ? undefined : 5).map((err, idx) => (
                              <li key={idx} className="font-mono">
                                • {err}
                              </li>
                            ))}
                          </ul>
                          {allErrors.length > 5 && !showAllErrors && (
                            <Button
                              variant="link"
                              size="sm"
                              className="text-destructive p-0 h-auto mt-2"
                              onClick={() => setShowAllErrors(true)}
                            >
                              {t('frc_settings.integrations.sugarcrm.sync.show_all_errors', `Show all ${allErrors.length} errors`)}
                            </Button>
                          )}
                          {showAllErrors && allErrors.length > 5 && (
                            <Button
                              variant="link"
                              size="sm"
                              className="text-destructive p-0 h-auto mt-2"
                              onClick={() => setShowAllErrors(false)}
                            >
                              {t('frc_settings.integrations.sugarcrm.sync.show_less', 'Show less')}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
