'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@open-mercato/ui/primitives/tabs'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Switch } from '@open-mercato/ui/primitives/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import { Save, Plus, Pencil, Trash2, Zap, Shield, FileKey, KeyRound, Radio, ChevronLeft, ChevronRight } from 'lucide-react'

// ========================================
// Shared styles
// ========================================

const selectClassName = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
const selectSmClassName = 'flex h-9 w-[200px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

// ========================================
// Configuration Tab
// ========================================

interface KsefSettingsData {
  ksefEnvironment: string
  ksefAutoSubmit: boolean
  ksefSessionMode: string
  offlineMode: string
}

function ConfigurationTab() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<KsefSettingsData | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await apiCall<KsefSettingsData>('/api/invoicing/settings')
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
    const result = await apiCall<KsefSettingsData>('/api/invoicing/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        ksefEnvironment: settings.ksefEnvironment,
        ksefAutoSubmit: settings.ksefAutoSubmit,
        ksefSessionMode: settings.ksefSessionMode,
        offlineMode: settings.offlineMode,
      }),
    })
    if (result.ok) {
      flash(t('invoicing.settings.saved', 'Settings saved'), 'success')
    } else {
      flash(t('invoicing.settings.saveFailed', 'Failed to save settings'), 'error')
    }
    setSaving(false)
  }

  const updateField = <K extends keyof KsefSettingsData>(field: K, value: KsefSettingsData[K]) => {
    setSettings((prev) => prev ? { ...prev, [field]: value } : prev)
  }

  if (loading) return <LoadingMessage label="Loading settings..." />
  if (error) return <ErrorMessage label={error} />
  if (!settings) return null

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>{t('invoicing.settings.environment', 'KSeF Environment')}</Label>
          <select className={selectSmClassName} value={settings.ksefEnvironment} onChange={(e) => updateField('ksefEnvironment', e.target.value)}>
            <option value="test">{t('invoicing.settings.environment.test', 'Test')}</option>
            <option value="demo">{t('invoicing.settings.environment.demo', 'Demo')}</option>
            <option value="production">{t('invoicing.settings.environment.production', 'Production')}</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label>{t('invoicing.settings.sessionMode', 'Session mode')}</Label>
          <select className={selectSmClassName} value={settings.ksefSessionMode} onChange={(e) => updateField('ksefSessionMode', e.target.value)}>
            <option value="interactive">{t('invoicing.settings.sessionMode.interactive', 'Interactive')}</option>
            <option value="batch">{t('invoicing.settings.sessionMode.batch', 'Batch')}</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label>{t('invoicing.settings.offlineMode', 'Offline mode')}</Label>
          <select className={selectSmClassName} value={settings.offlineMode} onChange={(e) => updateField('offlineMode', e.target.value)}>
            <option value="online">{t('invoicing.settings.offlineMode.online', 'Online')}</option>
            <option value="offline24">{t('invoicing.settings.offlineMode.offline24', 'Offline 24h')}</option>
            <option value="unavailability">{t('invoicing.settings.offlineMode.unavailability', 'Unavailability')}</option>
            <option value="emergency">{t('invoicing.settings.offlineMode.emergency', 'Emergency')}</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={settings.ksefAutoSubmit} onCheckedChange={(checked) => updateField('ksefAutoSubmit', checked)} />
          <div>
            <Label>{t('invoicing.settings.autoSubmit', 'Auto-submit approved invoices')}</Label>
            <p className="text-xs text-muted-foreground">{t('invoicing.settings.autoSubmit.description', 'Automatically queue approved invoices for KSeF submission')}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button onClick={saveSettings} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}

// ========================================
// Credentials Tab
// ========================================

interface Credential {
  id: string
  nip: string
  authType: 'token' | 'certificate'
  environment: 'test' | 'demo' | 'production'
  isActive: boolean
  label: string | null
  lastUsedAt: string | null
  createdAt: string
  hasToken: boolean
  hasCertificate: boolean
}

interface CredentialForm {
  nip: string
  authType: 'token' | 'certificate'
  environment: 'test' | 'demo' | 'production'
  label: string
  ksefToken: string
  certificatePem: string
  privateKeyPem: string
  isActive: boolean
}

type CredentialDialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; credential: Credential }

const emptyForm: CredentialForm = {
  nip: '',
  authType: 'token',
  environment: 'test',
  label: '',
  ksefToken: '',
  certificatePem: '',
  privateKeyPem: '',
  isActive: true,
}

const envColors: Record<string, string> = {
  test: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  demo: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  production: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function CredentialsTab() {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [dialog, setDialog] = useState<CredentialDialogState>({ mode: 'closed' })
  const [form, setForm] = useState<CredentialForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const loadCredentials = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await apiCall<{ items: Credential[] }>('/api/invoicing/credentials')
    if (result.ok && result.result) {
      setCredentials(result.result.items)
    } else {
      setError('Failed to load credentials')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  const openCreate = () => {
    setForm(emptyForm)
    setDialog({ mode: 'create' })
  }

  const openEdit = (cred: Credential) => {
    setForm({
      nip: cred.nip,
      authType: cred.authType,
      environment: cred.environment,
      label: cred.label ?? '',
      ksefToken: '',
      certificatePem: '',
      privateKeyPem: '',
      isActive: cred.isActive,
    })
    setDialog({ mode: 'edit', credential: cred })
  }

  const closeDialog = () => setDialog({ mode: 'closed' })

  const handleSubmit = async () => {
    setSubmitting(true)
    if (dialog.mode === 'create') {
      const body: Record<string, unknown> = {
        nip: form.nip,
        authType: form.authType,
        environment: form.environment,
        label: form.label || null,
      }
      if (form.authType === 'token' && form.ksefToken) body.ksefToken = form.ksefToken
      if (form.authType === 'certificate') {
        if (form.certificatePem) body.certificatePem = form.certificatePem
        if (form.privateKeyPem) body.privateKeyPem = form.privateKeyPem
      }

      const result = await apiCall('/api/invoicing/credentials', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (result.ok) {
        flash(t('invoicing.credentials.created', 'Credential created'), 'success')
        closeDialog()
        loadCredentials()
      } else {
        flash('Failed to create credential', 'error')
      }
    } else if (dialog.mode === 'edit') {
      const body: Record<string, unknown> = {
        label: form.label || null,
        isActive: form.isActive,
        environment: form.environment,
      }
      if (form.ksefToken) body.ksefToken = form.ksefToken
      if (form.certificatePem) body.certificatePem = form.certificatePem
      if (form.privateKeyPem) body.privateKeyPem = form.privateKeyPem

      const result = await apiCall(`/api/invoicing/credentials/${dialog.credential.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      if (result.ok) {
        flash(t('invoicing.credentials.updated', 'Credential updated'), 'success')
        closeDialog()
        loadCredentials()
      } else {
        flash('Failed to update credential', 'error')
      }
    }
    setSubmitting(false)
  }

  const handleDelete = async (cred: Credential) => {
    const confirmed = await confirm({
      title: t('invoicing.credentials.deleteConfirm', `Delete credential for NIP ${cred.nip}?`).replace('{nip}', cred.nip),
      text: t('invoicing.credentials.deleteDescription', 'This action cannot be undone.'),
      variant: 'destructive',
    })
    if (!confirmed) return

    const result = await apiCall(`/api/invoicing/credentials/${cred.id}`, { method: 'DELETE' })
    if (result.ok) {
      flash(t('invoicing.credentials.deleted', 'Credential deleted'), 'success')
      loadCredentials()
    } else {
      flash('Failed to delete credential', 'error')
    }
  }

  const handleTest = async (cred: Credential) => {
    const result = await apiCall<{ success: boolean; message: string }>(`/api/invoicing/credentials/${cred.id}/test`, {
      method: 'POST',
    })
    if (result.ok && result.result?.success) {
      flash(t('invoicing.credentials.testSuccess', 'Connection test passed'), 'success')
    } else {
      flash(result.result?.message ?? t('invoicing.credentials.testFailed', 'Connection test failed'), 'error')
    }
  }

  const updateForm = <K extends keyof CredentialForm>(field: K, value: CredentialForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{t('invoicing.credentials.description', 'Manage authentication credentials for KSeF API access')}</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {t('invoicing.credentials.add', 'Add Credential')}
        </Button>
      </div>

      {loading && <LoadingMessage label="Loading credentials..." />}
      {error && <ErrorMessage label={error} />}

      {!loading && !error && credentials.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <KeyRound className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('invoicing.credentials.empty', 'No credentials configured')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('invoicing.credentials.emptyDescription', 'Add a KSeF credential to start submitting invoices')}</p>
        </div>
      )}

      {!loading && !error && credentials.length > 0 && (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('invoicing.credentials.label', 'Label')}</TableHead>
                <TableHead>{t('invoicing.credentials.nip', 'NIP')}</TableHead>
                <TableHead>{t('invoicing.credentials.authType', 'Auth Type')}</TableHead>
                <TableHead>{t('invoicing.credentials.environment', 'Environment')}</TableHead>
                <TableHead className="text-center">{t('invoicing.credentials.active', 'Active')}</TableHead>
                <TableHead>{t('invoicing.credentials.lastUsed', 'Last Used')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((cred) => (
                <TableRow key={cred.id}>
                  <TableCell className="font-medium">{cred.label || '-'}</TableCell>
                  <TableCell className="font-mono text-sm">{cred.nip}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs">
                      {cred.authType === 'token' ? <Shield className="h-3 w-3" /> : <FileKey className="h-3 w-3" />}
                      {cred.authType === 'token'
                        ? t('invoicing.credentials.authType.token', 'Token')
                        : t('invoicing.credentials.authType.certificate', 'Certificate')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${envColors[cred.environment] ?? ''}`}>
                      {cred.environment}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-block h-2 w-2 rounded-full ${cred.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(cred.lastUsedAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTest(cred)} title={t('invoicing.credentials.testConnection', 'Test')}>
                        <Zap className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cred)} title={t('invoicing.credentials.edit', 'Edit')}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(cred)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialog.mode !== 'closed'} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="sm:max-w-lg"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog.mode === 'create'
                ? t('invoicing.credentials.add', 'Add Credential')
                : t('invoicing.credentials.edit', 'Edit Credential')}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {dialog.mode === 'create' && (
              <div className="grid gap-2">
                <Label>{t('invoicing.credentials.nip', 'NIP')}</Label>
                <Input value={form.nip} onChange={(e) => updateForm('nip', e.target.value)} placeholder="0000000000" className="font-mono" />
              </div>
            )}

            <div className="grid gap-2">
              <Label>{t('invoicing.credentials.label', 'Label')}</Label>
              <Input value={form.label} onChange={(e) => updateForm('label', e.target.value)} placeholder="e.g. Main company credential" />
            </div>

            {dialog.mode === 'create' && (
              <div className="grid gap-2">
                <Label>{t('invoicing.credentials.authType', 'Auth Type')}</Label>
                <select className={selectClassName} value={form.authType} onChange={(e) => updateForm('authType', e.target.value as 'token' | 'certificate')}>
                  <option value="token">{t('invoicing.credentials.authType.token', 'Token')}</option>
                  <option value="certificate">{t('invoicing.credentials.authType.certificate', 'Certificate')}</option>
                </select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>{t('invoicing.credentials.environment', 'Environment')}</Label>
              <select className={selectClassName} value={form.environment} onChange={(e) => updateForm('environment', e.target.value as 'test' | 'demo' | 'production')}>
                <option value="test">Test</option>
                <option value="demo">Demo</option>
                <option value="production">Production</option>
              </select>
            </div>

            {(form.authType === 'token' || (dialog.mode === 'edit' && credentials.find((c) => c.id === (dialog as { credential: Credential }).credential?.id)?.authType === 'token')) && (
              <div className="grid gap-2">
                <Label>{t('invoicing.credentials.token', 'KSeF Token')}</Label>
                <Textarea
                  value={form.ksefToken}
                  onChange={(e) => updateForm('ksefToken', e.target.value)}
                  placeholder={dialog.mode === 'edit' ? 'Leave empty to keep existing' : 'Paste KSeF authorization token'}
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
            )}

            {(form.authType === 'certificate' || (dialog.mode === 'edit' && credentials.find((c) => c.id === (dialog as { credential: Credential }).credential?.id)?.authType === 'certificate')) && (
              <>
                <div className="grid gap-2">
                  <Label>{t('invoicing.credentials.certificate', 'Certificate PEM')}</Label>
                  <Textarea
                    value={form.certificatePem}
                    onChange={(e) => updateForm('certificatePem', e.target.value)}
                    placeholder={dialog.mode === 'edit' ? 'Leave empty to keep existing' : 'Paste certificate in PEM format'}
                    rows={4}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t('invoicing.credentials.privateKey', 'Private Key PEM')}</Label>
                  <Textarea
                    value={form.privateKeyPem}
                    onChange={(e) => updateForm('privateKeyPem', e.target.value)}
                    placeholder={dialog.mode === 'edit' ? 'Leave empty to keep existing' : 'Paste private key in PEM format'}
                    rows={4}
                    className="font-mono text-xs"
                  />
                </div>
              </>
            )}

            {dialog.mode === 'edit' && (
              <div className="flex items-center gap-3">
                <Switch checked={form.isActive} onCheckedChange={(checked) => updateForm('isActive', checked)} />
                <Label>{t('invoicing.credentials.active', 'Active')}</Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : dialog.mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmDialogElement}
    </div>
  )
}

// ========================================
// Sessions Tab
// ========================================

interface KsefSession {
  id: string
  sessionType: string
  sessionStatus: string
  ksefReferenceNumber: string | null
  nip: string
  invoiceCount: number
  startedAt: string | null
  closedAt: string | null
  errorMessage: string | null
  createdAt: string
}

interface SessionsResponse {
  items: KsefSession[]
  total: number
  page: number
  totalPages: number
}

const statusStyles: Record<string, string> = {
  initializing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closing: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  closed: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function SessionsTab() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SessionsResponse | null>(null)
  const [page, setPage] = useState(1)

  const loadSessions = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    const result = await apiCall<SessionsResponse>(`/api/invoicing/ksef/sessions?page=${p}&limit=20`)
    if (result.ok && result.result) {
      setData(result.result)
    } else {
      setError('Failed to load sessions')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSessions(page)
  }, [loadSessions, page])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('invoicing.sessions.description', 'View active and past KSeF communication sessions')}</p>

      {loading && <LoadingMessage label="Loading sessions..." />}
      {error && <ErrorMessage label={error} />}

      {!loading && !error && data && data.items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Radio className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('invoicing.sessions.empty', 'No sessions yet')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('invoicing.sessions.emptyDescription', 'Sessions will appear here when invoices are submitted to KSeF')}</p>
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoicing.sessions.status', 'Status')}</TableHead>
                  <TableHead>{t('invoicing.sessions.type', 'Type')}</TableHead>
                  <TableHead>{t('invoicing.sessions.nip', 'NIP')}</TableHead>
                  <TableHead>{t('invoicing.sessions.referenceNumber', 'Reference')}</TableHead>
                  <TableHead className="text-right">{t('invoicing.sessions.invoiceCount', 'Invoices')}</TableHead>
                  <TableHead>{t('invoicing.sessions.startedAt', 'Started')}</TableHead>
                  <TableHead>{t('invoicing.sessions.closedAt', 'Closed')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[session.sessionStatus] ?? ''}`}>
                        {t(`invoicing.sessions.status.${session.sessionStatus}`, session.sessionStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{session.sessionType}</TableCell>
                    <TableCell className="font-mono text-sm">{session.nip}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {session.ksefReferenceNumber ? `${session.ksefReferenceNumber.slice(0, 16)}...` : '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{session.invoiceCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(session.startedAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(session.closedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages} ({data.total} sessions)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ========================================
// Main Page
// ========================================

export default function KsefSettingsPage() {
  const t = useT()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">{t('invoicing.settings.ksef.title', 'KSeF Integration')}</h3>
        <p className="text-sm text-muted-foreground">{t('invoicing.settings.ksef.description', 'Configure connection to the Polish National e-Invoice System (KSeF)')}</p>
      </div>

      <Tabs defaultValue="configuration">
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration">
          <ConfigurationTab />
        </TabsContent>

        <TabsContent value="credentials">
          <CredentialsTab />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
