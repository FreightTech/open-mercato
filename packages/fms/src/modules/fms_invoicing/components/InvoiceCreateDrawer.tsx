'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Save, Eye, EyeOff, Loader2, RefreshCw, Download, FileWarning } from 'lucide-react'
import { InvoiceFormPanel } from './InvoiceFormPanel'
import { useInvoiceBuilderState } from '../lib/useInvoiceBuilderState'

interface InvoiceCreateDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function InvoiceCreateDrawer({
  open,
  onOpenChange,
  onCreated,
}: InvoiceCreateDrawerProps) {
  const [showPreview, setShowPreview] = useState(false)
  const state = useInvoiceBuilderState()

  useEffect(() => {
    if (open) {
      state.loadSellerDefaults()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    try {
      const id = await state.save()
      if (id) {
        flash('Invoice saved as draft', 'success')
        onCreated?.()
        onOpenChange(false)
      }
    } catch {
      flash('Failed to save invoice', 'error')
    }
  }, [state.save, onCreated, onOpenChange]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTogglePreview = useCallback(() => {
    setShowPreview(prev => {
      if (!prev) {
        state.generatePreview()
      }
      return !prev
    })
  }, [state.generatePreview]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cmd/Ctrl+Enter to save
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, handleSave])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 overflow-hidden"
        style={{ width: showPreview ? '80vw' : '56rem', maxWidth: showPreview ? '80vw' : '56rem' }}
        overlayClassName="backdrop-blur-none bg-black/30"
        ariaTitle="New Invoice"
        hideCloseButton
        onEscapeKeyDown={() => onOpenChange(false)}
      >
        <div className="flex h-full">
          {/* Left panel — PDF preview (only when toggled) */}
          {showPreview && (
            <div className="flex-1 flex-shrink-0 border-r flex flex-col min-w-0">
              {/* Preview toolbar */}
              <div className="flex items-center justify-between px-2 py-1 border-b" style={{ background: 'var(--muted)', flexShrink: 0 }}>
                <span className="text-xs text-muted-foreground font-medium">PDF Preview</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => state.generatePreview()} disabled={state.pdfLoading} title="Refresh">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={state.handleDownload} disabled={!state.pdfBlobUrl} title="Download">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {/* Preview content */}
              <div className="flex-1 overflow-hidden bg-muted flex items-center justify-center">
                {state.pdfLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                    <span className="text-xs text-muted-foreground">Generating preview...</span>
                  </div>
                ) : state.pdfError ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileWarning className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{state.pdfError}</span>
                    <Button variant="outline" size="sm" onClick={() => state.generatePreview()} className="mt-1">Retry</Button>
                  </div>
                ) : state.pdfBlobUrl ? (
                  <iframe src={`${state.pdfBlobUrl}#navpanes=0&view=FitH`} className="w-full h-full border-none" title="PDF Preview" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileWarning className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Click refresh to generate preview</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right panel — Form (fixed width so it doesn't shrink) */}
          <div className="flex flex-col min-w-0" style={{ width: showPreview ? '50%' : '100%', flexShrink: 0 }}>
            {/* Header */}
            <div className="flex-shrink-0 border-b bg-background px-4 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">New Invoice</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showPreview ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={handleTogglePreview}
                  >
                    {showPreview ? (
                      <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Preview
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSave}
                    disabled={state.saving}
                  >
                    {state.saving ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Save Draft
                  </Button>
                </div>
              </div>
            </div>

            {/* Form body */}
            <InvoiceFormPanel
              form={state.form}
              totals={state.totals}
              onUpdateField={state.updateField}
              onUpdateLineItem={state.updateLineItem}
              onAddLineItem={state.addLineItem}
              onRemoveLineItem={state.removeLineItem}
              onSearchContractors={state.searchContractors}
              onSelectContractor={state.selectContractorAsBuyer}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
