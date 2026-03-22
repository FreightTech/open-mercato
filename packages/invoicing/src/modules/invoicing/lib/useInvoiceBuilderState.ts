'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type LineItemState = {
  lineNumber: number
  description: string
  quantity: string
  unit: string
  unitPriceNet: string
  vatRate: string
  vatRateCode: string
  netAmount: string
  vatAmount: string
  grossAmount: string
}

export type InvoiceFormState = {
  invoiceNumber: string
  invoiceDate: string
  serviceDate: string
  dueDate: string
  sellerName: string
  sellerTaxId: string
  sellerAddress: string
  sellerCountryCode: string
  sellerBankAccount: string
  buyerName: string
  buyerTaxId: string
  buyerAddress: string
  buyerCountryCode: string
  currencyCode: string
  paymentMethod: string
  paymentTerms: string
  notes: string
  lineItems: LineItemState[]
}

function emptyLineItem(lineNumber: number): LineItemState {
  return {
    lineNumber,
    description: '',
    quantity: '1',
    unit: 'szt.',
    unitPriceNet: '0',
    vatRate: '23',
    vatRateCode: '23',
    netAmount: '0',
    vatAmount: '0',
    grossAmount: '0',
  }
}

function calcLineAmounts(li: LineItemState): LineItemState {
  const qty = parseFloat(li.quantity) || 0
  const price = parseFloat(li.unitPriceNet) || 0
  const rate = ['zw', 'oo', 'np'].includes(li.vatRateCode) ? 0 : (parseFloat(li.vatRate) || 0)
  const net = qty * price
  const vat = net * rate / 100
  const gross = net + vat
  return {
    ...li,
    netAmount: net.toFixed(2),
    vatAmount: vat.toFixed(2),
    grossAmount: gross.toFixed(2),
  }
}

function calcTotals(items: LineItemState[]) {
  let net = 0, vat = 0, gross = 0
  for (const li of items) {
    net += parseFloat(li.netAmount) || 0
    vat += parseFloat(li.vatAmount) || 0
    gross += parseFloat(li.grossAmount) || 0
  }
  return { netAmount: net.toFixed(2), vatAmount: vat.toFixed(2), grossAmount: gross.toFixed(2) }
}

const initialForm: InvoiceFormState = {
  invoiceNumber: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  serviceDate: new Date().toISOString().split('T')[0],
  dueDate: '',
  sellerName: '',
  sellerTaxId: '',
  sellerAddress: '',
  sellerCountryCode: 'PL',
  sellerBankAccount: '',
  buyerName: '',
  buyerTaxId: '',
  buyerAddress: '',
  buyerCountryCode: '',
  currencyCode: 'PLN',
  paymentMethod: 'przelew',
  paymentTerms: '',
  notes: '',
  lineItems: [emptyLineItem(1)],
}

