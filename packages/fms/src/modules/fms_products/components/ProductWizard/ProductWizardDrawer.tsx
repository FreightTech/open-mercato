'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { ProductWizardContent } from './ProductWizardContent'

export type ProductWizardDrawerProps = {
  productId: string | null // null = create mode, string = edit mode
  open: boolean
  onClose: () => void
  onProductCreated?: (productId: string) => void
}

export function ProductWizardDrawer({
  productId,
  open,
  onClose,
  onProductCreated,
}: ProductWizardDrawerProps) {
  // Track if we're in create mode (productId was null when opened)
  const [internalProductId, setInternalProductId] = React.useState<string | null>(productId)

  // Reset internal ID when drawer opens/closes or productId changes
  React.useEffect(() => {
    if (open) {
      setInternalProductId(productId)
    }
  }, [open, productId])

  // Handle product creation - switch to edit mode
  const handleProductCreated = React.useCallback(
    (newProductId: string) => {
      setInternalProductId(newProductId)
      onProductCreated?.(newProductId)
    },
    [onProductCreated]
  )

  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl p-0 flex flex-col [&>button:first-child]:hidden"
        onInteractOutside={(e: Event) => e.preventDefault()}
        overlayClassName="backdrop-blur-none bg-black/20"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>
            {internalProductId ? 'Edit Product' : 'New Product'}
          </SheetTitle>
        </SheetHeader>
        <ProductWizardContent
          productId={internalProductId}
          onClose={onClose}
          onProductCreated={handleProductCreated}
        />
      </SheetContent>
    </Sheet>
  )
}
