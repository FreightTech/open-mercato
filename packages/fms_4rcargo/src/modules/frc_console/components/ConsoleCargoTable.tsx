'use client'

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

interface CargoTableItem {
  id: string
  airCargoId: string
  quantity: number
  cargoName: string
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  actualWeightKg: string | null
  stackableType: string
  numberOfPieces: number
  color: string
}

interface ConsoleCargoTableProps {
  items: CargoTableItem[]
  onRemove: () => void
  consoleId: string
}

export function ConsoleCargoTable({ items, onRemove, consoleId }: ConsoleCargoTableProps) {
  const [removingId, setRemovingId] = React.useState<string | null>(null)

  const handleRemove = async (itemId: string) => {
    setRemovingId(itemId)
    try {
      const result = await apiCall(`/api/frc_console/console/${consoleId}/cargo/${itemId}`, {
        method: 'DELETE',
      })
      if (result.ok) {
        flash('Cargo item removed', 'success')
        onRemove()
      } else {
        flash('Failed to remove cargo item', 'error')
      }
    } catch {
      flash('Failed to remove cargo item', 'error')
    } finally {
      setRemovingId(null)
    }
  }

  const formatDimensions = (item: CargoTableItem) => {
    const w = item.widthCm ?? '?'
    const l = item.lengthCm ?? '?'
    const h = item.heightCm ?? '?'
    return `${w}x${l}x${h} cm`
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3 font-medium">Cargo</th>
            <th className="text-right py-2 px-3 font-medium">Qty</th>
            <th className="text-left py-2 px-3 font-medium">Dimensions</th>
            <th className="text-right py-2 px-3 font-medium">Weight</th>
            <th className="text-left py-2 px-3 font-medium">Stackable</th>
            <th className="text-right py-2 px-3 font-medium w-16"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/50">
              <td className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: item.color }}
                    title={`Color: ${item.color}`}
                  />
                  <span>{item.cargoName}</span>
                </div>
              </td>
              <td className="py-2 px-3 text-right tabular-nums">{item.quantity}</td>
              <td className="py-2 px-3 tabular-nums">{formatDimensions(item)}</td>
              <td className="py-2 px-3 text-right tabular-nums">
                {item.actualWeightKg ? `${item.actualWeightKg} kg` : '-'}
              </td>
              <td className="py-2 px-3">
                {item.stackableType === 'fully_stackable' ? (
                  <span className="text-green-600 dark:text-green-400">Yes</span>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </td>
              <td className="py-2 px-3 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(item.id)}
                  disabled={removingId === item.id}
                  className="h-8 w-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
