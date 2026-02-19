'use client'

import * as React from 'react'
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ExternalLink, Package, Ruler, Scale, Box, Calendar } from 'lucide-react'

interface AirCargoData {
  id: string
  name: string
  rfqId?: string | null
  rfqName?: string | null
  numberOfPieces: number
  stackableType: string
  lengthCm?: string | null
  widthCm?: string | null
  heightCm?: string | null
  volumeM3: string
  actualWeightKg: string
  chargeableWeightKg: string
  loadingMetres: string
  createdAt: string
  updatedAt: string
}

interface AirCargoDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  airCargoId: string | null
  mainTableRef?: React.RefObject<HTMLElement>
}

const STACKABLE_COLORS: Record<string, { bg: string; text: string }> = {
  fully_stackable: { bg: '#dcfce7', text: '#166534' },
  non_stackable: { bg: '#fef3c7', text: '#92400e' },
}

function formatStackableType(value: string): string {
  return value === 'fully_stackable' ? 'Fully Stackable' : 'Non-Stackable'
}

function formatNumber(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return num.toFixed(decimals)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function formatDimensions(
  length: string | null | undefined,
  width: string | null | undefined,
  height: string | null | undefined
): string {
  const l = formatNumber(length, 0)
  const w = formatNumber(width, 0)
  const h = formatNumber(height, 0)
  if (l === '-' && w === '-' && h === '-') return '-'
  return `${l} × ${w} × ${h} cm`
}

export function AirCargoDrawer({
  open,
  onOpenChange,
  airCargoId,
  mainTableRef,
}: AirCargoDrawerProps) {
  const t = useT()

  // Fetch cargo data
  const { data: airCargoData, isLoading } = useQuery({
    queryKey: ['air_cargo', airCargoId],
    queryFn: async () => {
      if (!airCargoId) return null
      const response = await apiCall<AirCargoData>(`/api/air_cargo/air-cargo/${airCargoId}`)
      if (!response.ok) throw new Error('Failed to load air cargo')
      return response.result
    },
    enabled: !!airCargoId && open,
  })

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    },
    [onOpenChange]
  )

  const handleCloseAutoFocus = useCallback(
    (e: Event) => {
      e.preventDefault()
      mainTableRef?.current?.focus()
    },
    [mainTableRef]
  )

  const stackableColors = airCargoData
    ? STACKABLE_COLORS[airCargoData.stackableType] || { bg: '#f3f4f6', text: '#374151' }
    : { bg: '#f3f4f6', text: '#374151' }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        style={{ width: '480px' }}
        onCloseAutoFocus={handleCloseAutoFocus}
        onKeyDown={handleKeyDown}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('air_cargo.drawer.title.details', 'Air Cargo Details')}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : !airCargoData ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            {t('air_cargo.drawer.notFound', 'Air cargo not found')}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto py-6 space-y-6">
              {/* Name */}
              <div>
                <h2 className="text-xl font-semibold">{airCargoData.name}</h2>
                {airCargoData.rfqId && airCargoData.rfqName && (
                  <Link
                    href={`/backend/frc-rfqs?id=${airCargoData.rfqId}`}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mt-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {airCargoData.rfqName}
                  </Link>
                )}
              </div>

              {/* Physical Properties */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Ruler className="h-4 w-4" />
                  {t('air_cargo.drawer.section.physical', 'Physical Properties')}
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">
                      {t('air_cargo.drawer.fields.numberOfPieces', 'Number of Pieces')}
                    </span>
                    <p className="font-semibold text-lg">{airCargoData.numberOfPieces}</p>
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground">
                      {t('air_cargo.drawer.fields.stackableType', 'Stackable Type')}
                    </span>
                    <p>
                      <span
                        className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                        style={{ backgroundColor: stackableColors.bg, color: stackableColors.text }}
                      >
                        {formatStackableType(airCargoData.stackableType)}
                      </span>
                    </p>
                  </div>

                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">
                      {t('air_cargo.drawer.fields.dimensions', 'Dimensions (L × W × H)')}
                    </span>
                    <p className="font-mono">
                      {formatDimensions(airCargoData.lengthCm, airCargoData.widthCm, airCargoData.heightCm)}
                    </p>
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground">
                      {t('air_cargo.drawer.fields.actualWeightKg', 'Actual Weight')}
                    </span>
                    <p className="font-mono">{formatNumber(airCargoData.actualWeightKg)} kg</p>
                  </div>
                </div>
              </div>

              {/* Computed Values */}
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  {t('air_cargo.drawer.section.computed', 'Computed Values')}
                </h3>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {t('air_cargo.drawer.fields.volumeM3', 'Volume')}
                    </span>
                    <p className="font-mono font-semibold">{formatNumber(airCargoData.volumeM3, 4)} m³</p>
                  </div>

                  <div>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {t('air_cargo.drawer.fields.chargeableWeightKg', 'Chargeable')}
                    </span>
                    <p className="font-mono font-semibold">{formatNumber(airCargoData.chargeableWeightKg, 2)} kg</p>
                  </div>

                  <div>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {t('air_cargo.drawer.fields.loadingMetres', 'LDM')}
                    </span>
                    <p className="font-mono font-semibold">{formatNumber(airCargoData.loadingMetres, 4)}</p>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="text-sm text-muted-foreground space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{t('air_cargo.drawer.fields.createdAt', 'Created')}:</span>
                  <span>{formatDate(airCargoData.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{t('air_cargo.drawer.fields.updatedAt', 'Updated')}:</span>
                  <span>{formatDate(airCargoData.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
