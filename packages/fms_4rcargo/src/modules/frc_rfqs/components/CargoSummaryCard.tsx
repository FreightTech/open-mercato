'use client'

import * as React from 'react'
import { Package, Scale, Ruler, Box } from 'lucide-react'
import { Card, CardContent } from '@open-mercato/ui/primitives/card'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type CargoSummaryData = {
  totalPieces: number
  totalVolume: string
  totalActualWeight: string
  totalChargeableWeight: string
  totalLoadingMetres: string
  product?: string | null
  commodity?: string | null
  looseOrUnitised?: string | null
}

export type CargoSummaryCardProps = {
  data: CargoSummaryData
}

function formatNumber(value: string | number, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function CargoSummaryCard({ data }: CargoSummaryCardProps) {
  const t = useT()

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Pieces */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-blue-50 flex items-center justify-center">
              <Package className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.detail.cargo.pieces', 'Pieces')}</div>
              <div className="font-semibold">{data.totalPieces}</div>
            </div>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-purple-50 flex items-center justify-center">
              <Box className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.detail.cargo.volume', 'Volume')}</div>
              <div className="font-semibold">{formatNumber(data.totalVolume)} m³</div>
            </div>
          </div>

          {/* Actual Weight */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-amber-50 flex items-center justify-center">
              <Scale className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.detail.cargo.actualWeight', 'Actual Weight')}</div>
              <div className="font-semibold">{formatNumber(data.totalActualWeight)} kg</div>
            </div>
          </div>

          {/* Chargeable Weight */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-green-50 flex items-center justify-center">
              <Scale className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.detail.cargo.chargeableWeight', 'Chargeable Weight')}</div>
              <div className="font-semibold">{formatNumber(data.totalChargeableWeight)} kg</div>
            </div>
          </div>

          {/* Loading Metres */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-rose-50 flex items-center justify-center">
              <Ruler className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.detail.cargo.loadingMetres', 'Loading Metres')}</div>
              <div className="font-semibold">{formatNumber(data.totalLoadingMetres)} LDM</div>
            </div>
          </div>

          {/* Vertical divider */}
          {(data.product || data.commodity || data.looseOrUnitised) && (
            <div className="h-10 w-px bg-border" />
          )}

          {/* Product */}
          {data.product && (
            <div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.detail.cargo.product', 'Product')}</div>
              <div className="font-medium text-sm">{data.product}</div>
            </div>
          )}

          {/* Commodity */}
          {data.commodity && (
            <div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.detail.cargo.commodity', 'Commodity')}</div>
              <div className="font-medium text-sm">{data.commodity}</div>
            </div>
          )}

          {/* Loose/Unitised */}
          {data.looseOrUnitised && (
            <div>
              <div className="text-xs text-muted-foreground">{t('frc_rfqs.detail.cargo.type', 'Type')}</div>
              <div className="font-medium text-sm capitalize">{data.looseOrUnitised}</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
