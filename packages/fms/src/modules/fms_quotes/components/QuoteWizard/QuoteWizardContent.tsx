'use client'

import * as React from 'react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { Loader2, X, PanelRightClose, PanelRight, Check, AlertCircle } from 'lucide-react'
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
import { useQuoteWizard } from './hooks/useQuoteWizard'
import { useNewQuoteWizard } from './hooks/useNewQuoteWizard'
import { QuoteWizardHeader } from './QuoteWizardHeader'
import { QuoteWizardLinesTable } from './QuoteWizardLinesTable'
import { QuoteWizardTotals } from './QuoteWizardTotals'
import { QuoteWizardContextPanel } from './QuoteWizardContextPanel'
import { ProductSearchPanel } from './ProductSearchPanel'
import { AddProductModal } from './AddProductModal'
import { AddCustomProductModal } from './AddCustomProductModal'
import type { CustomLineData } from './AddCustomProductModal'
import { CreateOfferDrawer } from './CreateOfferDrawer'
import { QuoteOffersSection } from '../QuoteOffersSection'
import type { Quote } from './hooks/useQuoteWizard'
import type { QuoteLine } from './hooks/useCalculations'

type QuoteWizardContentProps = {
  quoteId: string | null
  mode: 'new' | 'edit'
  onClose: () => void
  onQuoteCreated?: (quoteId: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  ready: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  offered: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  won: 'bg-green-100 text-green-700 hover:bg-green-200',
  lost: 'bg-red-100 text-red-700 hover:bg-red-200',
  expired: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  archived: 'bg-slate-100 text-slate-500 hover:bg-slate-200',
}

export function QuoteWizardContent({ quoteId, mode, onClose, onQuoteCreated }: QuoteWizardContentProps) {
  const queryClient = useQueryClient()
  const [contextPanelOpen, setContextPanelOpen] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<unknown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateOfferDrawer, setShowCreateOfferDrawer] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [showCustomProductModal, setShowCustomProductModal] = useState(false)
  const [continueAddingMode, setContinueAddingMode] = useState(false)

  // Determine which hook to use based on mode and quoteId
  const isNewMode = mode === 'new' && !quoteId

  console.log('[QuoteWizardContent] render:', { mode, quoteId, isNewMode })

  // Use the new quote wizard hook for draft mode
  const newQuoteWizard = useNewQuoteWizard({
    onError: setError,
    onQuoteCreated: (id) => {
      onQuoteCreated?.(id)
    },
  })

  // Use the existing quote wizard hook for edit mode
  const editQuoteWizard = useQuoteWizard({
    quoteId: quoteId || '',
    onError: setError,
  })

  // Extract values based on mode with proper typing
  const quote: Quote | null | undefined = isNewMode ? newQuoteWizard.quote : editQuoteWizard.quote
  const isLoadingQuote = isNewMode ? newQuoteWizard.isLoadingQuote : editQuoteWizard.isLoadingQuote
  const updateQuote = isNewMode ? newQuoteWizard.updateQuote : editQuoteWizard.updateQuote
  const lines: QuoteLine[] = isNewMode ? newQuoteWizard.lines : editQuoteWizard.lines
  const isLoadingLines = isNewMode ? newQuoteWizard.isLoadingLines : editQuoteWizard.isLoadingLines
  const addLine = isNewMode ? newQuoteWizard.addLine : editQuoteWizard.addLine
  const updateLine = isNewMode ? newQuoteWizard.updateLine : editQuoteWizard.updateLine
  const removeLine = isNewMode ? newQuoteWizard.removeLine : editQuoteWizard.removeLine
  const saveStatus = isNewMode ? newQuoteWizard.saveStatus : editQuoteWizard.saveStatus
  const forceSave = isNewMode ? newQuoteWizard.forceSave : editQuoteWizard.forceSave
  const hasPendingChanges = isNewMode ? newQuoteWizard.hasPendingChanges : editQuoteWizard.hasPendingChanges
  const totals = isNewMode ? newQuoteWizard.totals : editQuoteWizard.totals
  const showProductSearch = isNewMode ? newQuoteWizard.showProductSearch : editQuoteWizard.showProductSearch
  const openProductSearch = isNewMode ? newQuoteWizard.openProductSearch : editQuoteWizard.openProductSearch
  const closeProductSearch = isNewMode ? newQuoteWizard.closeProductSearch : editQuoteWizard.closeProductSearch

  // For new mode, also get the draft-specific state
  const isDirty = isNewMode ? newQuoteWizard.isDirty : false
  const persistedQuoteId = isNewMode ? newQuoteWizard.persistedQuoteId : null
  const resetDraft = isNewMode ? newQuoteWizard.resetDraft : () => {}

  // Get effective quoteId (either from props or from persisted draft)
  const effectiveQuoteId = quoteId || persistedQuoteId

  const handleClose = async () => {
    // If in new mode with dirty changes but not persisted, ask for confirmation
    if (isNewMode && isDirty && !persistedQuoteId) {
      setShowDiscardDialog(true)
      return
    }

    // If in edit mode or new mode with persisted changes, save first
    if (hasPendingChanges) {
      await forceSave()
    }
    onClose()
  }

  const handleConfirmDiscard = () => {
    resetDraft()
    setShowDiscardDialog(false)
    onClose()
  }

  const handleAddProduct = (product: unknown) => {
    setSelectedProduct(product)
  }

  const handleConfirmAddProduct = async (data: {
    productId: string
    variantId?: string
    priceId?: string
    productName: string
    chargeCode: string
    productType: string
    providerName?: string
    containerSize?: string
    contractType: string
    quantity: number
    unitCost: number
    currencyCode: string
    marginPercent: number
  }, continueAdding = false) => {
    const unitSales = data.unitCost / (1 - data.marginPercent / 100)

    await addLine({
      productId: data.productId,
      variantId: data.variantId || null,
      priceId: data.priceId || null,
      productName: data.productName,
      chargeCode: data.chargeCode,
      productType: data.productType,
      providerName: data.providerName || null,
      containerSize: data.containerSize || null,
      contractType: data.contractType,
      quantity: data.quantity.toString(),
      unitCost: data.unitCost.toString(),
      currencyCode: data.currencyCode,
      marginPercent: data.marginPercent.toString(),
      unitSales: unitSales.toString(),
    })

    setSelectedProduct(null)

    // Only close product search if not in continue adding mode
    if (!continueAdding) {
      closeProductSearch()
      setContinueAddingMode(false)
    }
  }

  const handleConfirmCustomProduct = async (data: CustomLineData) => {
    await addLine({
      productId: null,
      variantId: null,
      priceId: null,
      productName: data.productName,
      chargeCode: data.chargeCode,
      productType: data.productType,
      providerName: data.providerName || null,
      containerSize: data.containerSize || null,
      contractType: 'BASKET',
      quantity: data.quantity.toString(),
      unitCost: data.unitCost.toString(),
      currencyCode: data.currencyCode,
      marginPercent: data.marginPercent.toString(),
      unitSales: data.unitSales.toString(),
    })
  }

  const handleOpenCustomModal = () => {
    setShowCustomProductModal(true)
  }

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

  // For new mode, we always have a quote object from the hook
  if (!quote) {
    return null
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {isNewMode && !persistedQuoteId
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
          {quote.originPorts && quote.originPorts.length > 0 && quote.destinationPorts && quote.destinationPorts.length > 0 && (
            <span className="text-muted-foreground">
              {quote.originPorts.map(p => p.locode || p.name).join(', ')} → {quote.destinationPorts.map(p => p.locode || p.name).join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save status indicator */}
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
            {isNewMode && !persistedQuoteId && isDirty && saveStatus === 'idle' && (
              <span className="text-yellow-600">Unsaved draft</span>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setContextPanelOpen(!contextPanelOpen)}
            title={contextPanelOpen ? 'Hide context panel' : 'Show context panel'}
          >
            {contextPanelOpen ? (
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
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
          {error}
          <button
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel - main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-auto">
          {/* Quote header form */}
          <QuoteWizardHeader quote={quote} onChange={updateQuote} mode={mode} />

          {/* Summary bar - under main info, above lines */}
          <div className="px-4 pt-2">
            <QuoteWizardTotals
              totals={totals}
              currency={quote.currencyCode}
              onCreateOffer={effectiveQuoteId ? () => setShowCreateOfferDrawer(true) : undefined}
            />
          </div>

          {/* Product search or lines table */}
          <div className="p-4">
            {showProductSearch ? (
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
                  onAddCustom={handleOpenCustomModal}
                />

                {/* Offers section - only show for persisted quotes */}
                {effectiveQuoteId && (
                  <QuoteOffersSection quoteId={effectiveQuoteId} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Right panel - context */}
        {contextPanelOpen && (
          <QuoteWizardContextPanel
            clientName={quote.clientName}
            originPorts={quote.originPorts}
            destinationPorts={quote.destinationPorts}
            quoteCurrency={quote.currencyCode}
            lineCurrencies={lines.map(l => l.currencyCode)}
          />
        )}
      </div>

      {/* Add product modal */}
      <AddProductModal
        product={selectedProduct}
        defaultQuantity={1}
        defaultMarginPercent={10}
        onConfirm={(data) => handleConfirmAddProduct(data, false)}
        onConfirmAndContinue={(data) => handleConfirmAddProduct(data, true)}
        onCancel={() => setSelectedProduct(null)}
      />

      {/* Add custom product modal */}
      <AddCustomProductModal
        open={showCustomProductModal}
        onClose={() => setShowCustomProductModal(false)}
        onConfirm={handleConfirmCustomProduct}
        defaultCurrency={quote.currencyCode}
        defaultMarginPercent={10}
      />

      {/* Create offer drawer - only for persisted quotes */}
      {effectiveQuoteId && (
        <CreateOfferDrawer
          open={showCreateOfferDrawer}
          onClose={() => setShowCreateOfferDrawer(false)}
          quoteId={effectiveQuoteId}
          quoteNumber={quote.quoteNumber}
          lines={lines}
          currency={quote.currencyCode}
          onSuccess={() => {
            setShowCreateOfferDrawer(false)
            queryClient.invalidateQueries({ queryKey: ['fms_offers', effectiveQuoteId] })
          }}
        />
      )}

      {/* Discard draft dialog */}
      <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscardDialog(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={handleConfirmDiscard}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
