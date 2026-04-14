"use client"
import * as React from 'react'

interface ProductLineData {
  lineNumber: number
  description: string
  model?: string
  vinOrSerial?: string
  engineNumber?: string
  containerNumber?: string
  countryOfOrigin?: string
  quantity: number
  unit: string
  unitPrice?: number
  totalValue?: number
  currency?: string
  netWeightKg?: number
  grossWeightKg?: number
  measurementCbm?: number
  hsCodeFromInvoice?: string
  incoterms?: string
}

interface ProductLinesSummaryProps {
  productLines: ProductLineData[]
}

function fmt(value: number | undefined | null): string {
  if (value == null) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export default function ProductLinesSummary({ productLines }: ProductLinesSummaryProps) {
  if (productLines.length === 0) {
    return <p className="text-sm text-muted-foreground">No product lines extracted yet.</p>
  }

  const currency = productLines.find((l) => l.currency)?.currency ?? ''
  const totalValue = productLines.reduce((sum, l) => sum + (l.totalValue ?? 0), 0)
  const totalGross = productLines.reduce((sum, l) => sum + (l.grossWeightKg ?? 0), 0)
  const totalNet = productLines.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)
  const totalQty = productLines.reduce((sum, l) => sum + l.quantity, 0)
  const totalCbm = productLines.reduce((sum, l) => sum + (l.measurementCbm ?? 0), 0)
  const hasContainerCol = productLines.some((l) => l.containerNumber)
  const hasCbmCol = productLines.some((l) => l.measurementCbm != null)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Lines</div>
          <div className="text-lg font-bold text-foreground">{productLines.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Total Qty</div>
          <div className="text-lg font-bold text-foreground">{fmt(totalQty)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Total Value</div>
          <div className="text-lg font-bold text-foreground">{fmt(totalValue)} {currency}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Gross / Net Weight</div>
          <div className="text-lg font-bold text-foreground">{fmt(totalGross)} <span className="text-sm font-normal text-muted-foreground">/ {fmt(totalNet)} kg</span></div>
        </div>
        {hasCbmCol && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Volume (CBM)</div>
            <div className="text-lg font-bold text-foreground">{fmt(totalCbm)}</div>
          </div>
        )}
      </div>

      {/* Product lines table */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 font-medium text-foreground w-8">#</th>
              {hasContainerCol && <th className="text-left px-3 py-2 font-medium text-foreground">Container</th>}
              <th className="text-left px-3 py-2 font-medium text-foreground">Description</th>
              <th className="text-left px-3 py-2 font-medium text-foreground">Model / Serial</th>
              <th className="text-right px-3 py-2 font-medium text-foreground">Qty</th>
              <th className="text-right px-3 py-2 font-medium text-foreground">Unit Price</th>
              <th className="text-right px-3 py-2 font-medium text-foreground">Total Value</th>
              <th className="text-right px-3 py-2 font-medium text-foreground">Gross (kg)</th>
              <th className="text-right px-3 py-2 font-medium text-foreground">Net (kg)</th>
              {hasCbmCol && <th className="text-right px-3 py-2 font-medium text-foreground">CBM</th>}
              <th className="text-left px-3 py-2 font-medium text-foreground">HS (declared)</th>
              <th className="text-left px-3 py-2 font-medium text-foreground">Origin</th>
            </tr>
          </thead>
          <tbody>
            {productLines.map((line) => (
              <tr key={line.lineNumber} className="border-b border-border">
                <td className="px-3 py-2 text-xs text-muted-foreground">{line.lineNumber}</td>
                {hasContainerCol && (
                  <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                    {line.containerNumber ?? '—'}
                  </td>
                )}
                <td className="px-3 py-2 text-xs text-foreground font-medium max-w-xs">
                  {line.description}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {line.model && <div>{line.model}</div>}
                  {line.vinOrSerial && <div className="font-mono text-[10px]">{line.vinOrSerial}</div>}
                  {line.engineNumber && <div className="font-mono text-[10px]">Eng: {line.engineNumber}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-foreground text-right">{line.quantity} {line.unit}</td>
                <td className="px-3 py-2 text-xs text-foreground text-right">
                  {line.unitPrice != null ? `${fmt(line.unitPrice)} ${line.currency ?? ''}` : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-foreground text-right font-medium">
                  {line.totalValue != null ? `${fmt(line.totalValue)} ${line.currency ?? ''}` : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-foreground text-right">{fmt(line.grossWeightKg)}</td>
                <td className="px-3 py-2 text-xs text-foreground text-right">{fmt(line.netWeightKg)}</td>
                {hasCbmCol && (
                  <td className="px-3 py-2 text-xs text-foreground text-right">{fmt(line.measurementCbm)}</td>
                )}
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                  {line.hsCodeFromInvoice ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {line.countryOfOrigin ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30">
              <td className="px-3 py-2 text-xs font-bold text-foreground" colSpan={hasContainerCol ? 4 : 3}>Totals</td>
              <td className="px-3 py-2 text-xs font-bold text-foreground text-right">{fmt(totalQty)}</td>
              <td className="px-3 py-2 text-xs text-foreground text-right"></td>
              <td className="px-3 py-2 text-xs font-bold text-foreground text-right">{fmt(totalValue)} {currency}</td>
              <td className="px-3 py-2 text-xs font-bold text-foreground text-right">{fmt(totalGross)}</td>
              <td className="px-3 py-2 text-xs font-bold text-foreground text-right">{fmt(totalNet)}</td>
              {hasCbmCol && (
                <td className="px-3 py-2 text-xs font-bold text-foreground text-right">{fmt(totalCbm)}</td>
              )}
              <td className="px-3 py-2" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
