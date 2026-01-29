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

const drawerStyle: React.CSSProperties = {
  width: '1200px',
  maxWidth: '1200px',
}

export function ProductWizardDrawer({
  open,
  onClose,
  onProductCreated,
}: ProductWizardDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={drawerStyle}
        overlayClassName="backdrop-blur-none"
        onInteractOutside={(e: Event) => e.preventDefault()}
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
