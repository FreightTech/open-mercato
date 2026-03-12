'use client'

import * as React from 'react'
import { Building2, Copy, Check, Pencil, Clock, Banknote, Plus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@open-mercato/ui/primitives/card'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

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

type ContractorBankAccountsCardProps = {
  paymentTerms?: ContractorPaymentTerms | null
  onAdd?: () => void
  onEdit?: () => void
}

export function ContractorBankAccountsCard({ paymentTerms, onAdd, onEdit }: ContractorBankAccountsCardProps) {
  const t = useT()
  const [copiedField, setCopiedField] = React.useState<string | null>(null)

  const copyToClipboard = React.useCallback(async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      flash(t('common.copied', 'Copied to clipboard'), 'success')
      setTimeout(() => setCopiedField(null), 2000)
    } catch (error) {
      flash(t('common.copyFailed', 'Failed to copy'), 'error')
    }
  }, [t])

  const maskAccountNumber = (number: string) => {
    if (number.length <= 4) return number
    return '••••' + number.slice(-4)
  }

  const formatPaymentMethod = (method: string | null | undefined) => {
    if (!method) return null
    const methods: Record<string, string> = {
      bank_transfer: 'Bank Transfer',
      card: 'Card',
      cash: 'Cash',
    }
    return methods[method] ?? method
  }

  if (!paymentTerms) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="flex items-center justify-between text-base font-medium">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {t('contractors.bank.title', 'Bank Account')}
            </span>
            {onAdd && (
              <Button variant="outline" size="sm" onClick={onAdd} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                {t('common.add', 'Add')}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="text-center py-6 text-muted-foreground text-sm">
            {t('contractors.bank.notConfigured', 'No bank account configured')}
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasIban = !!paymentTerms.iban
  const hasBankAccount = !!paymentTerms.bankAccountNumber
  const hasBankDetails = hasIban || hasBankAccount || !!paymentTerms.bankName

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between text-base font-medium">
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {t('contractors.bank.title', 'Bank Account')}
          </span>
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 text-xs">
              <Pencil className="h-3 w-3 mr-1" />
              {t('common.edit', 'Edit')}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-4">
          {/* Payment Terms */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded flex-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">
                  {t('contractors.bank.paymentTerms', 'Payment Terms')}
                </div>
                <div className="text-sm font-medium">
                  {paymentTerms.paymentDays} {t('contractors.bank.days', 'days')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded flex-1">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">
                  {t('contractors.bank.currency', 'Currency')}
                </div>
                <div className="text-sm font-medium">{paymentTerms.currencyCode}</div>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          {paymentTerms.paymentMethod && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t('contractors.bank.method', 'Method')}:
              </span>
              <Badge variant="outline" className="text-xs">
                {formatPaymentMethod(paymentTerms.paymentMethod)}
              </Badge>
            </div>
          )}

          {/* Bank Details */}
          {hasBankDetails && (
            <div className="border rounded-lg p-3 space-y-3">
              {/* Bank Name */}
              {paymentTerms.bankName && (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">
                    {t('contractors.bank.bankName', 'Bank Name')}
                  </div>
                  <div className="text-sm font-medium">{paymentTerms.bankName}</div>
                </div>
              )}

              {/* Account Number */}
              {hasBankAccount && (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {t('contractors.bank.accountNumber', 'Account Number')}
                    </div>
                    <div className="text-sm font-mono">
                      {maskAccountNumber(paymentTerms.bankAccountNumber!)}
                    </div>
                  </div>
                </div>
              )}

              {/* IBAN */}
              {hasIban && (
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {t('contractors.bank.iban', 'IBAN')}
                    </div>
                    <div className="text-sm font-mono truncate">{paymentTerms.iban}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 ml-2 flex-shrink-0"
                    onClick={() => copyToClipboard(paymentTerms.iban!, 'iban')}
                    title="Copy IBAN"
                  >
                    {copiedField === 'iban' ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}

              {/* SWIFT/BIC */}
              {paymentTerms.swiftBic && (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {t('contractors.bank.swiftBic', 'SWIFT/BIC')}
                    </div>
                    <div className="text-sm font-mono">{paymentTerms.swiftBic}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 ml-2 flex-shrink-0"
                    onClick={() => copyToClipboard(paymentTerms.swiftBic!, 'swift')}
                    title="Copy SWIFT/BIC"
                  >
                    {copiedField === 'swift' ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}

              {/* Routing Number */}
              {paymentTerms.bankRoutingNumber && (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">
                    {t('contractors.bank.routingNumber', 'Routing Number')}
                  </div>
                  <div className="text-sm font-mono">{paymentTerms.bankRoutingNumber}</div>
                </div>
              )}
            </div>
          )}

          {!hasBankDetails && (
            <div className="text-center py-4 text-muted-foreground text-sm bg-muted/30 rounded">
              {t('contractors.bank.noBankDetails', 'No bank details provided')}
            </div>
          )}

          {/* Notes */}
          {paymentTerms.notes && (
            <div className="text-xs text-muted-foreground pt-2 border-t">
              {paymentTerms.notes}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
