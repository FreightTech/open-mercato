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
 * Uses requestAnimationFrame retry to handle cases where the table ref is not
 * yet populated when isContentReady becomes true (e.g., inner components have
 * their own loading states that delay table DOM mounting).
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

  // Focus drawer table when content becomes ready.
  // The ref may not be populated immediately (e.g., when inner content has its
  // own loading state that the parent doesn't track). We retry with
  // requestAnimationFrame until the ref appears or a timeout elapses.
  React.useEffect(() => {
    if (!isOpen || !isContentReady) return

    // Try immediately first
    if (drawerTableRef.current) {
      drawerTableRef.current.focus()
      return
    }

    // Ref not available yet — retry on each animation frame.
    // This handles the gap between "content ready" and actual DOM mount,
    // e.g. when inner components have their own loading spinners.
    let rafId: number
    let attempts = 0
    const maxAttempts = 120 // ~2s at 60fps — covers async content loading

    const tryFocus = () => {
      if (drawerTableRef.current) {
        drawerTableRef.current.focus()
        return
      }
      attempts++
      if (attempts < maxAttempts) {
        rafId = requestAnimationFrame(tryFocus)
      }
    }

    rafId = requestAnimationFrame(tryFocus)
    return () => cancelAnimationFrame(rafId)
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
