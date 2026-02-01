'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type ContractorCreditLimit = {
  id: string
  creditLimit: string
  currencyCode: string
  isUnlimited: boolean
  notes?: string | null
}

type ContractorCreditLimitDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractorId: string
  creditLimit?: ContractorCreditLimit | null
  onSaved?: () => void
}

const CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'] as const

export function ContractorCreditLimitDrawer({
  open,
  onOpenChange,
  contractorId,
  creditLimit,
  onSaved,
}: ContractorCreditLimitDrawerProps) {
  const t = useT()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formData, setFormData] = React.useState({
    creditLimit: '',
    currencyCode: 'USD',
    isUnlimited: false,
    notes: '',
  })

  // Reset form when drawer opens
  React.useEffect(() => {
    if (open) {
      if (creditLimit) {
        setFormData({
          creditLimit: creditLimit.creditLimit ?? '',
          currencyCode: creditLimit.currencyCode ?? 'USD',
          isUnlimited: creditLimit.isUnlimited ?? false,
          notes: creditLimit.notes ?? '',
        })
      } else {
        setFormData({
          creditLimit: '',
          currencyCode: 'USD',
          isUnlimited: false,
          notes: '',
        })
      }
    }
  }, [open, creditLimit])

  const handleSubmit = React.useCallback(async () => {
    if (!formData.isUnlimited && !formData.creditLimit) {
      flash(t('contractors.credit.validation.required', 'Credit limit is required when not unlimited'), 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await apiCall('/api/contractors/credit-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          creditLimit: formData.isUnlimited ? '0' : formData.creditLimit,
          currencyCode: formData.currencyCode,
          isUnlimited: formData.isUnlimited,
          notes: formData.notes || null,
        }),
      })

      if (response.ok) {
        flash(
          creditLimit
            ? t('contractors.credit.updated', 'Credit limit updated')
            : t('contractors.credit.created', 'Credit limit created'),
          'success'
        )
        onOpenChange(false)
        onSaved?.()
      } else {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to save credit limit'
        flash(errorMsg, 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Unknown error', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [contractorId, creditLimit, formData, onOpenChange, onSaved, t])

  const isEditing = !!creditLimit

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {isEditing
              ? t('contractors.credit.edit', 'Edit Credit Limit')
              : t('contractors.credit.add', 'Add Credit Limit')}
          </SheetTitle>
          <SheetDescription>
            {t('contractors.credit.description', 'Set the credit limit for this contractor')}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Unlimited Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="isUnlimited">
              {t('contractors.credit.unlimited', 'Unlimited Credit')}
            </Label>
            <Switch
              id="isUnlimited"
              checked={formData.isUnlimited}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isUnlimited: checked }))
              }
            />
          </div>

          {/* Credit Limit Amount */}
          {!formData.isUnlimited && (
            <div className="space-y-2">
              <Label htmlFor="creditLimit">
                {t('contractors.credit.amount', 'Credit Limit')}
              </Label>
              <Input
                id="creditLimit"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={formData.creditLimit}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, creditLimit: e.target.value }))
                }
              />
            </div>
          )}

          {/* Currency */}
          <div className="space-y-2">
            <Label htmlFor="currencyCode">
              {t('contractors.credit.currency', 'Currency')}
            </Label>
            <select
              id="currencyCode"
              value={formData.currencyCode}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, currencyCode: e.target.value }))
              }
              className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">
              {t('contractors.credit.notes', 'Notes')}
            </Label>
            <Textarea
              id="notes"
              placeholder={t('contractors.credit.notesPlaceholder', 'Optional notes about this credit limit...')}
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              className="min-h-[80px]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.save', 'Save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
