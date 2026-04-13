import React, { useCallback, useState, useRef, useEffect } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { X, ArrowRight, ArrowLeft, Send, Trash2, Pencil, Eye, Plus, Download } from 'lucide-react'
import { OfferWizardSheet } from '../../fms_offers/components/OfferWizardSheet'
import { WizardStepRequest } from './WizardStepRequest'
import { WizardStepPricing } from './WizardStepPricing'
import { WizardStepPreview } from './WizardStepPreview'
import { SendOfferDialog } from '../../fms_offers/components/SendOfferDialog'
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

  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [offerTabLabel, setOfferTabLabel] = useState('Offer #1')
  const [editingTabLabel, setEditingTabLabel] = useState(false)
  const [tabLabelDraft, setTabLabelDraft] = useState('Offer #1')
  const tabInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTabLabel && tabInputRef.current) {
      tabInputRef.current.focus()
      tabInputRef.current.select()
    }
  }, [editingTabLabel])

  const { rfqId: stateRfqId, reset: stateReset } = state

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

  const handleOpenSendDialog = useCallback(async () => {
    await state.flushPendingSync()
    setSendDialogOpen(true)
  }, [state.flushPendingSync])

  const handleSendSuccess = useCallback(() => {
    setSendDialogOpen(false)
    if (mode === 'new' && onCreated && stateRfqId) {
      onCreated({ id: stateRfqId })
    }
    if (mode === 'existing' && onOfferCreated) {
      onOfferCreated()
    }
    handleOpenChange(false)
  }, [stateRfqId, mode, onCreated, onOfferCreated, handleOpenChange])

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

              {/* Step banner — above offer tabs */}
              {state.step === 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 16px',
                  background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                  borderBottom: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
                  flexShrink: 0,
                }}>
                  <Pencil style={{ width: 14, height: 14, color: 'var(--primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: 'var(--foreground)' }}>
                    <strong>{t('fms_offers.wizard.pricingBanner.title', 'Internal pricing')}</strong>
                    {' — '}
                    {t('fms_offers.wizard.pricingBanner.desc', 'add line items, set rates and margins. Click Next to proceed to preview.')}
                  </span>
                </div>
              )}
              {state.step === 2 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 16px',
                  background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                  borderBottom: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
                  flexShrink: 0,
                }}>
                  <Eye style={{ width: 14, height: 14, color: 'var(--primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: 'var(--foreground)' }}>
                    <strong>{t('fms_offers.wizard.previewBanner.title', 'Offer preview')}</strong>
                    {' — '}
                    {t('fms_offers.wizard.previewBanner.desc', 'this is how the offer will look to the client. Review and send.')}
                  </span>
                </div>
              )}

              {/* Offer tabs — shown on pricing and preview steps */}
              {state.step > 0 && (
                <div style={{ display: 'flex', alignItems: 'end', gap: '4px', padding: '8px 16px 0', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--card)' }}>
                  {(state.offerTabs.length > 0 ? state.offerTabs : [{ offerId: state.offerId || '', label: offerTabLabel, offerNumber: state.offerNumber || '' }]).map((tab, idx) => {
                    const isActive = idx === state.activeOfferTabIndex
                    const isEditingThis = editingTabLabel && idx === state.activeOfferTabIndex
                    return isEditingThis ? (
                      <input
                        key={tab.offerId || idx}
                        ref={tabInputRef}
                        type="text"
                        value={tabLabelDraft}
                        onChange={(e) => setTabLabelDraft(e.target.value)}
                        onBlur={() => {
                          const newLabel = tabLabelDraft.trim()
                          if (newLabel) {
                            setOfferTabLabel(newLabel)
                            // Persist tab label to offer notes
                            if (state.offerId) {
                              apiCall(`/api/fms_offers/offers/${state.offerId}`, {
                                method: 'PUT',
                                body: JSON.stringify({ offerLabel: newLabel }),
                                headers: { 'Content-Type': 'application/json' },
                              })
                            }
                          }
                          setEditingTabLabel(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const newLabel = tabLabelDraft.trim()
                            if (newLabel) {
                              setOfferTabLabel(newLabel)
                              if (state.offerId) {
                                apiCall(`/api/fms_offers/offers/${state.offerId}`, {
                                  method: 'PUT',
                                  body: JSON.stringify({ offerLabel: newLabel }),
                                  headers: { 'Content-Type': 'application/json' },
                                })
                              }
                            }
                            setEditingTabLabel(false)
                          }
                          if (e.key === 'Escape') {
                            setTabLabelDraft(offerTabLabel)
                            setEditingTabLabel(false)
                          }
                        }}
                        style={{
                          padding: '6px 12px', fontSize: '13px', fontWeight: 600,
                          border: '1px solid var(--primary)', borderRadius: '6px',
                          background: 'var(--background)', color: 'var(--foreground)',
                          fontFamily: 'inherit', outline: 'none', marginBottom: '-1px', minWidth: '80px',
                        }}
                      />
                    ) : (
                      <span
                        key={tab.offerId || idx}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          borderBottom: isActive ? '2px solid var(--foreground)' : '2px solid transparent',
                          marginBottom: '-1px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => state.switchOfferTab(idx)}
                          onDoubleClick={() => {
                            if (isActive) {
                              setTabLabelDraft(tab.label || offerTabLabel)
                              setEditingTabLabel(true)
                            }
                          }}
                          style={{
                            padding: '8px 8px 8px 16px', fontSize: '13px', fontWeight: 600,
                            border: 'none', background: 'transparent',
                            color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'color 0.15s',
                          }}
                        >
                          {tab.label}
                        </button>
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); state.deleteOfferTab(idx) }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 16, height: 16, border: 'none', background: 'transparent',
                              cursor: 'pointer', color: 'var(--muted-foreground)', borderRadius: '3px',
                              fontSize: '14px', lineHeight: 1, padding: 0, marginRight: '8px',
                              transition: 'color 0.1s, background 0.1s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = 'rgba(220,38,38,0.1)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-foreground)'; e.currentTarget.style.background = 'transparent' }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    )
                  })}
                  <button
                    type="button"
                    title={t('fms_offers.wizard.addOfferTab', 'Add offer version')}
                    onClick={() => state.createOfferTab()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: '6px', border: 'none',
                      background: 'transparent', color: 'var(--muted-foreground)',
                      cursor: 'pointer', transition: 'background 0.1s, color 0.1s', marginBottom: '2px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--foreground)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted-foreground)' }}
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              )}

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
                    handleRemoveItem={state.handleRemoveItem}
                    setViewingOfferId={state.setViewingOfferId}
                    rfqDetail={state.rfqDetail}
                  />
                )}

                {state.step === 2 && (
                  <WizardStepPreview
                    editableItems={state.editableItems}
                    calculations={state.calculations}
                    offerId={state.offerId}
                    flushPendingSync={state.flushPendingSync}
                    specialTerms={state.specialTerms}
                    onSpecialTermsChange={state.updateSpecialTerms}
                    initialBaseCurrency={state.draftOffer?.baseCurrency}
                    initialExchangeRates={state.draftOffer?.exchangeRates}
                    clientName={state.rfqDetail?.companyName || state.extraction?.extraction?.companyName || ''}
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
                      <>
                        <Button
                          variant="outline"
                          style={{ gap: '4px' }}
                          disabled={!state.offerId}
                          onClick={async () => {
                            if (!state.offerId) return
                            if (state.flushPendingSync) await state.flushPendingSync()
                            const response = await fetch(`/api/fms_offers/offers/${state.offerId}/pdf`)
                            if (!response.ok) return
                            const blob = await response.blob()
                            const url = URL.createObjectURL(blob)
                            const anchor = document.createElement('a')
                            anchor.href = url
                            anchor.download = `offer-${state.offerId}.pdf`
                            document.body.appendChild(anchor)
                            anchor.click()
                            document.body.removeChild(anchor)
                            URL.revokeObjectURL(url)
                          }}
                        >
                          <Download style={{ width: 14, height: 14 }} />
                          {t('tasks_board.wizard.downloadPdf', 'Download PDF')}
                        </Button>
                        <Button
                          style={{ gap: '4px' }}
                          disabled={!state.offerId}
                          onClick={handleOpenSendDialog}
                        >
                          <Send style={{ width: 14, height: 14 }} />
                          {t('tasks_board.wizard.sendOffer', 'Send Offer')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </SheetContent>

      {state.offerId && (
        <SendOfferDialog
          offerId={state.offerId}
          offerNumber={state.offerNumber || ''}
          clientName={state.rfqDetail?.companyName || state.extraction?.extraction?.companyName || ''}
          currentStatus="draft"
          open={sendDialogOpen}
          onClose={() => setSendDialogOpen(false)}
          onSuccess={handleSendSuccess}
        />
      )}

      <OfferWizardSheet
        open={!!state.viewingOfferId}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) state.setViewingOfferId(null)
        }}
        existingOfferId={state.viewingOfferId}
      />
    </Sheet>
  )
}
