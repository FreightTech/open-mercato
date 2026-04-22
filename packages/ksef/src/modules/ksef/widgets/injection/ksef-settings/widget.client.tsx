"use client"

import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'

interface SyncSettings {
  syncEnabled: boolean
  syncIntervalMinutes: number
}

const intervalOptions = [
  { label: 'Every 15 minutes', value: 15 },
  { label: 'Every 30 minutes', value: 30 },
  { label: 'Every hour', value: 60 },
  { label: 'Every 6 hours', value: 360 },
  { label: 'Every 12 hours', value: 720 },
  { label: 'Every 24 hours', value: 1440 },
]

function getDefaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function getDefaultDateTo(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function KsefSettingsWidget(_props: InjectionWidgetComponentProps) {
  const scopeVersion = useOrganizationScopeVersion()
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [settings, setSettings] = React.useState<SyncSettings>({
    syncEnabled: false,
    syncIntervalMinutes: 60,
  })
  const [saveResult, setSaveResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  // Manual sync state
  const [fetchDateFrom, setFetchDateFrom] = React.useState(getDefaultDateFrom)
  const [fetchDateTo, setFetchDateTo] = React.useState(getDefaultDateTo)
  const [fetchLoading, setFetchLoading] = React.useState(false)
  const [fetchResult, setFetchResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setSettings({ syncEnabled: false, syncIntervalMinutes: 60 })
    setSaveResult(null)
    async function load() {
      const result = await apiCall<SyncSettings>('/api/ksef/settings')
      if (result.ok && result.result) {
        setSettings(result.result)
      }
      setLoading(false)
    }
    load()
  }, [scopeVersion])

  const handleSave = async () => {
    setSaving(true)
    setSaveResult(null)
    const result = await apiCall<SyncSettings & { message: string }>('/api/ksef/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
    setSaving(false)
    if (result.ok && result.result) {
      setSaveResult({ ok: true, message: result.result.message })
    } else {
      const errorBody = result.result as Record<string, unknown> | null
      const detail = errorBody?.error ?? errorBody?.details ?? 'Failed to save settings'
      setSaveResult({ ok: false, message: String(detail) })
    }
  }

  const handleFetch = async () => {
    setFetchLoading(true)
    setFetchResult(null)
    const result = await apiCall<{ message: string; nip: string }>('/api/ksef/sync-received', {
      method: 'POST',
      body: JSON.stringify({
        dateFrom: fetchDateFrom || undefined,
        dateTo: fetchDateTo || undefined,
      }),
    })
    setFetchLoading(false)
    if (result.ok && result.result) {
      setFetchResult({ ok: true, message: `Sync started for NIP ${result.result.nip}. Invoices will appear shortly.` })
    } else {
      setFetchResult({ ok: false, message: 'Failed to start sync' })
    }
  }

  if (loading) {
    return <LoadingMessage label="Loading KSeF settings…" />
  }

  return (
    <div className="space-y-8">
      {/* Automatic Sync Section */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Automatic Sync</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automatically fetch received invoices from KSeF on a recurring schedule.
          </p>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Enable automatic sync</label>
              <p className="text-xs text-muted-foreground">
                When enabled, received invoices will be fetched from KSeF at the configured interval.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.syncEnabled}
              onClick={() => setSettings((s) => ({ ...s, syncEnabled: !s.syncEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                settings.syncEnabled ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  settings.syncEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {settings.syncEnabled && (
            <div>
              <label className="block text-sm font-medium mb-1">Sync interval</label>
              <select
                value={settings.syncIntervalMinutes}
                onChange={(e) => setSettings((s) => ({ ...s, syncIntervalMinutes: Number(e.target.value) }))}
                className="w-full max-w-xs rounded-md border px-3 py-1.5 text-sm bg-background"
              >
                {intervalOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {saveResult && (
              <span className={`text-sm ${saveResult.ok ? 'text-green-700' : 'text-red-600'}`}>
                {saveResult.message}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Manual Sync Section */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Manual Sync</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fetch invoices from KSeF for a specific date range. Useful for importing past invoices.
          </p>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date from</label>
              <input
                type="date"
                value={fetchDateFrom}
                onChange={(e) => setFetchDateFrom(e.target.value)}
                className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date to</label>
              <input
                type="date"
                value={fetchDateTo}
                onChange={(e) => setFetchDateTo(e.target.value)}
                className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={fetchLoading}
              onClick={handleFetch}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {fetchLoading ? 'Starting…' : 'Fetch invoices'}
            </button>
            {fetchResult && (
              <span className={`text-sm ${fetchResult.ok ? 'text-green-700' : 'text-red-600'}`}>
                {fetchResult.message}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
