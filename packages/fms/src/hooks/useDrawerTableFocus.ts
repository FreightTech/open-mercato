'use client'

import * as React from 'react'

export interface UseDrawerTableFocusOptions {
  /** Whether the drawer is currently open */
  isOpen: boolean
  /** Whether the drawer content is ready (data loaded) */
  isContentReady: boolean
  /** Ref to the table inside the drawer that should receive focus when drawer opens */
  drawerTableRef: React.RefObject<HTMLDivElement | null>
  /** Ref to the main table that should receive focus when drawer closes */
  mainTableRef?: React.RefObject<HTMLDivElement | null>
}

export interface UseDrawerTableFocusResult {
  /** Pass to SheetContent onOpenAutoFocus to prevent default focus behavior */
  handleOpenAutoFocus: (event: Event) => void
  /** Pass to SheetContent onCloseAutoFocus to restore focus to main table */
  handleCloseAutoFocus: (event: Event) => void
}

/**
 * Hook for managing focus transitions between a main table and a drawer table.
 *
 * Uses Radix Dialog's native focus callbacks instead of setTimeout for reliable,
 * event-driven focus management.
 *
 * IMPORTANT: Uses useLayoutEffect to ensure the ref is populated before focusing.
 * useEffect runs after paint, which can cause the ref to still be null when
 * content becomes ready. useLayoutEffect runs synchronously after DOM mutations.
 *
 * @example
 * ```tsx
 * const drawerTableRef = React.useRef<HTMLDivElement>(null)
 *
 * const { handleOpenAutoFocus, handleCloseAutoFocus } = useDrawerTableFocus({
 *   isOpen: open,
 *   isContentReady: !isLoading && !!data,
 *   drawerTableRef,
 *   mainTableRef,
 * })
 *
 * return (
 *   <Sheet open={open}>
 *     <SheetContent
 *       onOpenAutoFocus={handleOpenAutoFocus}
 *       onCloseAutoFocus={handleCloseAutoFocus}
 *     >
 *       <MyTable tableRef={drawerTableRef} />
 *     </SheetContent>
 *   </Sheet>
 * )
 * ```
 */
export function useDrawerTableFocus(
  options: UseDrawerTableFocusOptions
): UseDrawerTableFocusResult {
  const { isOpen, isContentReady, drawerTableRef, mainTableRef } = options

  // Focus drawer table when content becomes ready
  // Using useLayoutEffect to run synchronously after DOM mutations,
  // ensuring the ref is populated before we try to focus
  React.useLayoutEffect(() => {
    if (isOpen && isContentReady && drawerTableRef.current) {
      drawerTableRef.current.focus()
    }
  }, [isOpen, isContentReady, drawerTableRef])

  // Prevent Radix from focusing the close button on open
  const handleOpenAutoFocus = React.useCallback((event: Event) => {
    event.preventDefault()
  }, [])

  // Restore focus to main table when drawer closes
  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => {
      event.preventDefault()
      mainTableRef?.current?.focus()
    },
    [mainTableRef]
  )

  return {
    handleOpenAutoFocus,
    handleCloseAutoFocus,
  }
}
