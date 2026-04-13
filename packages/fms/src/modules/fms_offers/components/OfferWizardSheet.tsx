import React, { useCallback, useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { X, ArrowRight, ArrowLeft, Send, Loader2, Save, FolderOpen, ChevronDown, CheckCircle2, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useOfferWizardState } from '../lib/useOfferWizardState'
import { WizardStepPricing } from '../../tasks_board/components/WizardStepPricing'
import { WizardStepPreview } from '../../tasks_board/components/WizardStepPreview'
import { OfferContextPanel } from './OfferContextPanel'
import { ConvertToProjectDialog } from './ConvertToProjectDialog'
import type { FmsOfferStatus } from '../data/types'

const STATUS_OPTIONS: Array<{ status: FmsOfferStatus; label: string; color: string; bg: string }> = [
  { status: 'draft', label: 'Draft', color: '#374151', bg: '#f3f4f6' },
  { status: 'sent', label: 'Sent', color: '#1d4ed8', bg: '#dbeafe' },
  { status: 'accepted', label: 'Accepted', color: '#15803d', bg: '#dcfce7' },
  { status: 'declined', label: 'Declined', color: '#dc2626', bg: '#fee2e2' },
  { status: 'expired', label: 'Expired', color: '#c2410c', bg: '#ffedd5' },
]

type OfferWizardSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  existingOfferId?: string | null
  /** When opened from a parent dialog (e.g. RFQ wizard), show back button */
  onBack?: () => void
  /** Close all parent dialogs when X is clicked */
  onCloseAll?: () => void
}

