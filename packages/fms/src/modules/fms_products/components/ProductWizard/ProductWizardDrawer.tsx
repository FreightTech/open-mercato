'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { ProductWizardContent } from './ProductWizardContent'
import type { ProductWizardDrawerProps } from './types/product-wizard'

export function ProductWizardDrawer({ open, onClose, onProductCreated }: ProductWizardDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-2/3 max-w-none p-0 flex flex-col"
        onInteractOutside={(e: Event) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Create New Product</SheetTitle>
        </SheetHeader>
        <ProductWizardContent onClose={onClose} onProductCreated={onProductCreated} />
      </SheetContent>
    </Sheet>
  )
}
