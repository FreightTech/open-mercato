'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Save } from 'lucide-react'

interface InvoicingSettingsData {
  defaultSellerName: string | null
  defaultSellerNip: string | null
  defaultSellerAddress: string | null
  defaultSellerCountryCode: string | null
  defaultSellerBankAccount: string | null
  defaultPaymentMethod: string | null
  autoImportFromDocuments: boolean
  autoImportFromSales: boolean
}

const selectClassName = 'flex h-9 w-[200px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export default function GeneralSettingsPage() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<InvoicingSettingsData | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await apiCall<InvoicingSettingsData>('/api/invoicing/settings')
    if (result.ok && result.result) {
      setSettings(result.result)
    } else {
      setError('Failed to load settings')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    const result = await apiCall<InvoicingSettingsData>('/api/invoicing/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    })
    if (result.ok) {
      flash(t('invoicing.settings.saved', 'Settings saved'), 'success')
    } else {
      flash(t('invoicing.settings.saveFailed', 'Failed to save settings'), 'error')
    }
    setSaving(false)
  }

  const updateField = <K extends keyof InvoicingSettingsData>(field: K, value: InvoicingSettingsData[K]) => {
    setSettings((prev) => prev ? { ...prev, [field]: value } : prev)
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {loading && <LoadingMessage label="Loading settings..." />}
      {error && <ErrorMessage label={error} />}
      {!loading && !error && settings && (
        <>
          <section className="space-y-4">
            <div>
              <h3 className="text-base font-semibold">{t('invoicing.settings.company.title', 'Company Details (Seller)')}</h3>
              <p className="text-sm text-muted-foreground">{t('invoicing.settings.company.description', 'Default seller information pre-filled on new invoices')}</p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>{t('invoicing.settings.companyName', 'Company name')}</Label>
                <Input className="w-[400px]" value={settings.defaultSellerName ?? ''} onChange={(e) => updateField('defaultSellerName', e.target.value || null)} placeholder="Your Company Sp. z o.o." />
              </div>
              <div className="grid gap-2">
                <Label>{t('invoicing.settings.defaultSellerNip', 'NIP')}</Label>
                <Input className="w-[200px]" value={settings.defaultSellerNip ?? ''} onChange={(e) => updateField('defaultSellerNip', e.target.value || null)} placeholder="0000000000" />
              </div>
              <div className="grid gap-2">
                <Label>{t('invoicing.settings.companyAddress', 'Address')}</Label>
                <Input className="w-[400px]" value={settings.defaultSellerAddress ?? ''} onChange={(e) => updateField('defaultSellerAddress', e.target.value || null)} placeholder="ul. Przykładowa 1, 00-001 Warszawa" />
              </div>
              <div className="grid gap-2">
                <Label>{t('invoicing.settings.companyCountry', 'Country code')}</Label>
                <Input className="w-[80px]" value={settings.defaultSellerCountryCode ?? ''} onChange={(e) => updateField('defaultSellerCountryCode', e.target.value || null)} placeholder="PL" maxLength={2} />
              </div>
              <div className="grid gap-2">
                <Label>{t('invoicing.settings.companyBankAccount', 'Bank account')}</Label>
                <Input className="w-[400px]" value={settings.defaultSellerBankAccount ?? ''} onChange={(e) => updateField('defaultSellerBankAccount', e.target.value || null)} placeholder="PL00 0000 0000 0000 0000 0000 0000" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-base font-semibold">{t('invoicing.settings.defaults.title', 'Invoice Defaults')}</h3>
              <p className="text-sm text-muted-foreground">{t('invoicing.settings.defaults.description', 'Default values for new invoices')}</p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>{t('invoicing.settings.defaultPaymentMethod', 'Default payment method')}</Label>
                <select className={selectClassName} value={settings.defaultPaymentMethod ?? ''} onChange={(e) => updateField('defaultPaymentMethod', e.target.value || null)}>
                  <option value="">—</option>
                  <option value="przelew">Bank transfer (przelew)</option>
                  <option value="gotowka">Cash (gotówka)</option>
                  <option value="karta">Card (karta)</option>
                  <option value="kompensata">Compensation (kompensata)</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-base font-semibold">{t('invoicing.settings.import.title', 'Import Settings')}</h3>
              <p className="text-sm text-muted-foreground">{t('invoicing.settings.import.description', 'Automatic invoice import from other modules')}</p>
            </div>
            <div className="grid gap-4">
              <div className="flex items-center gap-3">
                <Switch checked={settings.autoImportFromDocuments} onCheckedChange={(checked) => updateField('autoImportFromDocuments', checked)} />
                <div>
                  <Label>{t('invoicing.settings.autoImportFromDocuments', 'Auto-import from documents')}</Label>
                  <p className="text-xs text-muted-foreground">{t('invoicing.settings.autoImportFromDocuments.description', 'Automatically create invoices from extracted document data')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={settings.autoImportFromSales} onCheckedChange={(checked) => updateField('autoImportFromSales', checked)} />
                <div>
                  <Label>{t('invoicing.settings.autoImportFromSales', 'Auto-import from sales')}</Label>
                  <p className="text-xs text-muted-foreground">{t('invoicing.settings.autoImportFromSales.description', 'Automatically create invoices from sales module invoices')}</p>
                </div>
              </div>
            </div>
          </section>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={saveSettings} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
