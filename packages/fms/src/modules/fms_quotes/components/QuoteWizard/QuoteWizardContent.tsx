'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { Loader2, X, PanelRightClose, PanelRight, Check, AlertCircle, Save } from 'lucide-react'
import { FMS_QUOTE_STATUSES } from '../../data/types'
import type { FmsQuoteStatus } from '../../data/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'

// Context and Types
import { QuoteWizardProvider } from './hooks/QuoteWizardContext'
import { useQuoteWizardContext } from './hooks/useQuoteWizardContext'
import type { QuoteWizardMode, ProductSearchResult, NewLineData } from './types/quote-wizard'

// Components
import { QuoteWizardHeader } from './QuoteWizardHeader'
import { QuoteWizardLinesTable } from './QuoteWizardLinesTable'
import { QuoteWizardContextPanel } from './QuoteWizardContextPanel'
import { ProductSearchPanel } from './ProductSearchPanel'
import { AddCustomProductModal } from './AddCustomProductModal'
import type { CustomLineData } from './AddCustomProductModal'
import { CreateOfferDrawer } from './CreateOfferDrawer'
import { QuoteOffersSection } from '../QuoteOffersSection'

// =============================================================================
// Props
// =============================================================================

type QuoteWizardContentProps = {
  quoteId: string | null
  mode: QuoteWizardMode
  onClose: () => void
  onQuoteCreated?: (quoteId: string) => void
  /** Optional ref for the header table - used by parent drawer for focus management */
  headerTableRef?: React.RefObject<HTMLDivElement | null>
}

// =============================================================================
// Status Colors
// =============================================================================

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  ready: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  offered: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  won: 'bg-green-100 text-green-700 hover:bg-green-200',
  lost: 'bg-red-100 text-red-700 hover:bg-red-200',
  expired: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  archived: 'bg-slate-100 text-slate-500 hover:bg-slate-200',
}

// =============================================================================
// Inner Content Component (uses context)
// =============================================================================

