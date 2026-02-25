'use client'

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type AirCargoItem = {
  id: string
  name: string
  numberOfPieces: number
  stackableType: string
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  volumetricWeightKg: string
  actualWeightKg: string
  chargeableWeightKg: string
  loadingMetres: string
}

export type AirCargoTableProps = {
  items: AirCargoItem[]
  onDelete?: (id: string) => void
  isDeleting?: string | null
}

function formatNumber(value: string | number | null, decimals = 2): string {
  if (value === null) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function formatDimensions(length: string | null, width: string | null, height: string | null): string {
  if (!length && !width && !height) return '-'
  const l = length ? parseFloat(length) : 0
  const w = width ? parseFloat(width) : 0
  const h = height ? parseFloat(height) : 0
  return `${l} x ${w} x ${h} cm`
}

const STACKABLE_LABELS: Record<string, string> = {
  fully_stackable: 'Stackable',
  non_stackable: 'Non-stackable',
}

export function AirCargoTable({ items, onDelete, isDeleting }: AirCargoTableProps) {
  const t = useT()

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_rfqs.detail.cargo.empty', 'No cargo items')}
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[40px] text-center">#</TableHead>
            <TableHead>{t('frc_rfqs.detail.cargo.name', 'Name')}</TableHead>
            <TableHead className="text-right">{t('frc_rfqs.detail.cargo.pieces', 'Pieces')}</TableHead>
            <TableHead>{t('frc_rfqs.detail.cargo.dimensions', 'Dimensions')}</TableHead>
            <TableHead className="text-right">{t('frc_rfqs.detail.cargo.volumeShort', 'Volume')}</TableHead>
            <TableHead className="text-right" title="Volume (m³) × 167 kg/m³">{t('frc_rfqs.detail.cargo.volumetricWeightShort', 'Vol Wt kg')}</TableHead>
            <TableHead className="text-right">{t('frc_rfqs.detail.cargo.actualWeightShort', 'Actual kg')}</TableHead>
            <TableHead className="text-right" title="MAX(Actual Weight × Pieces, Volumetric Weight)">{t('frc_rfqs.detail.cargo.chargeableWeightShort', 'Chg. kg')}</TableHead>
            <TableHead>{t('frc_rfqs.detail.cargo.stackable', 'Stackable')}</TableHead>
            {onDelete && <TableHead className="w-[60px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.id}>
              <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-right">{item.numberOfPieces}</TableCell>
              <TableCell className="font-mono text-sm">
                {formatDimensions(item.lengthCm, item.widthCm, item.heightCm)}
              </TableCell>
              <TableCell className="text-right">{formatNumber(item.volumeM3)} m³</TableCell>
              <TableCell className="text-right">{formatNumber(item.volumetricWeightKg)}</TableCell>
              <TableCell className="text-right">{formatNumber(item.actualWeightKg)}</TableCell>
              <TableCell className="text-right">{formatNumber(item.chargeableWeightKg)}</TableCell>
              <TableCell>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  item.stackableType === 'fully_stackable'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {STACKABLE_LABELS[item.stackableType] ?? item.stackableType}
                </span>
              </TableCell>
              {onDelete && (
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(item.id)}
                    disabled={isDeleting === item.id}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
