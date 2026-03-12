'use client'

import * as React from 'react'
import { CreditCard, Infinity, AlertTriangle, Plus, Pencil } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@open-mercato/ui/primitives/card'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'

type ContractorCreditLimit = {
  id: string
  creditLimit: string
  currencyCode: string
  isUnlimited: boolean
  currentExposure?: string
  lastCalculatedAt?: string | null
  notes?: string | null
}

type ContractorCreditUsageCardProps = {
  creditLimit?: ContractorCreditLimit | null
  onAdd?: () => void
  onEdit?: () => void
}

export function ContractorCreditUsageCard({ creditLimit, onAdd, onEdit }: ContractorCreditUsageCardProps) {
  const t = useT()

  const formatCurrency = (amount: string | number, currency: string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numAmount)
  }

  // Calculate usage
  const limit = parseFloat(creditLimit?.creditLimit ?? '0')
  const exposure = parseFloat(creditLimit?.currentExposure ?? '0')
  const available = limit - exposure
  const usagePercent = limit > 0 ? Math.min((exposure / limit) * 100, 100) : 0
  const currency = creditLimit?.currencyCode ?? 'USD'
  const isUnlimited = creditLimit?.isUnlimited ?? false

  // Determine status color
  const getStatusColor = () => {
    if (isUnlimited) return 'text-blue-600'
    if (usagePercent >= 90) return 'text-red-600'
    if (usagePercent >= 75) return 'text-orange-600'
    if (usagePercent >= 50) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getProgressColor = () => {
    if (usagePercent >= 90) return 'bg-red-500'
    if (usagePercent >= 75) return 'bg-orange-500'
    if (usagePercent >= 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (!creditLimit) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="flex items-center justify-between text-base font-medium">
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              {t('contractors.credit.title', 'Credit Limit')}
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
            {t('contractors.credit.notConfigured', 'No credit limit configured')}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between text-base font-medium">
          <span className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            {t('contractors.credit.title', 'Credit Limit')}
            {isUnlimited ? (
              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                <Infinity className="h-3 w-3 mr-1" />
                Unlimited
              </Badge>
            ) : usagePercent >= 90 ? (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Near Limit
              </Badge>
            ) : null}
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
        {isUnlimited ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('contractors.credit.exposure', 'Current Exposure')}
              </span>
              <span className="font-medium">
                {formatCurrency(exposure, currency)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground text-center py-2 bg-blue-50 rounded">
              {t('contractors.credit.unlimitedNote', 'This contractor has unlimited credit')}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Usage bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('contractors.credit.used', 'Used')}</span>
                <span className={cn('font-medium', getStatusColor())}>
                  {usagePercent.toFixed(0)}%
                </span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full transition-all', getProgressColor())}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground mb-1">
                  {t('contractors.credit.limit', 'Limit')}
                </div>
                <div className="text-sm font-medium">
                  {formatCurrency(limit, currency)}
                </div>
              </div>
              <div className="text-center p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground mb-1">
                  {t('contractors.credit.exposure', 'Exposure')}
                </div>
                <div className={cn('text-sm font-medium', usagePercent >= 75 && 'text-orange-600')}>
                  {formatCurrency(exposure, currency)}
                </div>
              </div>
              <div className="text-center p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground mb-1">
                  {t('contractors.credit.available', 'Available')}
                </div>
                <div className={cn('text-sm font-medium', available < 0 ? 'text-red-600' : 'text-green-600')}>
                  {formatCurrency(available, currency)}
                </div>
              </div>
            </div>

            {/* Notes */}
            {creditLimit.notes && (
              <div className="text-xs text-muted-foreground pt-2 border-t">
                {creditLimit.notes}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