export function OfferWizardSheet({ open, onOpenChange, onCreated, existingOfferId, onBack, onCloseAll }: OfferWizardSheetProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const state = useOfferWizardState({ open, existingOfferId })

  const [saving, setSaving] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [convertDialogData, setConvertDialogData] = useState<any>(null)
  const [offerNumber, setOfferNumber] = useState('')
  const statusRef = useRef<HTMLDivElement>(null)

  // Offer tab label editing
  const [editingTabLabel, setEditingTabLabel] = useState(false)
  const [tabLabelDraft, setTabLabelDraft] = useState('')
  const tabInputRef = useRef<HTMLInputElement>(null)

  // Focus tab label input when editing
  useEffect(() => {
    if (editingTabLabel && tabInputRef.current) {
      tabInputRef.current.focus()
      tabInputRef.current.select()
    }
  }, [editingTabLabel])

  // Close status dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false)
      }
    }
    if (statusDropdownOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [statusDropdownOpen])

  const handleClose = useCallback(() => {
    state.reset()
    queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
    onOpenChange(false)
    onCloseAll?.()
  }, [state, onOpenChange, queryClient, onCloseAll])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleClose()
        return
      }
      onOpenChange(nextOpen)
    },
    [handleClose, onOpenChange],
  )

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await state.flushPendingSync()
      queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
    } catch {
      // Non-critical
    } finally {
      setSaving(false)
    }
  }, [state, saving, queryClient])

  const handleStatusChange = useCallback(async (newStatus: FmsOfferStatus) => {
    if (!state.offerId) return
    setStatusDropdownOpen(false)
    await apiCall(`/api/fms_offers/offers/${state.offerId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
      headers: { 'Content-Type': 'application/json' },
    })
    state.setOfferStatus(newStatus)
    queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
  }, [state.offerId, queryClient])

  const handleOpenConvertDialog = useCallback(async () => {
    if (!state.offerId) return
    const res = await apiCall<Record<string, any>>(`/api/fms_offers/offers/${state.offerId}`)
    if (res.ok && res.result) {
      setConvertDialogData(res.result.convertDialogData || null)
      setOfferNumber(res.result.offerNumber || '')
    }
    setShowConvertDialog(true)
  }, [state.offerId])

  const handleSend = useCallback(async () => {
    try {
      await state.handleSend()
      onCreated?.()
      handleClose()
    } catch {
      // Error handled in handleSend
    }
  }, [state, onCreated, handleClose])

  const currentStatusConfig = STATUS_OPTIONS.find((s) => s.status === state.offerStatus) || STATUS_OPTIONS[0]
  const availableStatuses = STATUS_OPTIONS.filter((s) => s.status !== state.offerStatus && s.status !== 'expired')

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
        ariaTitle={state.isEditMode ? 'Edit Offer' : 'Create Offer'}
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
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--muted-foreground)', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px', borderRadius: '6px' }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} />
                {t('fms_offers.wizard.backToRfq', 'Back to RFQ')}
              </button>
            )}
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

          {/* Offer tabs */}
          {state.offerTabs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'end', gap: '4px', padding: '8px 16px 0', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--card)' }}>
              {state.offerTabs.map((tab, idx) => {
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
                      if (newLabel && state.offerId) {
                        apiCall(`/api/fms_offers/offers/${state.offerId}`, {
                          method: 'PUT',
                          body: JSON.stringify({ offerLabel: newLabel }),
                          headers: { 'Content-Type': 'application/json' },
                        })
                      }
                      setEditingTabLabel(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const newLabel = tabLabelDraft.trim()
                        if (newLabel && state.offerId) {
                          apiCall(`/api/fms_offers/offers/${state.offerId}`, {
                            method: 'PUT',
                            body: JSON.stringify({ offerLabel: newLabel }),
                            headers: { 'Content-Type': 'application/json' },
                          })
                        }
                        setEditingTabLabel(false)
                      }
                      if (e.key === 'Escape') {
                        setTabLabelDraft(tab.label)
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
                          setTabLabelDraft(tab.label)
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

          {/* Body — key by offerId to force remount when switching offer tabs */}
          <div key={state.offerId || 'new'} style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {state.step === 1 && (
              <>
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

                <OfferContextPanel
                  offerId={state.offerId}
                  rfqId={null}
                  contractorIdProp={state.contractorId}
                  contractorNameProp={state.contractorName}
                  onContractorChangeProp={state.handleContractorChange}
                  cargoDescription={state.editableItems[0]?.cargoDescription}
                  onCargoDescriptionChange={(value) => state.updateItem(0, { cargoDescription: value })}
                  projects={state.projects}
                />
              </>
            )}

            {state.step === 2 && (
              <WizardStepPreview
                editableItems={state.editableItems}
                calculations={state.calculations}
                offerId={state.offerId}
                specialTerms={state.specialTerms}
                onSpecialTermsChange={state.updateSpecialTerms}
                clientName={state.contractorName || undefined}
                offerTabs={state.offerTabs}
              />
            )}
          </div>

          {/* Footer */}
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
            {/* Left side: Back, Convert to Project, Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

              {state.isEditMode && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenConvertDialog}
                  style={{ gap: '6px' }}
                >
                  <FolderOpen style={{ width: 14, height: 14 }} />
                  {t('fms_offers.wizard.convertToFile', 'Convert to File')}
                </Button>
              )}

              {/* Status dropdown — edit mode */}
              {state.isEditMode && (
                <div ref={statusRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 16px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: currentStatusConfig.bg,
                      color: currentStatusConfig.color,
                      fontFamily: 'inherit',
                    }}
                  >
                    <CheckCircle2 style={{ width: 14, height: 14 }} />
                    {currentStatusConfig.label}
                    <ChevronDown style={{ width: 12, height: 12 }} />
                  </button>
                  {statusDropdownOpen && (
                    <div style={{
                      position: 'absolute', bottom: '100%', left: 0, marginBottom: '4px',
                      minWidth: '180px', background: 'var(--popover, white)',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '4px', zIndex: 50,
                    }}>
                      {availableStatuses.map((item) => (
                        <button
                          key={item.status}
                          type="button"
                          onClick={() => handleStatusChange(item.status)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                            padding: '8px 12px', fontSize: '13px', fontWeight: 500, border: 'none',
                            background: 'transparent', cursor: 'pointer', borderRadius: '6px',
                            fontFamily: 'inherit', textAlign: 'left', color: 'inherit',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right side: Save, Next/Send */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving}
                style={{ gap: '4px' }}
              >
                {saving ? (
                  <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Save style={{ width: 14, height: 14 }} />
                )}
                {saving
                  ? t('fms_offers.wizard.saving', 'Saving...')
                  : t('fms_offers.wizard.save', 'Save')}
              </Button>

              {state.step === 1 && (
                <Button onClick={() => state.setStep(2)} style={{ gap: '4px' }}>
                  {t('fms_offers.wizard.next', 'Next')}
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </Button>
              )}

              {state.step === 2 && (
                <Button onClick={handleSend} disabled={state.sending} style={{ gap: '4px' }}>
                  {state.sending ? (
                    <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Send style={{ width: 14, height: 14 }} />
                  )}
                  {state.sending
                    ? t('fms_offers.wizard.sending', 'Sending...')
                    : t('fms_offers.wizard.sendToClient', 'Send to Client')}
                </Button>
              )}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </SheetContent>

      {state.offerId && (
        <ConvertToProjectDialog
          offerId={state.offerId}
          offerNumber={offerNumber}
          clientName={state.contractorName || ''}
          totalAmount={0}
          currencyCode="USD"
          convertDialogData={convertDialogData}
          open={showConvertDialog}
          onClose={() => setShowConvertDialog(false)}
        />
      )}
    </Sheet>
  )
}