function QuoteWizardInnerContent({ onClose, headerTableRef }: { onClose: () => void; headerTableRef?: React.RefObject<HTMLDivElement | null> }) {
  const queryClient = useQueryClient()

  // Refs for cross-table arrow navigation
  const linesTableRef = React.useRef<HTMLDivElement>(null)
  const offersTableRef = React.useRef<HTMLDivElement>(null)

  const {
    // State
    mode,
    quote,
    lines,
    isLoadingQuote,
    isLoadingLines,
    effectiveQuoteId,
    isDirty,
    persistedQuoteId,
    saveStatus,
    hasPendingChanges,
    isCreating,
    ui,

    // Actions
    updateQuote,
    addLine,
    updateLine,
    removeLine,
    forceSave,
    resetDraft,
    handleSave,

    // UI Actions
    openProductSearch,
    closeProductSearch,
    setError,
    openCreateOfferDrawer,
    closeCreateOfferDrawer,
    openCustomProductModal,
    closeCustomProductModal,
    openDiscardDialog,
    closeDiscardDialog,
    toggleContextPanel,
    setContinueAddingMode,
  } = useQuoteWizardContext()

  const isNewMode = mode === 'new' && !effectiveQuoteId

  // Handle close with save/discard logic
  const handleClose = async () => {
    // If in new mode with dirty changes, ask for confirmation
    if (isNewMode && isDirty) {
      openDiscardDialog()
      return
    }

    // If has pending changes in edit mode, save first
    if (hasPendingChanges) {
      await forceSave()
    }
    onClose()
  }

  // Handle "Don't Save" - discard and close
  const handleConfirmDiscard = () => {
    resetDraft()
    closeDiscardDialog()
    onClose()
  }

  // Handle "Save & Close" - save then close
  const handleSaveAndClose = async () => {
    closeDiscardDialog()
    const savedId = await handleSave()
    if (savedId) {
      onClose()
    }
  }

  // Handle explicit Save button click
  const handleSaveClick = async () => {
    await handleSave()
  }

  // Default values for new products
  const DEFAULT_QUANTITY = 1
  const DEFAULT_MARGIN_PERCENT = 10

  // Handle product selection from search - add directly without modal
  const handleAddProduct = async (product: ProductSearchResult) => {
    const unitCost = parseFloat(product.price ?? '0') || 0
    const unitSales = unitCost / (1 - DEFAULT_MARGIN_PERCENT / 100)

    const lineData: NewLineData = {
      productId: product.productId,
      variantId: product.variantId || null,
      productName: product.productName,
      chargeCode: product.chargeCode,
      productType: product.productType,
      providerName: product.providerName || null,
      providerId: product.providerContractorId || null,
      containerSize: product.containerSize || null,
      reference: product.reference || null,
      origin: product.source || null,
      destination: product.destination || null,
      validityStart: product.validityStart || null,
      validityEnd: product.validityEnd || null,
      quantity: DEFAULT_QUANTITY.toString(),
      unitCost: unitCost.toString(),
      currencyCode: product.currencyCode || 'USD',
      marginPercent: DEFAULT_MARGIN_PERCENT.toString(),
      unitSales: unitSales.toString(),
    }

    await addLine(lineData)
    // Close search panel after adding product
    closeProductSearch()
  }

  // Handle confirm custom product
  const handleConfirmCustomProduct = async (data: CustomLineData) => {
    const lineData: NewLineData = {
      productId: null,
      variantId: null,
      providerId: data.providerId || null,
      productName: data.productName,
      chargeCode: data.chargeCode,
      productType: data.productType,
      providerName: data.providerName || null,
      containerSize: data.containerSize || null,
      reference: null,
      validityStart: null,
      validityEnd: null,
      quantity: data.quantity.toString(),
      unitCost: data.unitCost.toString(),
      currencyCode: data.currencyCode,
      marginPercent: data.marginPercent.toString(),
      unitSales: data.unitSales.toString(),
    }

    await addLine(lineData)
  }

  // Handle close product search
  const handleCloseProductSearch = () => {
    closeProductSearch()
    setContinueAddingMode(false)
  }

  // Loading state only for edit mode
  if (!isNewMode && isLoadingQuote) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not found state only for edit mode
  if (!isNewMode && !quote) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Quote not found</p>
      </div>
    )
  }

  // For new mode, we always have a quote object from the context
  if (!quote) {
    return null
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {isNewMode
              ? 'New Quote'
              : `Quote ${quote.quoteNumber || (effectiveQuoteId ? effectiveQuoteId.slice(0, 8) : '')}`}
          </h1>
          <select
            value={quote.status}
            onChange={(e) => updateQuote({ status: e.target.value as FmsQuoteStatus })}
            className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full cursor-pointer border-0 appearance-none ${STATUS_COLORS[quote.status] || STATUS_COLORS.draft}`}
            style={{ backgroundImage: 'none', paddingRight: '0.5rem' }}
          >
            {FMS_QUOTE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.toUpperCase()}
              </option>
            ))}
          </select>

          {/* Save button - only show in new mode */}
          {isNewMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveClick}
              disabled={!isDirty || isCreating}
              className="gap-1"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          )}

          {quote.originPorts &&
            quote.originPorts.length > 0 &&
            quote.destinationPorts &&
            quote.destinationPorts.length > 0 && (
              <span className="text-muted-foreground">
                {quote.originPorts.map((p) => p.locode || p.name).join(', ')} →{' '}
                {quote.destinationPorts.map((p) => p.locode || p.name).join(', ')}
              </span>
            )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save status indicator - for edit mode show auto-save status */}
          {!isNewMode && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Saved</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-red-600">Error saving</span>
                </>
              )}
            </div>
          )}
          {/* For new mode, show unsaved indicator when dirty */}
          {isNewMode && isDirty && !isCreating && saveStatus !== 'error' && (
            <span className="text-sm text-yellow-600">Unsaved changes</span>
          )}
          {saveStatus === 'error' && isNewMode && (
            <div className="flex items-center gap-1 text-sm">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-red-600">Error saving</span>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleContextPanel}
            title={ui.contextPanelOpen ? 'Hide context panel' : 'Show context panel'}
          >
            {ui.contextPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRight className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {ui.error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
          {ui.error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel - main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-auto">
          {/* Quote header form */}
          <QuoteWizardHeader quote={quote} onChange={updateQuote} mode={mode} tableRef={headerTableRef} siblingTableRefs={{ next: linesTableRef }} />

          {/* Product search or lines table */}
          <div className="p-4">
            {ui.showProductSearch ? (
              <ProductSearchPanel
                onSelect={handleAddProduct}
                onClose={handleCloseProductSearch}
                defaultContainerSize={undefined}
                showDoneButton={lines.length > 0}
              />
            ) : (
              <>
                <QuoteWizardLinesTable
                  lines={lines}
                  isLoading={isLoadingLines}
                  onLineUpdate={updateLine}
                  onRemoveLine={removeLine}
                  onAddProduct={openProductSearch}
                  onAddCustom={openCustomProductModal}
                  onCreateOffer={effectiveQuoteId ? openCreateOfferDrawer : undefined}
                  tableRef={linesTableRef}
                  siblingTableRefs={{ prev: headerTableRef, next: effectiveQuoteId ? offersTableRef : undefined }}
                />

                {/* Offers section - only show for persisted quotes */}
                {effectiveQuoteId && <QuoteOffersSection quoteId={effectiveQuoteId} tableRef={offersTableRef} siblingTableRefs={{ prev: linesTableRef }} />}
              </>
            )}
          </div>
        </div>

        {/* Right panel - context */}
        {ui.contextPanelOpen && (
          <QuoteWizardContextPanel
            clientId={quote.clientId}
            clientName={quote.clientName}
            operationalGuardianId={quote.operationalGuardianId}
            operationalGuardianName={quote.operationalGuardianName}
            businessGuardianId={quote.businessGuardianId}
            businessGuardianName={quote.businessGuardianName}
            quoteId={effectiveQuoteId}
            quoteCurrency={quote.currencyCode}
            lineCurrencies={lines.map((l) => l.currencyCode)}
            onUpdateQuote={updateQuote}
          />
        )}
      </div>

      {/* Add custom product modal */}
      <AddCustomProductModal
        open={ui.showCustomProductModal}
        onClose={closeCustomProductModal}
        onConfirm={handleConfirmCustomProduct}
        defaultCurrency={quote.currencyCode}
        defaultMarginPercent={10}
      />

      {/* Create offer drawer - only for persisted quotes */}
      {effectiveQuoteId && (
        <CreateOfferDrawer
          open={ui.showCreateOfferDrawer}
          onClose={closeCreateOfferDrawer}
          quoteId={effectiveQuoteId}
          quoteNumber={quote.quoteNumber}
          lines={lines}
          currency={quote.currencyCode}
          onSuccess={() => {
            closeCreateOfferDrawer()
            queryClient.invalidateQueries({ queryKey: ['fms_offers', effectiveQuoteId] })
          }}
        />
      )}

      {/* Save changes dialog */}
      <Dialog open={ui.showDiscardDialog} onOpenChange={(open) => !open && closeDiscardDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Do you want to save before closing?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={handleConfirmDiscard}>
              Don't Save
            </Button>
            <Button variant="outline" onClick={closeDiscardDialog}>
              Cancel
            </Button>
            <Button onClick={handleSaveAndClose} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save & Close'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================================================
// Main Export - Wraps content with provider
// =============================================================================

export function QuoteWizardContent({
  quoteId,
  mode,
  onClose,
  onQuoteCreated,
  headerTableRef,
}: QuoteWizardContentProps) {
  return (
    <QuoteWizardProvider
      quoteId={quoteId}
      mode={mode}
      onQuoteCreated={onQuoteCreated}
      onClose={onClose}
    >
      <QuoteWizardInnerContent onClose={onClose} headerTableRef={headerTableRef} />
    </QuoteWizardProvider>
  )
}
