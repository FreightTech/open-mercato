"use client"

import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'

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

const authTypeLabels: Record<string, string> = {
  token: 'Token',
  certificate: 'Certificate',
}

const environmentLabels: Record<string, string> = {
  test: 'Test',
  demo: 'Demo',
  production: 'Production',
}

const vatStatusStyles: Record<string, string> = {
  Czynny: 'bg-green-100 text-green-800',
  Zwolniony: 'bg-yellow-100 text-yellow-800',
  Niezarejestrowany: 'bg-red-100 text-red-800',
}

function filterPrimitiveCredentials(input: Record<string, unknown>): CredentialValues {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  return out as CredentialValues
}

export default function KsefCredentialsWidget(_props: InjectionWidgetComponentProps) {
  const scopeVersion = useOrganizationScopeVersion()
  const [loading, setLoading] = React.useState(true)
  const [credentials, setCredentials] = React.useState<CredentialValues>({})
  const [company, setCompany] = React.useState<CompanyProfile | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  // Form state
  const [formValues, setFormValues] = React.useState<CredentialValues>({
    nip: '',
    authType: 'token',
    ksefToken: '',
    certificatePem: '',
    privateKeyPem: '',
    environment: 'test',
  })

  const hasCredentials = Boolean(credentials.nip)

  React.useEffect(() => {
    setLoading(true)
    setCredentials({})
    setCompany(null)
    setFormValues({ nip: '', authType: 'token', ksefToken: '', certificatePem: '', privateKeyPem: '', environment: 'test' })
    setEditing(false)
    async function load() {
      const [credResult, companyResult] = await Promise.all([
        apiCall<{ credentials: CredentialValues }>('/api/integrations/ksef/credentials'),
        apiCall<{ profile: CompanyProfile | null }>('/api/ksef/company-profile'),
      ])
      if (credResult.ok && credResult.result?.credentials) {
        // Strip any non-primitive fields (e.g. legacy `company_profile` object
        // stored by earlier versions). The credentials schema only accepts
        // primitives, and the widget only edits primitive fields.
        const sanitized = filterPrimitiveCredentials(credResult.result.credentials as unknown as Record<string, unknown>)
        setCredentials(sanitized)
        setFormValues((prev) => ({ ...prev, ...sanitized }))
      }
      if (companyResult.ok && companyResult.result?.profile) {
        setCompany(companyResult.result.profile)
      }
      setLoading(false)
    }
    load()
  }, [scopeVersion])

  React.useEffect(() => {
    if (!hasCredentials) {
      setEditing(true)
    }
  }, [hasCredentials])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    const result = await apiCall<{ ok: boolean }>('/api/integrations/ksef/credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: formValues }),
    })
    setSaving(false)
    if (result.ok) {
      setCredentials(formValues)
      setEditing(false)
      // Auto-verify NIP if it's a valid 10-digit NIP
      if (formValues.nip && /^\d{10}$/.test(formValues.nip)) {
        setVerifying(true)
        const verifyResult = await apiCall<CompanyProfile>('/api/ksef/verify-nip', {
          method: 'POST',
          body: JSON.stringify({ nip: formValues.nip }),
        })
        setVerifying(false)
        if (verifyResult.ok && verifyResult.result) {
          setCompany(verifyResult.result)
        }
      }
    } else {
      setSaveError('Failed to save credentials')
    }
  }

  const handleRefreshCompany = async () => {
    if (!credentials.nip || !/^\d{10}$/.test(credentials.nip)) return
    setVerifying(true)
    const result = await apiCall<CompanyProfile>('/api/ksef/verify-nip', {
      method: 'POST',
      body: JSON.stringify({ nip: credentials.nip }),
    })
    setVerifying(false)
    if (result.ok && result.result) {
      setCompany(result.result)
    }
  }

  const handleRemove = async () => {
    if (!confirm('Are you sure you want to remove all KSeF credentials? This cannot be undone.')) return
    setRemoving(true)
    setSaveError(null)
    const result = await apiCall<{ ok: boolean }>('/api/integrations/ksef/credentials', {
      method: 'DELETE',
    })
    setRemoving(false)
    if (result.ok) {
      setCredentials({})
      setCompany(null)
      setFormValues({ nip: '', authType: 'token', ksefToken: '', certificatePem: '', privateKeyPem: '', environment: 'test' })
      setEditing(true)
    } else {
      setSaveError('Failed to remove credentials')
    }
  }

  const updateField = (key: keyof CredentialValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return <LoadingMessage label="Loading credentials…" />
  }

  // Summary view — credentials are configured
  if (hasCredentials && !editing) {
    return (
      <div className="space-y-4">
        {/* Company card */}
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2 min-w-0 flex-1">
              {company ? (
                <>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold truncate">{company.name}</h3>
                    {company.statusVat && (
                      <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium ${vatStatusStyles[company.statusVat] ?? 'bg-gray-100 text-gray-800'}`}>
                        VAT: {company.statusVat}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-mono">NIP: {company.nip}</span>
                    {company.regon && <span className="font-mono">REGON: {company.regon}</span>}
                    {company.krs && <span className="font-mono">KRS: {company.krs}</span>}
                  </div>
                  {(company.workingAddress ?? company.residenceAddress) && (
                    <p className="text-sm text-muted-foreground">{company.workingAddress ?? company.residenceAddress}</p>
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold">NIP: {credentials.nip}</h3>
                  <p className="text-sm text-muted-foreground">
                    Company data not yet verified.{' '}
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={handleRefreshCompany}
                      className="text-primary hover:underline"
                    >
                      {verifying ? 'Verifying…' : 'Verify now'}
                    </button>
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {company && (
                <button
                  type="button"
                  disabled={verifying}
                  onClick={handleRefreshCompany}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {verifying ? 'Verifying…' : 'Refresh'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              >
                Edit credentials
              </button>
            </div>
          </div>

          {/* Config summary badges */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
            <span className="inline-block px-2.5 py-1 rounded-md bg-muted text-xs font-medium">
              Auth: {authTypeLabels[credentials.authType ?? ''] ?? credentials.authType}
            </span>
            <span className="inline-block px-2.5 py-1 rounded-md bg-muted text-xs font-medium">
              Env: {environmentLabels[credentials.environment ?? ''] ?? credentials.environment}
            </span>
          </div>
        </div>

        {/* Bank accounts */}
        {company && company.accountNumbers.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Registered bank accounts</p>
            <div className="space-y-1">
              {company.accountNumbers.map((account) => (
                <p key={account} className="text-xs font-mono text-muted-foreground">{account}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Edit view — credential form
  return (
    <div className="space-y-4">
      {hasCredentials && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => { setFormValues({ ...credentials }); setEditing(false) }}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <section className="rounded-lg border bg-card p-6 space-y-5">
        {/* NIP */}
        <div>
          <label className="block text-sm font-medium mb-1">
            NIP (Tax ID) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formValues.nip ?? ''}
            onChange={(e) => updateField('nip', e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="1234567890"
            className="w-full rounded-md border px-3 py-2 text-sm bg-background font-mono"
            maxLength={10}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Polish Tax Identification Number (10 digits, no dashes).
          </p>
        </div>

        {/* Auth Type */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Authentication Type <span className="text-red-500">*</span>
          </label>
          <select
            value={formValues.authType ?? 'token'}
            onChange={(e) => updateField('authType', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          >
            <option value="token">Token</option>
            <option value="certificate">Certificate</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Token-based auth is simpler; certificate-based auth uses XAdES signatures.
          </p>
        </div>

        {/* Token (conditional) */}
        {formValues.authType === 'token' && (
          <div>
            <label className="block text-sm font-medium mb-1">KSeF Authorization Token</label>
            <input
              type="password"
              value={formValues.ksefToken ?? ''}
              onChange={(e) => updateField('ksefToken', e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Token generated in the KSeF web portal under Credentials management.
            </p>
          </div>
        )}

        {/* Certificate (conditional) */}
        {formValues.authType === 'certificate' && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Certificate (PEM)</label>
              <textarea
                value={formValues.certificatePem ?? ''}
                onChange={(e) => updateField('certificatePem', e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm bg-background font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                PEM-encoded X.509 certificate registered with KSeF.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Private Key (PEM)</label>
              <textarea
                value={formValues.privateKeyPem ?? ''}
                onChange={(e) => updateField('privateKeyPem', e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm bg-background font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                PEM-encoded private key matching the certificate above.
              </p>
            </div>
          </>
        )}

        {/* Environment */}
        <div>
          <label className="block text-sm font-medium mb-1">
            KSeF Environment <span className="text-red-500">*</span>
          </label>
          <select
            value={formValues.environment ?? 'test'}
            onChange={(e) => updateField('environment', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          >
            <option value="test">Test</option>
            <option value="demo">Demo</option>
            <option value="production">Production</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Use &quot;test&quot; for development, &quot;demo&quot; for pre-production, &quot;production&quot; for live invoices.
          </p>
        </div>

        {/* Save / Remove */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={saving || !formValues.nip}
            onClick={handleSave}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Credentials'}
          </button>
          {hasCredentials && (
            <>
              <button
                type="button"
                onClick={() => { setFormValues({ ...credentials }); setEditing(false) }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={handleRemove}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
              >
                {removing ? 'Removing…' : 'Remove Credentials'}
              </button>
            </>
          )}
          {saveError && (
            <span className="text-sm text-red-600">{saveError}</span>
          )}
        </div>
      </section>
    </div>
  )
}
