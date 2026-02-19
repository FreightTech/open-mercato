'use client'

import * as React from 'react'
import { DollarSign, ArrowRight, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type PricingData = {
  connectionRatePerKg: string | null
  connectionRateTotal: string | null
  airfreightRatePerKg: string | null
  airfreightRateTotal: string | null
  totalRatePerKg: string | null
  totalRate: string | null
  currencyCode: string
}

export type PricingCardProps = {
  data: PricingData
}

function formatNumber(value: string | number | null, decimals = 2): string {
  if (value === null) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function PricingRow({
  label,
  perKg,
  total,
  currency,
  highlight = false,
}: {
  label: string
  perKg: string | null
  total: string | null
  currency: string
  highlight?: boolean
}) {
  const hasData = perKg !== null || total !== null

  if (!hasData) return null

  return (
    <div className={`flex items-center justify-between py-2 ${highlight ? 'border-t-2 border-primary/20 pt-3' : ''}`}>
      <span className={`text-sm ${highlight ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
      <div className="flex items-center gap-4">
        {perKg !== null && (
          <div className="text-right">
            <span className={`text-sm ${highlight ? 'font-semibold' : ''}`}>
              {formatNumber(perKg, 2)} {currency}/kg
            </span>
          </div>
        )}
        {total !== null && (
          <>
            {perKg !== null && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            <div className="text-right min-w-[100px]">
              <span className={`${highlight ? 'text-lg font-bold text-primary' : 'font-medium'}`}>
                {formatNumber(total, 2)} {currency}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function PricingCard({ data }: PricingCardProps) {
  const t = useT()

  const hasAnyPricing =
    data.connectionRatePerKg !== null ||
    data.connectionRateTotal !== null ||
    data.airfreightRatePerKg !== null ||
    data.airfreightRateTotal !== null ||
    data.totalRatePerKg !== null ||
    data.totalRate !== null

  if (!hasAnyPricing) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('frc_offers.detail.pricing.title', 'Pricing')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('frc_offers.detail.pricing.empty', 'No pricing data available')}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          {t('frc_offers.detail.pricing.title', 'Pricing')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <PricingRow
          label={t('frc_offers.detail.pricing.connection', 'Connection Rate')}
          perKg={data.connectionRatePerKg}
          total={data.connectionRateTotal}
          currency={data.currencyCode}
        />
        <PricingRow
          label={t('frc_offers.detail.pricing.airfreight', 'Airfreight Rate')}
          perKg={data.airfreightRatePerKg}
          total={data.airfreightRateTotal}
          currency={data.currencyCode}
        />
        <PricingRow
          label={t('frc_offers.detail.pricing.total', 'Total')}
          perKg={data.totalRatePerKg}
          total={data.totalRate}
          currency={data.currencyCode}
          highlight
        />
      </CardContent>
    </Card>
  )
}
