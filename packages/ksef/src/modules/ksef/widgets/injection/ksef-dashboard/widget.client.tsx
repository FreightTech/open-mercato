"use client"

import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'

// ── Types ──

interface CompanyProfile {
  nip: string
  name: string
  regon: string | null
  krs: string | null
  residenceAddress: string | null
  workingAddress: string | null
  statusVat: string | null
  accountNumbers: string[]
  verifiedAt: string
}

interface CredentialValues {
  nip?: string
  authType?: string
  ksefToken?: string
  certificatePem?: string
  privateKeyPem?: string
  environment?: string
}

interface IntegrationDetailContext {
  detail?: {
    state?: {
      isEnabled?: boolean
      lastHealthStatus?: string | null
      lastHealthCheckedAt?: string | null
    } | null
    hasCredentials?: boolean
  } | null
}

// ── Constants ──

const vatStatusStyles: Record<string, string> = {
  Czynny: 'bg-green-100 text-green-800',
  Zwolniony: 'bg-yellow-100 text-yellow-800',
  Niezarejestrowany: 'bg-red-100 text-red-800',
}

const healthStyles: Record<string, string> = {
  healthy: 'text-green-700',
  degraded: 'text-yellow-700',
  unhealthy: 'text-red-600',
}

// ── Component ──

