import React, { useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { X, ArrowRight, ArrowLeft, Send, Trash2, Loader2 } from 'lucide-react'
import { OfferDetailView } from './OfferDetailView'
import { WizardStepRequest } from './WizardStepRequest'
import { WizardStepPricing } from './WizardStepPricing'
import { WizardStepPreview } from './WizardStepPreview'
import { useRfqWizardState } from '../lib/useRfqWizardState'

type RfqWizardSheetProps = {
  mode: 'new' | 'existing'
  rfqId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (rfq: Record<string, unknown>) => void
  onOfferCreated?: () => void
  onDeleteRequest?: (rfqId: string) => void
}

export function RfqWizardSheet({
  mode,
  rfqId: propRfqId,
  open,
  onOpenChange,
  onCreated,
  onOfferCreated,
  onDeleteRequest,
}: RfqWizardSheetProps) {
  const t = useT()
  const queryClient = useQueryClient()

  const state = useRfqWizardState({
    mode,
    rfqId: propRfqId || null,
    open,
  })

  const { rfqId: stateRfqId, reset: stateReset, handleSend: stateHandleSend } = state

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        if (stateRfqId) {
          queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
          queryClient.invalidateQueries({ queryKey: ['rfq-table'] })
        }
        stateReset()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, stateRfqId, stateReset, queryClient],
  )

  const handleDelete = useCallback(() => {
    if (!stateRfqId || !onDeleteRequest) return
    onDeleteRequest(stateRfqId)
  }, [stateRfqId, onDeleteRequest])

  const handleSend = useCallback(async () => {
    await stateHandleSend()
    if (mode === 'new' && onCreated && stateRfqId) {
      onCreated({ id: stateRfqId })
    }
    if (mode === 'existing' && onOfferCreated) {
      onOfferCreated()
    }
    handleOpenChange(false)
  }, [stateHandleSend, stateRfqId, mode, onCreated, onOfferCreated, handleOpenChange])

  const isExisting = mode === 'existing'
  const isWide = state.step > 0

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{
          width: isWide ? '85vw' : '55vw',
          maxWidth: isWide ? '1400px' : '800px',
          minWidth: '640px',
          transition: 'width 0.3s ease',
        }}
        hideCloseButton
        ariaTitle={isExisting ? 'RFQ Details' : 'Create RFQ from Email'}
        overlayClassName="backdrop-blur-none"
      >
        <div className="flex flex-col h-full">
          {state.viewingOfferId ? (
            <OfferDetailView offerId={state.viewingOfferId} onBack={() => state.setViewingOfferId(null)} />
          ) : (
            <>
              {/* Header — minimal: just action buttons */}
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--border)',
                  gap: '4px',
                }}
              >
                {isExisting && onDeleteRequest && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="rounded-sm p-1 text-muted-foreground/70 transition-colors hover:text-destructive focus:outline-none"
                    aria-label={t('tasks_board.detail.delete', 'Delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
                {state.step === 0 && (
                  <WizardStepRequest
                    rfqId={state.rfqId}
                    rfqTitle={state.rfqTitle}
                    rawText={state.rawText}
                    extraction={state.extraction}
                    extracting={state.extracting}
                    creating={state.creating}
                    editableItems={state.editableItems}
                    expandedBoxes={state.expandedBoxes}
                    setExpandedBoxes={state.setExpandedBoxes}
                    editingItems={state.editingItems}
                    expandedPol={state.expandedPol}
                    setExpandedPol={state.setExpandedPol}
                    expandedPod={state.expandedPod}
                    setExpandedPod={state.setExpandedPod}
                    updateItem={state.updateItem}
                    toggleEditing={state.toggleEditing}
                    onExtract={state.handleExtract}
                  />
                )}

                {state.step === 1 && (
                  <WizardStepPricing
                    rfqId={state.rfqId}
                    rfqTitle={state.rfqTitle}
                    rawText={state.rawText}
                    extraction={state.extraction}
                    extracting={state.extracting}
                    editableItems={state.editableItems}
                    calculations={state.calculations}
                    expandedBoxes={state.expandedBoxes}
                    setExpandedBoxes={state.setExpandedBoxes}
                    editingItems={state.editingItems}
                    expandedPol={state.expandedPol}
                    setExpandedPol={state.setExpandedPol}
                    expandedPod={state.expandedPod}
                    setExpandedPod={state.setExpandedPod}
                    importDialogItem={state.importDialogItem}
                    setImportDialogItem={state.setImportDialogItem}
                    historyDialogItem={state.historyDialogItem}
                    setHistoryDialogItem={state.setHistoryDialogItem}
                    expandedOffers={state.expandedOffers}
                    setExpandedOffers={state.setExpandedOffers}
                    existingOffers={state.existingOffers}
                    updateCalculation={state.updateCalculation}
                    updateItem={state.updateItem}
                    toggleEditing={state.toggleEditing}
                    handleAddItem={state.handleAddItem}

                    setViewingOfferId={state.setViewingOfferId}
                    rfqDetail={state.rfqDetail}
                  />
                )}

                {state.step === 2 && (
                  <WizardStepPreview
                    editableItems={state.editableItems}
                    calculations={state.calculations}
                    offerId={state.offerId}
                  />
                )}
              </div>

              {/* Footer */}
              {state.step > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 24px',
                    borderTop: '1px solid var(--border)',
                    flexShrink: 0,
                    background: 'var(--card)',
                  }}
                >
                  <div>
                    {state.step > 1 && (
                      <Button
                        variant="ghost"
                        onClick={() => state.setStep((s) => s - 1)}
                        style={{ gap: '4px' }}
                      >
                        <ArrowLeft style={{ width: 14, height: 14 }} />
                        {t('tasks_board.wizard.back', 'Back')}
                      </Button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {state.step === 1 && (
                      <Button
                        onClick={() => state.setStep(2)}
                        style={{ gap: '4px' }}
                      >
                        {t('tasks_board.wizard.next', 'Next')}
                        <ArrowRight style={{ width: 14, height: 14 }} />
                      </Button>
                    )}
                    {state.step === 2 && (
                      <Button
                        style={{ gap: '4px' }}
                        disabled={state.sending}
                        onClick={handleSend}
                      >
                        {state.sending ? (
                          <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <Send style={{ width: 14, height: 14 }} />
                        )}
                        {state.sending
                          ? t('tasks_board.wizard.creating', 'Creating...')
                          : t('tasks_board.wizard.sendOffer', 'Send Offer')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </SheetContent>
    </Sheet>
  )
}
