'use client'

import * as React from 'react'
import { Pencil, Plus, Loader2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'] as const

type CreditLimit = {
  id: string
  creditLimit: string
  currencyCode: string
  isUnlimited: boolean
  paymentDays?: number
  currentExposure?: string
  notes?: string | null
}

type ContractorCreditLimitTableProps = {
  contractorId: string
  creditLimit?: CreditLimit | null
  onUpdated?: () => void
}

function formatCurrency(value: string | number | undefined, currency: string): string {
  const num = parseFloat(String(value) || '0')
  const symbols: Record<string, string> = { EUR: '\u20AC', USD: '$', PLN: 'z\u0142', GBP: '\u00A3', CHF: 'CHF ' }
  const symbol = symbols[currency] ?? currency + ' '
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function getUtilizationColor(percentage: number): string {
  if (percentage < 50) return 'bg-green-500'
  if (percentage < 80) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function ContractorCreditLimitTable({
  contractorId,
  creditLimit,
  onUpdated,
}: ContractorCreditLimitTableProps) {
  const t = useT()
  const [isEditing, setIsEditing] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [formData, setFormData] = React.useState({
    creditLimit: '',
    currencyCode: 'EUR',
    paymentDays: '',
    isUnlimited: false,
    notes: '',
  })

  const startEdit = React.useCallback(() => {
    if (creditLimit) {
      setFormData({
        creditLimit: creditLimit.creditLimit || '',
        currencyCode: creditLimit.currencyCode || 'EUR',
        paymentDays: creditLimit.paymentDays?.toString() ?? '',
        isUnlimited: creditLimit.isUnlimited,
        notes: creditLimit.notes ?? '',
      })
    } else {
      setFormData({
        creditLimit: '',
        currencyCode: 'EUR',
        paymentDays: '30',
        isUnlimited: false,
        notes: '',
      })
    }
    setIsEditing(true)
  }, [creditLimit])

  const handleSave = React.useCallback(async () => {
    setIsSaving(true)
    try {
      const response = await apiCall('/api/contractors/credit-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          creditLimit: formData.creditLimit || null,
          currencyCode: formData.currencyCode || null,
          paymentDays: formData.paymentDays ? parseInt(formData.paymentDays) : null,
          isUnlimited: formData.isUnlimited,
          notes: formData.notes || null,
        }),
      })
      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to save'
        throw new Error(errorMsg)
      }
      flash(t('contractors.credit.saved', 'Credit limit saved'), 'success')
      setIsEditing(false)
      onUpdated?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [contractorId, formData, onUpdated, t])

  // Empty state
  if (!creditLimit && !isEditing) {
    return (
      <div className="border rounded-lg border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          {t('contractors.credit.empty', 'No credit limit set')}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startEdit}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          {t('contractors.credit.setCreditLimit', 'Set Credit Limit')}
        </Button>
      </div>
    )
  }

  // Edit mode
  if (isEditing) {
    return (
      <div className="border rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {t('contractors.credit.limit', 'Credit Limit')}
            </label>
            <Input
              type="number"
              value={formData.creditLimit}
              onChange={(e) => setFormData(prev => ({ ...prev, creditLimit: e.target.value }))}
              className="h-8 text-sm"
              placeholder="50000"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {t('contractors.credit.currency', 'Currency')}
            </label>
            <select
              value={formData.currencyCode}
              onChange={(e) => setFormData(prev => ({ ...prev, currencyCode: e.target.value }))}
              className="h-8 w-full text-sm border rounded-md px-2 bg-background"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {t('contractors.credit.paymentDays', 'Payment Days')}
            </label>
            <Input
              type="number"
              value={formData.paymentDays}
              onChange={(e) => setFormData(prev => ({ ...prev, paymentDays: e.target.value }))}
              className="h-8 text-sm"
              placeholder="30"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm h-8">
              <input
                type="checkbox"
                checked={formData.isUnlimited}
                onChange={(e) => setFormData(prev => ({ ...prev, isUnlimited: e.target.checked }))}
                className="rounded"
              />
              {t('contractors.credit.unlimited', 'Unlimited')}
            </label>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('contractors.credit.notes', 'Notes')}
          </label>
          <Input
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="h-8 text-sm"
            placeholder={t('contractors.credit.notesPlaceholder', 'Optional notes...')}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
            className="h-7 text-xs"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-7 text-xs"
          >
            {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {t('common.save', 'Save')}
          </Button>
        </div>
      </div>
    )
  }

  // Display mode
  const limitNum = parseFloat(creditLimit!.creditLimit || '0')
  const exposureNum = parseFloat(creditLimit!.currentExposure || '0')
  const utilization = limitNum > 0 ? (exposureNum / limitNum) * 100 : 0
  const available = limitNum - exposureNum
  const currency = creditLimit!.currencyCode

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Header with edit button */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('contractors.credit.title', 'Credit Limit')}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={startEdit}
          className="h-6 w-6 p-0"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      {/* 4-column grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {t('contractors.credit.limit', 'Limit')}
          </div>
          <div className="text-lg font-semibold">
            {creditLimit!.isUnlimited ? t('contractors.credit.unlimitedLabel', 'Unlimited') : formatCurrency(creditLimit!.creditLimit, currency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {t('contractors.credit.currency', 'Currency')}
          </div>
          <div className="text-lg font-semibold">{currency}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {t('contractors.credit.terms', 'Terms')}
          </div>
          <div className="text-lg font-semibold">
            {creditLimit!.paymentDays ? `${creditLimit!.paymentDays} days` : '-'}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {t('contractors.credit.exposure', 'Exposure')}
          </div>
          <div className="text-lg font-semibold">{formatCurrency(creditLimit!.currentExposure, currency)}</div>
        </div>
      </div>

      {/* Utilization bar */}
      {!creditLimit!.isUnlimited && limitNum > 0 && (
        <div className="space-y-1">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getUtilizationColor(utilization)}`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{utilization.toFixed(1)}% utilized</span>
            <span>{formatCurrency(available, currency)} available</span>
          </div>
        </div>
      )}

      {/* Notes */}
      {creditLimit!.notes && (
        <div className="text-xs text-muted-foreground border-t pt-2">
          {creditLimit!.notes}
        </div>
      )}
    </div>
  )
}
