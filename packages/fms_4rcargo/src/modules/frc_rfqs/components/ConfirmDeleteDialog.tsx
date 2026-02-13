'use client'

import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type ConfirmDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  rfqName?: string
  isDeleting?: boolean
  onCloseAutoFocus?: (e: Event) => void
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  rfqName,
  isDeleting = false,
  onCloseAutoFocus,
}: ConfirmDeleteDialogProps) {
  const t = useT()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <DialogTitle>
              {t('frc_rfqs.deleteDialog.title', 'Delete RFQ')}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {rfqName
              ? t(
                  'frc_rfqs.deleteDialog.descriptionWithName',
                  `Are you sure you want to delete "${rfqName}"? This will also delete all associated cargo items and offers. This action cannot be undone.`
                )
              : t(
                  'frc_rfqs.deleteDialog.description',
                  'Are you sure you want to delete this RFQ? This will also delete all associated cargo items and offers. This action cannot be undone.'
                )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {t('frc_rfqs.deleteDialog.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting
              ? t('frc_rfqs.deleteDialog.deleting', 'Deleting...')
              : t('frc_rfqs.deleteDialog.confirm', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
