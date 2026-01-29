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
  mode,
  productId,
  onClose,
  onProductCreated,
  onProductUpdated,
}: ProductWizardDrawerProps) {
  const title = mode === 'edit' ? 'Edit Product' : 'Create New Product'

  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={drawerStyle}
        overlayClassName="backdrop-blur-none"
        onInteractOutside={(e: Event) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <ProductWizardContent
          mode={mode}
          productId={productId}
          onClose={onClose}
          onProductCreated={onProductCreated}
          onProductUpdated={onProductUpdated}
        />
      </SheetContent>
    </Sheet>
  )
}
