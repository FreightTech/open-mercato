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
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Separator } from '@open-mercato/ui/primitives/separator'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type ContractorPaymentTerms = {
  id: string
  paymentDays: number
  paymentMethod?: string | null
  currencyCode: string
  bankName?: string | null
  bankAccountNumber?: string | null
  bankRoutingNumber?: string | null
  iban?: string | null
  swiftBic?: string | null
  notes?: string | null
}

type ContractorPaymentTermsDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractorId: string
  paymentTerms?: ContractorPaymentTerms | null
  onSaved?: () => void
}

const CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'] as const
const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
] as const

export function ContractorPaymentTermsDrawer({
  open,
  onOpenChange,
  contractorId,
  paymentTerms,
  onSaved,
}: ContractorPaymentTermsDrawerProps) {
  const t = useT()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formData, setFormData] = React.useState({
    paymentDays: 30,
    paymentMethod: '' as string,
    currencyCode: 'USD',
    bankName: '',
    bankAccountNumber: '',
    bankRoutingNumber: '',
    iban: '',
    swiftBic: '',
    notes: '',
  })

  // Reset form when drawer opens
  React.useEffect(() => {
    if (open) {
      if (paymentTerms) {
        setFormData({
          paymentDays: paymentTerms.paymentDays ?? 30,
          paymentMethod: paymentTerms.paymentMethod ?? '',
          currencyCode: paymentTerms.currencyCode ?? 'USD',
          bankName: paymentTerms.bankName ?? '',
          bankAccountNumber: paymentTerms.bankAccountNumber ?? '',
          bankRoutingNumber: paymentTerms.bankRoutingNumber ?? '',
          iban: paymentTerms.iban ?? '',
          swiftBic: paymentTerms.swiftBic ?? '',
          notes: paymentTerms.notes ?? '',
        })
      } else {
        setFormData({
          paymentDays: 30,
          paymentMethod: '',
          currencyCode: 'USD',
          bankName: '',
          bankAccountNumber: '',
          bankRoutingNumber: '',
          iban: '',
          swiftBic: '',
          notes: '',
        })
      }
    }
  }, [open, paymentTerms])

  const handleSubmit = React.useCallback(async () => {
    setIsSubmitting(true)
    try {
      const response = await apiCall('/api/contractors/payment-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          paymentDays: formData.paymentDays,
          paymentMethod: formData.paymentMethod || null,
          currencyCode: formData.currencyCode,
          bankName: formData.bankName || null,
          bankAccountNumber: formData.bankAccountNumber || null,
          bankRoutingNumber: formData.bankRoutingNumber || null,
          iban: formData.iban || null,
          swiftBic: formData.swiftBic || null,
          notes: formData.notes || null,
        }),
      })

      if (response.ok) {
        flash(
          paymentTerms
            ? t('contractors.bank.updated', 'Payment terms updated')
            : t('contractors.bank.created', 'Payment terms created'),
          'success'
        )
        onOpenChange(false)
        onSaved?.()
      } else {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to save payment terms'
        flash(errorMsg, 'error')
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Unknown error', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [contractorId, paymentTerms, formData, onOpenChange, onSaved, t])

  const isEditing = !!paymentTerms

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing
              ? t('contractors.bank.edit', 'Edit Payment Terms')
              : t('contractors.bank.add', 'Add Payment Terms')}
          </SheetTitle>
          <SheetDescription>
            {t('contractors.bank.description', 'Configure payment terms and bank details')}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Payment Terms Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t('contractors.bank.paymentTermsSection', 'Payment Terms')}
            </h4>

            {/* Payment Days */}
            <div className="space-y-2">
              <Label htmlFor="paymentDays">
                {t('contractors.bank.paymentDays', 'Payment Days')}
              </Label>
              <Input
                id="paymentDays"
                type="number"
                min="0"
                max="365"
                value={formData.paymentDays}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, paymentDays: parseInt(e.target.value) || 0 }))
                }
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">
                {t('contractors.bank.paymentMethod', 'Payment Method')}
              </Label>
              <select
                id="paymentMethod"
                value={formData.paymentMethod}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, paymentMethod: e.target.value }))
                }
                className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{t('common.select', 'Select...')}</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label htmlFor="currencyCode">
                {t('contractors.bank.currency', 'Currency')}
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
          </div>

          <Separator />

          {/* Bank Details Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t('contractors.bank.bankDetailsSection', 'Bank Details')}
            </h4>

            {/* Bank Name */}
            <div className="space-y-2">
              <Label htmlFor="bankName">
                {t('contractors.bank.bankName', 'Bank Name')}
              </Label>
              <Input
                id="bankName"
                placeholder={t('contractors.bank.bankNamePlaceholder', 'e.g., Bank of America')}
                value={formData.bankName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, bankName: e.target.value }))
                }
              />
            </div>

            {/* Account Number */}
            <div className="space-y-2">
              <Label htmlFor="bankAccountNumber">
                {t('contractors.bank.accountNumber', 'Account Number')}
              </Label>
              <Input
                id="bankAccountNumber"
                placeholder={t('contractors.bank.accountNumberPlaceholder', 'Bank account number')}
                value={formData.bankAccountNumber}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, bankAccountNumber: e.target.value }))
                }
              />
            </div>

            {/* Routing Number */}
            <div className="space-y-2">
              <Label htmlFor="bankRoutingNumber">
                {t('contractors.bank.routingNumber', 'Routing Number')}
              </Label>
              <Input
                id="bankRoutingNumber"
                placeholder={t('contractors.bank.routingNumberPlaceholder', 'Bank routing number')}
                value={formData.bankRoutingNumber}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, bankRoutingNumber: e.target.value }))
                }
              />
            </div>

            {/* IBAN */}
            <div className="space-y-2">
              <Label htmlFor="iban">
                {t('contractors.bank.iban', 'IBAN')}
              </Label>
              <Input
                id="iban"
                placeholder={t('contractors.bank.ibanPlaceholder', 'e.g., PL00 1234 5678 9012 3456 7890 1234')}
                value={formData.iban}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, iban: e.target.value }))
                }
              />
            </div>

            {/* SWIFT/BIC */}
            <div className="space-y-2">
              <Label htmlFor="swiftBic">
                {t('contractors.bank.swiftBic', 'SWIFT/BIC')}
              </Label>
              <Input
                id="swiftBic"
                placeholder={t('contractors.bank.swiftBicPlaceholder', 'e.g., BREXPLPW')}
                value={formData.swiftBic}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, swiftBic: e.target.value }))
                }
              />
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">
              {t('contractors.bank.notes', 'Notes')}
            </Label>
            <Textarea
              id="notes"
              placeholder={t('contractors.bank.notesPlaceholder', 'Optional notes about payment terms...')}
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