export default function KsefDashboardWidget({ context }: InjectionWidgetComponentProps) {
  const ctx = context as IntegrationDetailContext
  const scopeVersion = useOrganizationScopeVersion()
  const [loading, setLoading] = React.useState(true)

  // Company & credentials
  const [company, setCompany] = React.useState<CompanyProfile | null>(null)
  const [credentials, setCredentials] = React.useState<CredentialValues>({})
  const [editingCredentials, setEditingCredentials] = React.useState(false)
  const [formValues, setFormValues] = React.useState<CredentialValues>({
    nip: '', authType: 'token', ksefToken: '', certificatePem: '', privateKeyPem: '', environment: 'test',
  })
  const [savingCreds, setSavingCreds] = React.useState(false)
  const [credError, setCredError] = React.useState<string | null>(null)
  const [verifying, setVerifying] = React.useState(false)
  const [editingCompany, setEditingCompany] = React.useState(false)
  const [companyForm, setCompanyForm] = React.useState({
    nip: '', name: '', regon: '', krs: '', workingAddress: '', statusVat: '', accountNumbers: '',
  })
  const [savingCompany, setSavingCompany] = React.useState(false)

  // Health & state
  const [checkingHealth, setCheckingHealth] = React.useState(false)
  const [localHealthStatus, setLocalHealthStatus] = React.useState<string | null>(null)
  const [localHealthCheckedAt, setLocalHealthCheckedAt] = React.useState<string | null>(null)
  const [isEnabled, setIsEnabled] = React.useState(false)
  const [togglingState, setTogglingState] = React.useState(false)

  // Stats
  const [totalInvoices, setTotalInvoices] = React.useState(0)

  const hasCredentials = Boolean(credentials.nip)

  React.useEffect(() => {
    setLoading(true)
    setCredentials({})
    setCompany(null)
    setFormValues({ nip: '', authType: 'token', ksefToken: '', certificatePem: '', privateKeyPem: '', environment: 'test' })
    setEditingCredentials(false)
    setTotalInvoices(0)
    async function load() {
      const [credResult, companyResult, invoicesResult] = await Promise.all([
        apiCall<{ credentials: CredentialValues }>('/api/integrations/ksef/credentials'),
        apiCall<{ profile: CompanyProfile | null }>('/api/ksef/company-profile'),
        apiCall<{ total: number }>('/api/ksef/invoices?limit=1'),
      ])
      if (credResult.ok && credResult.result?.credentials) {
        setCredentials(credResult.result.credentials)
        setFormValues((prev) => ({ ...prev, ...credResult.result!.credentials }))
      }
      if (companyResult.ok && companyResult.result?.profile) {
        setCompany(companyResult.result.profile)
      }
      if (invoicesResult.ok && invoicesResult.result) {
        setTotalInvoices(invoicesResult.result.total)
      }
      setIsEnabled(ctx.detail?.state?.isEnabled ?? false)
      setLoading(false)
    }
    load()
  }, [scopeVersion])

  React.useEffect(() => {
    if (!loading && !hasCredentials) setEditingCredentials(true)
  }, [loading, hasCredentials])

  // ── Handlers ──

  const handleSaveCredentials = async () => {
    setSavingCreds(true)
    setCredError(null)
    const result = await apiCall<{ ok: boolean }>('/api/integrations/ksef/credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: formValues }),
    })
    if (result.ok) {
      setCredentials(formValues)
      setEditingCredentials(false)
      // Auto-verify NIP
      if (formValues.nip && /^\d{10}$/.test(formValues.nip)) {
        setVerifying(true)
        const verifyResult = await apiCall<CompanyProfile>('/api/ksef/verify-nip', {
          method: 'POST',
          body: JSON.stringify({ nip: formValues.nip }),
        })
        setVerifying(false)
        if (verifyResult.ok && verifyResult.result) setCompany(verifyResult.result)
      }
    } else {
      setCredError('Failed to save credentials')
    }
    setSavingCreds(false)
  }

  const handleRefreshCompany = async () => {
    if (!credentials.nip || !/^\d{10}$/.test(credentials.nip)) return
    setVerifying(true)
    const result = await apiCall<CompanyProfile>('/api/ksef/verify-nip', {
      method: 'POST',
      body: JSON.stringify({ nip: credentials.nip }),
    })
    setVerifying(false)
    if (result.ok && result.result) setCompany(result.result)
  }

  const handleEditCompany = () => {
    setCompanyForm({
      nip: company?.nip ?? credentials.nip ?? '',
      name: company?.name ?? '',
      regon: company?.regon ?? '',
      krs: company?.krs ?? '',
      workingAddress: company?.workingAddress ?? company?.residenceAddress ?? '',
      statusVat: company?.statusVat ?? '',
      accountNumbers: (company?.accountNumbers ?? []).join('\n'),
    })
    setEditingCompany(true)
  }

  const handleSaveCompany = async () => {
    setSavingCompany(true)
    const result = await apiCall<CompanyProfile>('/api/ksef/company-profile', {
      method: 'PUT',
      body: JSON.stringify({
        nip: companyForm.nip,
        name: companyForm.name,
        regon: companyForm.regon || null,
        krs: companyForm.krs || null,
        workingAddress: companyForm.workingAddress || null,
        statusVat: companyForm.statusVat || null,
        accountNumbers: companyForm.accountNumbers.split('\n').map((s) => s.trim()).filter(Boolean),
      }),
    })
    setSavingCompany(false)
    if (result.ok && result.result) {
      setCompany(result.result)
      setEditingCompany(false)
    }
  }

  const handleHealthCheck = async () => {
    setCheckingHealth(true)
    const result = await apiCall<{ status: string }>('/api/integrations/ksef/health', { method: 'POST' })
    setCheckingHealth(false)
    if (result.ok && result.result) {
      setLocalHealthStatus(result.result.status)
      setLocalHealthCheckedAt(new Date().toISOString())
    }
  }

  const handleToggleEnabled = async (enabled: boolean) => {
    setTogglingState(true)
    const result = await apiCall<{ ok: boolean }>('/api/integrations/ksef/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: enabled }),
    })
    setTogglingState(false)
    if (result.ok) setIsEnabled(enabled)
  }

  const updateField = (key: keyof CredentialValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) return <LoadingMessage label="Loading KSeF…" />

  const healthStatus = localHealthStatus ?? ctx.detail?.state?.lastHealthStatus
  const healthCheckedAt = localHealthCheckedAt ?? ctx.detail?.state?.lastHealthCheckedAt

  return (
    <div className="space-y-6">
      {/* ── Status bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block w-2 h-2 rounded-full ${isEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="font-medium">{isEnabled ? 'Enabled' : 'Disabled'}</span>
          </div>
          <button type="button" role="switch" aria-checked={isEnabled} disabled={togglingState}
            onClick={() => handleToggleEnabled(!isEnabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${isEnabled ? 'bg-primary' : 'bg-input'}`}>
            <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow transition-transform ${isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          {healthStatus ? (
            <span className={`text-sm ${healthStyles[healthStatus] ?? 'text-muted-foreground'}`}>
              Health: {healthStatus}
              {healthCheckedAt && <span className="text-xs text-muted-foreground ml-1">({new Date(healthCheckedAt).toLocaleString()})</span>}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Health: not checked</span>
          )}
          <button type="button" disabled={checkingHealth} onClick={handleHealthCheck}
            className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50">
            {checkingHealth ? 'Checking…' : 'Check Health'}
          </button>
          <span className="text-sm text-muted-foreground">{totalInvoices} invoices</span>
        </div>
      </div>

      {/* ── Company Profile + Credentials ── */}
      <section className="rounded-lg border bg-card">
        {hasCredentials && !editingCredentials && editingCompany ? (
          /* Company edit form — full width */
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Company details</h3>
              <button type="button" onClick={() => setEditingCompany(false)}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Company name <span className="text-red-500">*</span></label>
                <input type="text" value={companyForm.name}
                  onChange={(e) => setCompanyForm((s) => ({ ...s, name: e.target.value }))}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">NIP</label>
                <input type="text" value={companyForm.nip} readOnly
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-muted font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">REGON</label>
                <input type="text" value={companyForm.regon}
                  onChange={(e) => setCompanyForm((s) => ({ ...s, regon: e.target.value }))}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">KRS</label>
                <input type="text" value={companyForm.krs}
                  onChange={(e) => setCompanyForm((s) => ({ ...s, krs: e.target.value }))}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <input type="text" value={companyForm.workingAddress}
                  onChange={(e) => setCompanyForm((s) => ({ ...s, workingAddress: e.target.value }))}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">VAT status</label>
                <select value={companyForm.statusVat}
                  onChange={(e) => setCompanyForm((s) => ({ ...s, statusVat: e.target.value }))}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background">
                  <option value="">Unknown</option>
                  <option value="Czynny">Czynny (active)</option>
                  <option value="Zwolniony">Zwolniony (exempt)</option>
                  <option value="Niezarejestrowany">Niezarejestrowany (unregistered)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Bank accounts (one per line)</label>
              <textarea value={companyForm.accountNumbers} rows={2}
                onChange={(e) => setCompanyForm((s) => ({ ...s, accountNumbers: e.target.value }))}
                className="w-full rounded-md border px-3 py-1.5 text-sm bg-background font-mono" />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={savingCompany || !companyForm.name} onClick={handleSaveCompany}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                {savingCompany ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingCompany(false)}
                className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : hasCredentials && !editingCredentials ? (
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1 min-w-0 flex-1">
                {company ? (
                  <>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold truncate">{company.name}</h3>
                      {company.statusVat && (
                        <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${vatStatusStyles[company.statusVat] ?? 'bg-gray-100 text-gray-800'}`}>
                          VAT: {company.statusVat}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono">NIP: {company.nip}</span>
                      {company.regon && <span className="font-mono">REGON: {company.regon}</span>}
                      {company.krs && <span className="font-mono">KRS: {company.krs}</span>}
                    </div>
                    {(company.workingAddress ?? company.residenceAddress) && (
                      <p className="text-xs text-muted-foreground">{company.workingAddress ?? company.residenceAddress}</p>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-semibold">NIP: {credentials.nip}</h3>
                    {verifying ? (
                      <p className="text-xs text-muted-foreground">Verifying company data…</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Company data not set.{' '}
                        <button type="button" onClick={handleRefreshCompany} className="text-primary hover:underline">Fetch from White List</button>
                        {' or '}
                        <button type="button" onClick={handleEditCompany} className="text-primary hover:underline">enter manually</button>
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {company && (
                  <>
                    <button type="button" disabled={verifying} onClick={handleRefreshCompany}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50">
                      {verifying ? 'Verifying…' : 'Refresh'}
                    </button>
                    <button type="button" onClick={handleEditCompany}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                      Edit company
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setEditingCredentials(true)}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                  Edit credentials
                </button>
              </div>
            </div>
            {/* Auth badges */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="px-2.5 py-1 rounded-md bg-muted text-xs font-medium">
                Auth: {credentials.authType === 'certificate' ? 'Certificate' : 'Token'}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-muted text-xs font-medium">
                Env: {credentials.environment === 'production' ? 'Production' : credentials.environment === 'demo' ? 'Demo' : 'Test'}
              </span>
            </div>
          </div>
        ) : (
          /* Credential edit form */
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{hasCredentials ? 'Edit Credentials' : 'Setup Credentials'}</h3>
              {hasCredentials && (
                <button type="button" onClick={() => { setFormValues({ ...credentials }); setEditingCredentials(false) }}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">Cancel</button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">NIP (Tax ID) <span className="text-red-500">*</span></label>
                <input type="text" value={formValues.nip ?? ''} onChange={(e) => updateField('nip', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="1234567890" className="w-full rounded-md border px-3 py-2 text-sm bg-background font-mono" maxLength={10} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Authentication Type <span className="text-red-500">*</span></label>
                <select value={formValues.authType ?? 'token'} onChange={(e) => updateField('authType', e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background">
                  <option value="token">Token</option>
                  <option value="certificate">Certificate</option>
                </select>
              </div>
            </div>
            {formValues.authType === 'token' && (
              <div>
                <label className="block text-sm font-medium mb-1">KSeF Authorization Token</label>
                <input type="password" value={formValues.ksefToken ?? ''} onChange={(e) => updateField('ksefToken', e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background" />
                <p className="text-xs text-muted-foreground mt-1">Token from the KSeF web portal.</p>
              </div>
            )}
            {formValues.authType === 'certificate' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Certificate (PEM)</label>
                  <textarea value={formValues.certificatePem ?? ''} onChange={(e) => updateField('certificatePem', e.target.value)}
                    rows={3} className="w-full rounded-md border px-3 py-2 text-sm bg-background font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Private Key (PEM)</label>
                  <textarea value={formValues.privateKeyPem ?? ''} onChange={(e) => updateField('privateKeyPem', e.target.value)}
                    rows={3} className="w-full rounded-md border px-3 py-2 text-sm bg-background font-mono" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">KSeF Environment <span className="text-red-500">*</span></label>
              <select value={formValues.environment ?? 'test'} onChange={(e) => updateField('environment', e.target.value)}
                className="w-full max-w-xs rounded-md border px-3 py-2 text-sm bg-background">
                <option value="test">Test</option>
                <option value="demo">Demo</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" disabled={savingCreds || !formValues.nip} onClick={handleSaveCredentials}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                {savingCreds ? 'Saving…' : 'Save Credentials'}
              </button>
              {credError && <span className="text-sm text-red-600">{credError}</span>}
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
