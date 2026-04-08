import React, { useCallback } from 'react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { X, ArrowRight, ArrowLeft, Send, Loader2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOfferWizardState } from '../lib/useOfferWizardState'
import { WizardStepPricing } from '../../tasks_board/components/WizardStepPricing'
import { WizardStepPreview } from '../../tasks_board/components/WizardStepPreview'
import { OfferContextPanel } from './OfferContextPanel'

type OfferWizardSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function OfferWizardSheet({ open, onOpenChange, onCreated }: OfferWizardSheetProps) {
  const t = useT()
  const state = useOfferWizardState({ open })

  const handleClose = useCallback(() => {
    state.reset()
    onOpenChange(false)
  }, [state, onOpenChange])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) state.reset()
      onOpenChange(nextOpen)
    },
    [state, onOpenChange],
  )

  const handleSend = useCallback(async () => {
    try {
      await state.handleSend()
      onCreated?.()
      handleClose()
    } catch (error) {
      console.error('[OfferWizard] Failed to create offer:', error)
    }
  }, [state, onCreated, handleClose])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{
          width: '85vw',
          maxWidth: '1400px',
          minWidth: '640px',
        }}
        hideCloseButton
        ariaTitle="Create Offer"
        overlayClassName="backdrop-blur-none"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
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
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleClose}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {state.step === 1 && (
              <>
                {/* Left: Pricing items */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <WizardStepPricing
                      rfqId={null}
                      rfqTitle=""
                      rawText=""
                      extraction={null}
                      extracting={false}
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
                      expandedOffers={new Set<string>()}
                      setExpandedOffers={() => {}}
                      existingOffers={[]}
                      updateCalculation={state.updateCalculation}
                      updateItem={state.updateItem}
                      toggleEditing={state.toggleEditing}
                      handleAddItem={state.handleAddItem}
                      handleRemoveItem={state.handleRemoveItem}
                      setViewingOfferId={() => {}}
                      rfqDetail={null}
                    />
                  </div>
                </div>

                {/* Right: Context panel */}
                <OfferContextPanel
                  offerId={state.offerId}
                  rfqId={null}
                />
              </>
            )}

            {state.step === 2 && (
              <WizardStepPreview
                editableItems={state.editableItems}
                calculations={state.calculations}
                offerId={state.offerId}
                flushPendingSync={state.flushPendingSync}
                specialTerms={state.specialTerms}
                onSpecialTermsChange={state.updateSpecialTerms}
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
                    {t('fms_offers.wizard.back', 'Back')}
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {state.step === 1 && (
                  <Button
                    onClick={() => state.setStep(2)}
                    style={{ gap: '4px' }}
                  >
                    {t('fms_offers.wizard.next', 'Next')}
                    <ArrowRight style={{ width: 14, height: 14 }} />
                  </Button>
                )}
                {state.step === 2 && (
                  <Button
                    onClick={handleSend}
                    disabled={state.sending}
                    style={{ gap: '4px' }}
                  >
                    {state.sending ? (
                      <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Send style={{ width: 14, height: 14 }} />
                    )}
                    {state.sending
                      ? t('fms_offers.wizard.creating', 'Creating...')
                      : t('fms_offers.wizard.createOffer', 'Create Offer')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </SheetContent>
    </Sheet>
  )
}
