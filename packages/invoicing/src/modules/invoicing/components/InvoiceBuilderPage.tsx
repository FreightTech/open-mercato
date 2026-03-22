'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@open-mercato/ui/primitives/button'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { InvoicePdfPreview } from './InvoicePdfPreview'
import { InvoiceFormPanel } from './InvoiceFormPanel'
import { useInvoiceBuilderState } from '../lib/useInvoiceBuilderState'

type Props = {
  editId?: string | null
}

export function InvoiceBuilderPage({ editId }: Props) {
  const router = useRouter()
  const state = useInvoiceBuilderState(editId)

  useEffect(() => {
    if (editId) {
      state.loadInvoice(editId).then(() => {
        state.loadPdfPreview(editId)
      })
    }
  }, [editId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ flexShrink: 0, background: 'var(--background)' }}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push('/backend/invoicing')}
            title="Back to list"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
            {editId ? 'Edit Invoice' : 'New Invoice'}
            {state.form.invoiceNumber && (
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 400, marginLeft: '8px' }}>
                {state.form.invoiceNumber}
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={state.saveAndPreview}
            disabled={state.saving}
          >
            {state.saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Save Draft
          </Button>
        </div>
      </div>

      {/* Body: Split view */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <InvoicePdfPreview
          pdfBlobUrl={state.pdfBlobUrl}
          pdfLoading={state.pdfLoading}
          pdfError={state.pdfError}
          invoiceId={state.invoiceId}
          onRefresh={() => state.loadPdfPreview()}
          onDownload={state.handleDownload}
        />
        <InvoiceFormPanel
          form={state.form}
          totals={state.totals}
          onUpdateField={state.updateField}
          onUpdateLineItem={state.updateLineItem}
          onAddLineItem={state.addLineItem}
          onRemoveLineItem={state.removeLineItem}
        />
      </div>
    </div>
  )
}
