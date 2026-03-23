'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
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
import { Plus, Pencil, Trash2, Zap, Shield, FileKey, KeyRound } from 'lucide-react'

const selectClassName = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

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

type DialogState =
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

export default function CredentialsSettingsPage() {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
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
            <h3 className="text-base font-semibold">{t('invoicing.credentials.title', 'KSeF Credentials')}</h3>
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
