'use client'

import * as React from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'] as const

type BankAccount = {
  id: string
  bankName?: string | null
  iban?: string | null
  swiftBic?: string | null
  currencyCode: string
  isPrimary?: boolean
}

type ContractorBankAccountTableProps = {
  contractorId: string
  bankAccounts?: BankAccount[]
  onUpdated?: () => void
}

type FormData = {
  bankName: string
  iban: string
  swiftBic: string
  currencyCode: string
  isPrimary: boolean
}

const emptyForm: FormData = {
  bankName: '',
  iban: '',
  swiftBic: '',
  currencyCode: 'EUR',
  isPrimary: false,
}

export function ContractorBankAccountTable({
  contractorId,
  bankAccounts = [],
  onUpdated,
}: ContractorBankAccountTableProps) {
  const t = useT()
  const [isAdding, setIsAdding] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [formData, setFormData] = React.useState<FormData>(emptyForm)
  const [isSaving, setIsSaving] = React.useState(false)

  const startAdd = React.useCallback(() => {
    setFormData(emptyForm)
    setIsAdding(true)
    setEditingId(null)
  }, [])

  const startEdit = React.useCallback((account: BankAccount) => {
    setFormData({
      bankName: account.bankName ?? '',
      iban: account.iban ?? '',
      swiftBic: account.swiftBic ?? '',
      currencyCode: account.currencyCode,
      isPrimary: account.isPrimary ?? false,
    })
    setEditingId(account.id)
    setIsAdding(false)
  }, [])

  const cancelForm = React.useCallback(() => {
    setIsAdding(false)
    setEditingId(null)
    setFormData(emptyForm)
  }, [])

  const handleCreate = React.useCallback(async () => {
    setIsSaving(true)
    try {
      const response = await apiCall('/api/contractors/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          accounts: [{
            bankName: formData.bankName || null,
            iban: formData.iban || null,
            swiftBic: formData.swiftBic || null,
            currencyCode: formData.currencyCode || null,
            isPrimary: formData.isPrimary,
          }],
        }),
      })
      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to save'
        throw new Error(errorMsg)
      }
      flash(t('contractors.bankAccounts.saved', 'Bank account saved'), 'success')
      cancelForm()
      onUpdated?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [contractorId, formData, cancelForm, onUpdated, t])

  const handleUpdate = React.useCallback(async () => {
    if (!editingId) return
    setIsSaving(true)
    try {
      const response = await apiCall('/api/contractors/bank-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          bankName: formData.bankName || null,
          iban: formData.iban || null,
          swiftBic: formData.swiftBic || null,
          currencyCode: formData.currencyCode || null,
          isPrimary: formData.isPrimary,
        }),
      })
      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Update failed'
        throw new Error(errorMsg)
      }
      cancelForm()
      onUpdated?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed'
      flash(errorMessage, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [editingId, formData, cancelForm, onUpdated])

  const handleDelete = React.useCallback(async (accountId: string) => {
    try {
      const response = await apiCall(`/api/contractors/bank-accounts?id=${accountId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Delete failed'
        throw new Error(errorMsg)
      }
      onUpdated?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Delete failed'
      flash(errorMessage, 'error')
    }
  }, [onUpdated])

  const renderForm = (isNew: boolean) => (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('contractors.bankAccounts.bankName', 'Bank Name')}
          </label>
          <Input
            value={formData.bankName}
            onChange={(e) => setFormData(prev => ({ ...prev, bankName: e.target.value }))}
            className="h-8 text-sm"
            placeholder="Bank name"
            autoFocus
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('contractors.bankAccounts.iban', 'IBAN')}
          </label>
          <Input
            value={formData.iban}
            onChange={(e) => setFormData(prev => ({ ...prev, iban: e.target.value }))}
            className="h-8 text-sm"
            placeholder="PL61 1090 1014 0000 0712 1981 2874"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('contractors.bankAccounts.swift', 'SWIFT/BIC')}
          </label>
          <Input
            value={formData.swiftBic}
            onChange={(e) => setFormData(prev => ({ ...prev, swiftBic: e.target.value }))}
            className="h-8 text-sm"
            placeholder="BPKOPLPW"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('contractors.bankAccounts.currency', 'Currency')}
          </label>
          <select
            value={formData.currencyCode}
            onChange={(e) => setFormData(prev => ({ ...prev, currencyCode: e.target.value }))}
            className="h-8 w-full text-sm border rounded-md px-2 bg-background"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm h-8">
            <input
              type="checkbox"
              checked={formData.isPrimary}
              onChange={(e) => setFormData(prev => ({ ...prev, isPrimary: e.target.checked }))}
              className="rounded"
            />
            {t('contractors.bankAccounts.primary', 'Primary')}
          </label>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancelForm}
          disabled={isSaving}
          className="h-7 text-xs"
        >
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={isNew ? handleCreate : handleUpdate}
          disabled={isSaving}
          className="h-7 text-xs"
        >
          {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          {t('common.save', 'Save')}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t('contractors.bankAccounts.title', 'Bank Accounts')}</span>
          {bankAccounts.length > 0 && (
            <Badge variant="secondary" className="h-5 text-xs px-1.5 rounded-full">
              {bankAccounts.length}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startAdd}
          className="h-7 text-xs"
          disabled={isAdding}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t('contractors.bankAccounts.addAccount', 'Add Account')}
        </Button>
      </div>

      {/* Add form */}
      {isAdding && renderForm(true)}

      {/* Empty state */}
      {bankAccounts.length === 0 && !isAdding && (
        <div className="text-sm text-muted-foreground text-center py-6 border rounded-lg border-dashed">
          {t('contractors.bankAccounts.empty', 'No bank accounts')}
        </div>
      )}

      {/* Account cards */}
      {bankAccounts.map((account) => (
        <div key={account.id}>
          {editingId === account.id ? (
            renderForm(false)
          ) : (
            <div className="border rounded-lg p-3">
              {/* Bank name + badges + actions */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{account.bankName || '-'}</span>
                  {account.isPrimary && (
                    <Badge variant="default" className="h-5 text-xs bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
                      {t('contractors.bankAccounts.primaryBadge', 'Primary')}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(account)}
                    className="h-6 w-6 p-0"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(account.id)}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">IBAN</div>
                  <div className="font-mono text-xs">{account.iban || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">SWIFT/BIC</div>
                  <div className="font-mono text-xs">{account.swiftBic || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    {t('contractors.bankAccounts.currency', 'Currency')}
                  </div>
                  <div className="text-xs">{account.currencyCode}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