export function useInvoiceBuilderState(editId?: string | null) {
  const [invoiceId, setInvoiceId] = useState<string | null>(editId || null)
  const [form, setForm] = useState<InvoiceFormState>(initialForm)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const totals = calcTotals(form.lineItems)

  const revokePreviousBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => { revokePreviousBlob() }
  }, [revokePreviousBlob])

  const updateField = useCallback(<K extends keyof InvoiceFormState>(
    field: K,
    value: InvoiceFormState[K]
  ) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }, [])

  const updateLineItem = useCallback((index: number, field: keyof LineItemState, value: string) => {
    setForm(prev => {
      const items = [...prev.lineItems]
      const updated = { ...items[index], [field]: value }

      if (field === 'vatRateCode') {
        if (['zw', 'oo', 'np'].includes(value)) {
          updated.vatRate = '0'
        } else {
          updated.vatRate = value
        }
      }

      items[index] = calcLineAmounts(updated)
      return { ...prev, lineItems: items }
    })
  }, [])

  const addLineItem = useCallback(() => {
    setForm(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, emptyLineItem(prev.lineItems.length + 1)],
    }))
  }, [])

  const removeLineItem = useCallback((index: number) => {
    setForm(prev => {
      const items = prev.lineItems.filter((_, i) => i !== index)
        .map((li, i) => ({ ...li, lineNumber: i + 1 }))
      return { ...prev, lineItems: items.length > 0 ? items : [emptyLineItem(1)] }
    })
  }, [])

  const loadInvoice = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const res = await apiCall(`/api/invoicing/invoices/${id}`)
      if (!res.ok) throw new Error('Failed to load invoice')
      const d = res.result as Record<string, unknown> | null
      if (!d) throw new Error('No data returned')

      const str = (v: unknown) => (typeof v === 'string' ? v : '') || ''
      const dateStr = (v: unknown) => {
        const s = typeof v === 'string' ? v : ''
        return s ? s.split('T')[0] : ''
      }
      const items = Array.isArray(d.lineItems) ? d.lineItems : []

      setForm({
        invoiceNumber: str(d.invoiceNumber),
        invoiceDate: dateStr(d.invoiceDate),
        serviceDate: dateStr(d.serviceDate),
        dueDate: dateStr(d.dueDate),
        sellerName: str(d.sellerName),
        sellerTaxId: str(d.sellerTaxId),
        sellerAddress: str(d.sellerAddress),
        sellerCountryCode: str(d.sellerCountryCode) || 'PL',
        sellerBankAccount: str(d.sellerBankAccount),
        buyerName: str(d.buyerName),
        buyerTaxId: str(d.buyerTaxId),
        buyerAddress: str(d.buyerAddress),
        buyerCountryCode: str(d.buyerCountryCode),
        currencyCode: str(d.currencyCode) || 'PLN',
        paymentMethod: str(d.paymentMethod) || 'przelew',
        paymentTerms: str(d.paymentTerms),
        notes: str(d.notes),
        lineItems: items.length > 0
          ? items.map((li: Record<string, unknown>) => ({
              lineNumber: (li.lineNumber as number) || 1,
              description: str(li.description),
              quantity: str(li.quantity) || '1',
              unit: str(li.unit) || 'szt.',
              unitPriceNet: str(li.unitPriceNet) || '0',
              vatRate: str(li.vatRate) || '23',
              vatRateCode: str(li.vatRateCode) || '23',
              netAmount: str(li.netAmount) || '0',
              vatAmount: str(li.vatAmount) || '0',
              grossAmount: str(li.grossAmount) || '0',
            }))
          : [emptyLineItem(1)],
      })
      setInvoiceId(id)
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async (): Promise<string | null> => {
    setSaving(true)
    try {
      const payload = {
        invoiceNumber: form.invoiceNumber || 'DRAFT',
        invoiceDate: form.invoiceDate || null,
        serviceDate: form.serviceDate || null,
        dueDate: form.dueDate || null,
        sellerName: form.sellerName || null,
        sellerTaxId: form.sellerTaxId || null,
        sellerAddress: form.sellerAddress || null,
        sellerCountryCode: form.sellerCountryCode || null,
        sellerBankAccount: form.sellerBankAccount || null,
        buyerName: form.buyerName || null,
        buyerTaxId: form.buyerTaxId || null,
        buyerAddress: form.buyerAddress || null,
        buyerCountryCode: form.buyerCountryCode || null,
        currencyCode: form.currencyCode || 'PLN',
        paymentMethod: form.paymentMethod || null,
        paymentTerms: form.paymentTerms || null,
        notes: form.notes || null,
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
        lineItems: form.lineItems.map(li => ({
          lineNumber: li.lineNumber,
          description: li.description || 'Item',
          quantity: li.quantity || '1',
          unit: li.unit || null,
          unitPriceNet: li.unitPriceNet || '0',
          vatRate: li.vatRate || '0',
          vatRateCode: li.vatRateCode || null,
          netAmount: li.netAmount || '0',
          vatAmount: li.vatAmount || '0',
          grossAmount: li.grossAmount || '0',
        })),
      }

      if (invoiceId) {
        const res = await apiCall(`/api/invoicing/invoices/${invoiceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to update invoice')
        return invoiceId
      } else {
        const res = await apiCall('/api/invoicing/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            direction: 'outgoing',
            sourceType: 'manual',
            status: 'draft',
          }),
        })
        if (!res.ok) throw new Error('Failed to create invoice')
        const data = res.result as Record<string, unknown>
        const newId = data?.id as string
        setInvoiceId(newId)
        return newId
      }
    } finally {
      setSaving(false)
    }
  }, [form, invoiceId, totals])

  const loadPdfPreview = useCallback(async (id?: string) => {
    const targetId = id || invoiceId
    if (!targetId) return
    setPdfLoading(true)
    setPdfError(null)
    try {
      const response = await fetch(`/api/invoicing/invoices/${targetId}/pdf`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      revokePreviousBlob()
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      setPdfBlobUrl(url)
    } catch {
      setPdfError('Failed to generate preview')
    } finally {
      setPdfLoading(false)
    }
  }, [invoiceId, revokePreviousBlob])

  const saveAndPreview = useCallback(async () => {
    const id = await save()
    if (id) await loadPdfPreview(id)
  }, [save, loadPdfPreview])

  const handleDownload = useCallback(() => {
    if (!pdfBlobUrl) return
    const anchor = document.createElement('a')
    anchor.href = pdfBlobUrl
    anchor.download = `${form.invoiceNumber || 'invoice'}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }, [pdfBlobUrl, form.invoiceNumber])

  return {
    invoiceId,
    form,
    totals,
    saving,
    loading,
    pdfBlobUrl,
    pdfLoading,
    pdfError,
    updateField,
    updateLineItem,
    addLineItem,
    removeLineItem,
    loadInvoice,
    save,
    loadPdfPreview,
    saveAndPreview,
    handleDownload,
  }
}
