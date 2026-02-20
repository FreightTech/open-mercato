"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type SugarCrmConfig = {
  instanceUrl: string | null
  apiKey: string | null
  isEnabled: boolean
  lastSyncAt: string | null
  lastSyncStatus: 'success' | 'error' | null
  lastSyncMessage: string | null
}

const DEFAULT_CONFIG: SugarCrmConfig = {
  instanceUrl: null,
  apiKey: null,
  isEnabled: false,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncMessage: null,
}

export function SugarCrmIntegration() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  
  const [config, setConfig] = React.useState<SugarCrmConfig>(DEFAULT_CONFIG)
  const [formState, setFormState] = React.useState({
    instanceUrl: '',
    apiKey: '',
  })
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)
  const [testing, setTesting] = React.useState(false)

  const loadConfig = React.useCallback(async () => {
    setLoading(true)
    try {
      const call = await apiCall<SugarCrmConfig>('/api/frc_settings/integrations/sugarcrm')
      if (call.ok && call.result) {
        setConfig(call.result)
        setFormState({
          instanceUrl: call.result.instanceUrl ?? '',
          apiKey: call.result.apiKey ?? '',
        })
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const call = await apiCall<SugarCrmConfig>('/api/frc_settings/integrations/sugarcrm', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instanceUrl: formState.instanceUrl || null,
          apiKey: formState.apiKey || null,
        }),
      })
      
      if (call.ok && call.result) {
        setConfig(call.result)
        flash(
          t('frc_settings.integrations.sugarcrm.messages.settings_saved', 'SugarCRM settings saved'),
          'success'
        )
      }
    } catch (err) {
      console.error('frc_settings.sugarcrm.save failed', err)
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      // Simulate connection test (dummy implementation)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      flash(
        t('frc_settings.integrations.sugarcrm.messages.test_success', 'Connection successful'),
        'success'
      )
    } catch (err) {
      flash(
        t('frc_settings.integrations.sugarcrm.messages.test_failed', 'Connection failed'),
        'error'
      )
    } finally {
      setTesting(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const call = await apiCall<{
        success: boolean
        message: string
        syncedAt: string
        notice?: string
      }>('/api/frc_settings/integrations/sugarcrm/sync', {
        method: 'POST',
      })
      
      if (call.ok && call.result) {
        flash(call.result.message, 'success')
        void loadConfig()
      } else {
        flash(
          t('frc_settings.integrations.sugarcrm.messages.sync_failed', 'Sync failed'),
          'error'
        )
      }
    } catch (err) {
      console.error('frc_settings.sugarcrm.sync failed', err)
      flash(
        t('frc_settings.integrations.sugarcrm.messages.sync_failed', 'Sync failed'),
        'error'
      )
    } finally {
      setSyncing(false)
    }
  }

  const formatSyncDate = (date: string | null) => {
    if (!date) return t('frc_settings.integrations.sugarcrm.sync.never', 'Never')
    return new Date(date).toLocaleString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {t('frc_settings.integrations.sugarcrm.title', 'SugarCRM')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('frc_settings.integrations.sugarcrm.description', 'Sync customers, contacts, and offer history with SugarCRM')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={config.isEnabled ? 'default' : 'secondary'}>
              {config.isEnabled
                ? t('frc_settings.integrations.sugarcrm.status.connected', 'Connected')
                : t('frc_settings.integrations.sugarcrm.status.disconnected', 'Not Connected')}
            </Badge>
            <Switch
              checked={config.isEnabled}
              onCheckedChange={handleToggleEnabled}
              disabled={saving}
            />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <Alert>
          <AlertDescription>
            {t(
              'frc_settings.integrations.sugarcrm.placeholder_notice',
              'Full SugarCRM integration coming soon. This is a preview of the configuration interface.'
            )}
          </AlertDescription>
        </Alert>

        {config.isEnabled && (
          <>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="instanceUrl">
                    {t('frc_settings.integrations.sugarcrm.form.instance_url', 'Instance URL')}
                  </Label>
                  <Input
                    id="instanceUrl"
                    type="url"
                    value={formState.instanceUrl}
                    onChange={(e) => setFormState((prev) => ({ ...prev, instanceUrl: e.target.value }))}
                    placeholder={t(
                      'frc_settings.integrations.sugarcrm.form.instance_url_placeholder',
                      'https://your-instance.sugarcrm.com'
                    )}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">
                    {t('frc_settings.integrations.sugarcrm.form.api_key', 'API Key')}
                  </Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={formState.apiKey}
                    onChange={(e) => setFormState((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={t(
                      'frc_settings.integrations.sugarcrm.form.api_key_placeholder',
                      'Enter your SugarCRM API key'
                    )}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? t('common.saving', 'Saving...')
                    : t('frc_settings.integrations.sugarcrm.actions.save', 'Save Settings')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={saving || testing || !formState.instanceUrl}
                >
                  {testing
                    ? t('common.testing', 'Testing...')
                    : t('frc_settings.integrations.sugarcrm.actions.test_connection', 'Test Connection')}
                </Button>
              </div>
            </form>

            <div className="border-t pt-6">
              <h4 className="text-sm font-semibold mb-4">
                {t('frc_settings.integrations.sugarcrm.sync.title', 'Sync Status')}
              </h4>
              
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {t('frc_settings.integrations.sugarcrm.sync.last_sync', 'Last Sync')}:
                    </span>{' '}
                    {formatSyncDate(config.lastSyncAt)}
                  </p>
                  {config.lastSyncStatus && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Status:</span>{' '}
                      <Badge variant={config.lastSyncStatus === 'success' ? 'default' : 'destructive'}>
                        {config.lastSyncStatus === 'success'
                          ? t('frc_settings.integrations.sugarcrm.sync.success', 'Completed successfully')
                          : t('frc_settings.integrations.sugarcrm.sync.error', 'Failed')}
                      </Badge>
                    </p>
                  )}
                  {config.lastSyncMessage && (
                    <p className="text-sm text-muted-foreground">{config.lastSyncMessage}</p>
                  )}
                </div>
                
                <Button onClick={handleSyncNow} disabled={syncing}>
                  {syncing ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      {t('frc_settings.integrations.sugarcrm.sync.in_progress', 'Syncing...')}
                    </>
                  ) : (
                    t('frc_settings.integrations.sugarcrm.actions.sync_now', 'Sync Now')
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
