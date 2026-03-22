'use client'

import React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Plus, Trash2 } from 'lucide-react'
import type { LineItemState } from '../lib/useInvoiceBuilderState'

const VAT_RATES = [
  { value: '23', label: '23%' },
  { value: '8', label: '8%' },
  { value: '5', label: '5%' },
  { value: '0', label: '0%' },
  { value: 'zw', label: 'zw.' },
  { value: 'oo', label: 'o.o.' },
  { value: 'np', label: 'n.p.' },
]

type Props = {
  lineItems: LineItemState[]
  onUpdate: (index: number, field: keyof LineItemState, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

const cellStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderBottom: '1px solid var(--border)',
  fontSize: '13px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  fontSize: '13px',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  background: 'var(--background)',
  color: 'var(--foreground)',
}

const numInputStyle: React.CSSProperties = {
  ...inputStyle,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}

const readOnlyStyle: React.CSSProperties = {
  ...cellStyle,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--muted-foreground)',
  fontSize: '12px',
}

export function InvoiceLineItemsTable({ lineItems, onUpdate, onAdd, onRemove }: Props) {
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ ...cellStyle, width: 40, textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>Lp.</th>
              <th style={{ ...cellStyle, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textAlign: 'left' }}>Description</th>
              <th style={{ ...cellStyle, width: 60, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>Unit</th>
              <th style={{ ...cellStyle, width: 70, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>Qty</th>
              <th style={{ ...cellStyle, width: 90, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>Unit Price</th>
              <th style={{ ...cellStyle, width: 80, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>VAT Rate</th>
              <th style={{ ...cellStyle, width: 80, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textAlign: 'right' }}>Net</th>
              <th style={{ ...cellStyle, width: 80, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textAlign: 'right' }}>VAT</th>
              <th style={{ ...cellStyle, width: 90, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textAlign: 'right' }}>Gross</th>
              <th style={{ ...cellStyle, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, idx) => (
              <tr key={idx}>
                <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                  {li.lineNumber}
                </td>
                <td style={cellStyle}>
                  <input
                    type="text"
                    value={li.description}
                    onChange={e => onUpdate(idx, 'description', e.target.value)}
                    style={inputStyle}
                    placeholder="Item description"
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    type="text"
                    value={li.unit}
                    onChange={e => onUpdate(idx, 'unit', e.target.value)}
                    style={{ ...inputStyle, textAlign: 'center' }}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    type="text"
                    value={li.quantity}
                    onChange={e => onUpdate(idx, 'quantity', e.target.value)}
                    style={numInputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    type="text"
                    value={li.unitPriceNet}
                    onChange={e => onUpdate(idx, 'unitPriceNet', e.target.value)}
                    style={numInputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <select
                    value={li.vatRateCode}
                    onChange={e => onUpdate(idx, 'vatRateCode', e.target.value)}
                    style={{ ...inputStyle, textAlign: 'center' }}
                  >
                    {VAT_RATES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </td>
                <td style={readOnlyStyle}>{li.netAmount}</td>
                <td style={readOnlyStyle}>{li.vatAmount}</td>
                <td style={{ ...readOnlyStyle, fontWeight: 600, color: 'var(--foreground)' }}>{li.grossAmount}</td>
                <td style={cellStyle}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(idx)}
                    title="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 0' }}>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Line
        </Button>
      </div>
    </div>
  )
}
