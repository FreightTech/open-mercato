'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { UnplacedCargoDisplay, UnplacedReason } from '../lib/types'

interface UnplacedItemsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unplacedItems: UnplacedCargoDisplay[]
}

export function UnplacedItemsModal({ open, onOpenChange, unplacedItems }: UnplacedItemsModalProps) {
  const t = useT()

  const getReasonLabel = (reason: UnplacedReason): string => {
    switch (reason) {
      case 'weight_exceeded':
        return t('truck_loading.unplacedItems.reason.weight_exceeded')
      case 'no_space':
        return t('truck_loading.unplacedItems.reason.no_space')
      default:
        return reason
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[70vw]">
        <DialogHeader>
          <DialogTitle>{t('truck_loading.unplacedItems.title')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t('truck_loading.unplacedItems.columns.name')}</th>
                <th className="py-2 pr-4 font-medium">{t('truck_loading.unplacedItems.columns.dimensions')}</th>
                <th className="py-2 pr-4 font-medium">{t('truck_loading.unplacedItems.columns.weight')}</th>
                <th className="py-2 font-medium">{t('truck_loading.unplacedItems.columns.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {unplacedItems.map((item, index) => (
                <tr key={`${item.cargoItemId}-${item.instanceIndex}-${index}`} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.name}</span>
                      {unplacedItems.filter(i => i.cargoItemId === item.cargoItemId).length > 1 && (
                        <span className="text-muted-foreground text-xs">#{item.instanceIndex + 1}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {item.width}x{item.length}x{item.height} cm
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {item.weight} kg
                  </td>
                  <td className="py-2">
                    <span className="text-destructive font-medium">
                      {getReasonLabel(item.reason)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('truck_loading.unplacedItems.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
