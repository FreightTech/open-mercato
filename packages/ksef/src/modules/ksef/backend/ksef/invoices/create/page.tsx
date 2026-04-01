"use client"

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'

interface LineItemForm {
  key: string
  lineNumber: number
  description: string
  quantity: string
  unit: string
  unitPriceNet: string
  netAmount: string
  vatAmount: string
  vatRate: string
  vatRateCode: string
  gtuCode: string
}

function createEmptyLineItem(lineNumber: number): LineItemForm {
  return {
    key: crypto.randomUUID(),
    lineNumber,
    description: '',
    quantity: '1',
    unit: 'szt.',
    unitPriceNet: '0',
    netAmount: '0',
    vatAmount: '0',
    vatRate: '23',
    vatRateCode: '',
    gtuCode: '',
  }
}

export default function KsefInvoiceCreatePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')

  const [loading, setLoading] = React.useState(!!editId)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [invoiceNumber, setInvoiceNumber] = React.useState('')
  const [invoiceDate, setInvoiceDate] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [serviceDate, setServiceDate] = React.useState('')
  const [direction, setDirection] = React.useState<'outgoing' | 'incoming'>('outgoing')
  const [invoiceType, setInvoiceType] = React.useState('VAT')
  const [currencyCode, setCurrencyCode] = React.useState('PLN')
  const [paymentMethod, setPaymentMethod] = React.useState('')

  const [sellerName, setSellerName] = React.useState('')
  const [sellerTaxId, setSellerTaxId] = React.useState('')
  const [sellerAddress, setSellerAddress] = React.useState('')
  const [sellerCountryCode, setSellerCountryCode] = React.useState('PL')
  const [sellerBankAccount, setSellerBankAccount] = React.useState('')

  const [buyerName, setBuyerName] = React.useState('')
  const [buyerTaxId, setBuyerTaxId] = React.useState('')
  const [buyerAddress, setBuyerAddress] = React.useState('')
  const [buyerCountryCode, setBuyerCountryCode] = React.useState('PL')

  const [lineItems, setLineItems] = React.useState<LineItemForm[]>([createEmptyLineItem(1)])

  React.useEffect(() => {
    if (!editId) return
    async function loadInvoice() {
      const result = await apiCall<Record<string, unknown>>(`/api/ksef/invoices/${editId}`)
      if (!result.ok) {
        setError('Invoice not found')
        setLoading(false)
        return
      }
      const inv = result.result as Record<string, unknown>
      setInvoiceNumber(inv.invoiceNumber as string ?? '')
      setInvoiceDate(inv.invoiceDate ? String(inv.invoiceDate).substring(0, 10) : '')
      setDueDate(inv.dueDate ? String(inv.dueDate).substring(0, 10) : '')
      setServiceDate(inv.serviceDate ? String(inv.serviceDate).substring(0, 10) : '')
      setDirection(inv.direction as 'outgoing' | 'incoming' ?? 'outgoing')
      setInvoiceType(inv.invoiceType as string ?? 'VAT')
      setCurrencyCode(inv.currencyCode as string ?? 'PLN')
      setPaymentMethod(inv.paymentMethod as string ?? '')
      setSellerName(inv.sellerName as string ?? '')
      setSellerTaxId(inv.sellerTaxId as string ?? '')
      setSellerAddress(inv.sellerAddress as string ?? '')
      setSellerCountryCode(inv.sellerCountryCode as string ?? 'PL')
      setSellerBankAccount(inv.sellerBankAccount as string ?? '')
      setBuyerName(inv.buyerName as string ?? '')
      setBuyerTaxId(inv.buyerTaxId as string ?? '')
      setBuyerAddress(inv.buyerAddress as string ?? '')
      setBuyerCountryCode(inv.buyerCountryCode as string ?? 'PL')

      const items = inv.lineItems as Array<Record<string, unknown>> ?? []
      if (items.length > 0) {
        setLineItems(items.map((li, idx) => ({
          key: crypto.randomUUID(),
          lineNumber: (li.lineNumber as number) ?? idx + 1,
          description: (li.description as string) ?? '',
          quantity: String(li.quantity ?? '1'),
          unit: (li.unit as string) ?? '',
          unitPriceNet: String(li.unitPriceNet ?? '0'),
          netAmount: String(li.netAmount ?? '0'),
          vatAmount: String(li.vatAmount ?? '0'),
          vatRate: (li.vatRate as string) ?? '23',
          vatRateCode: (li.vatRateCode as string) ?? '',
          gtuCode: (li.gtuCode as string) ?? '',
        })))
      }
      setLoading(false)
    }
    loadInvoice()
  }, [editId])

  const updateLineItem = (index: number, field: keyof LineItemForm, value: string) => {
    setLineItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }

      // Auto-calculate net amount
      if (field === 'quantity' || field === 'unitPriceNet') {
        const qty = parseFloat(updated[index].quantity) || 0
        const price = parseFloat(updated[index].unitPriceNet) || 0
        const net = Math.round(qty * price * 100) / 100
        updated[index].netAmount = String(net)
        const vatRate = parseFloat(updated[index].vatRate) || 0
        updated[index].vatAmount = String(Math.round(net * (vatRate / 100) * 100) / 100)
      }
      if (field === 'vatRate') {
        const net = parseFloat(updated[index].netAmount) || 0
        const rate = parseFloat(value) || 0
        updated[index].vatAmount = String(Math.round(net * (rate / 100) * 100) / 100)
      }

      return updated
    })
  }

  const addLineItem = () => {
    setLineItems((prev) => [...prev, createEmptyLineItem(prev.length + 1)])
  }

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index).map((li, i) => ({ ...li, lineNumber: i + 1 })))
  }

  const totals = React.useMemo(() => {
    let net = 0
    let vat = 0
    for (const li of lineItems) {
      net += parseFloat(li.netAmount) || 0
      vat += parseFloat(li.vatAmount) || 0
    }
    return {
      net: Math.round(net * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      gross: Math.round((net + vat) * 100) / 100,
    }
  }, [lineItems])

  const handleSave = async () => {
    setError(null)
    setSaving(true)

    const payload = {
      invoiceNumber,
      invoiceDate: invoiceDate || null,
      dueDate: dueDate || null,
      serviceDate: serviceDate || null,
      direction,
      invoiceType,
      currencyCode,
      paymentMethod: paymentMethod || null,
      sellerName: sellerName || null,
      sellerTaxId: sellerTaxId || null,
      sellerAddress: sellerAddress || null,
      sellerCountryCode: sellerCountryCode || null,
      sellerBankAccount: sellerBankAccount || null,
      buyerName: buyerName || null,
      buyerTaxId: buyerTaxId || null,
      buyerAddress: buyerAddress || null,
      buyerCountryCode: buyerCountryCode || null,
      netAmount: String(totals.net),
      vatAmount: String(totals.vat),
      grossAmount: String(totals.gross),
      lineItems: lineItems.map((li) => ({
        lineNumber: li.lineNumber,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit || null,
        unitPriceNet: li.unitPriceNet,
        netAmount: li.netAmount,
        vatAmount: li.vatAmount,
        vatRate: li.vatRate,
        vatRateCode: li.vatRateCode || null,
        gtuCode: li.gtuCode || null,
      })),
    }

    const url = editId ? `/api/ksef/invoices/${editId}` : '/api/ksef/invoices'
    const method = editId ? 'PUT' : 'POST'

    const result = await apiCall<{ id: string }>(url, { method, body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } })

    if (result.ok) {
      const invoiceId = editId ?? (result.result as { id: string } | null)?.id
      router.push(`/backend/ksef/invoices/${invoiceId}`)
    } else {
      setError((result as { error?: string }).error ?? 'Failed to save invoice')
    }
    setSaving(false)
  }

  if (loading) return <LoadingMessage />

  const inputCls = 'rounded-md border px-3 py-1.5 text-sm bg-background w-full'
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{editId ? 'Edit Invoice' : 'New Invoice'}</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Invoice'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">Invoice Info</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>Invoice Number *</label>
            <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Invoice Date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Service Date</label>
            <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'outgoing' | 'incoming')} className={inputCls}>
              <option value="outgoing">Outgoing</option>
              <option value="incoming">Incoming</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Invoice Type</label>
            <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)} className={inputCls}>
              <option value="VAT">VAT</option>
              <option value="KOR">Correction (KOR)</option>
              <option value="KOR_ZAL">Correction Advance (KOR_ZAL)</option>
              <option value="KOR_ROZ">Correction Settlement (KOR_ROZ)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <input type="text" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Payment Method</label>
            <input type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls} placeholder="e.g. transfer" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">Seller</h2>
          <div className="space-y-3">
            <div><label className={labelCls}>Name</label><input type="text" value={sellerName} onChange={(e) => setSellerName(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Tax ID (NIP)</label><input type="text" value={sellerTaxId} onChange={(e) => setSellerTaxId(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Address</label><input type="text" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Country</label><input type="text" value={sellerCountryCode} onChange={(e) => setSellerCountryCode(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Bank Account</label><input type="text" value={sellerBankAccount} onChange={(e) => setSellerBankAccount(e.target.value)} className={inputCls} /></div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <h2 className="font-medium">Buyer</h2>
          <div className="space-y-3">
            <div><label className={labelCls}>Name</label><input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Tax ID (NIP)</label><input type="text" value={buyerTaxId} onChange={(e) => setBuyerTaxId(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Address</label><input type="text" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Country</label><input type="text" value={buyerCountryCode} onChange={(e) => setBuyerCountryCode(e.target.value)} className={inputCls} /></div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Line Items</h2>
          <button type="button" onClick={addLineItem} className="rounded-md border px-3 py-1 text-sm hover:bg-accent">
            + Add Line
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-2 py-1 text-left text-xs font-medium w-8">#</th>
              <th className="px-2 py-1 text-left text-xs font-medium">Description</th>
              <th className="px-2 py-1 text-right text-xs font-medium w-20">Qty</th>
              <th className="px-2 py-1 text-left text-xs font-medium w-16">Unit</th>
              <th className="px-2 py-1 text-right text-xs font-medium w-24">Unit Price</th>
              <th className="px-2 py-1 text-right text-xs font-medium w-24">Net</th>
              <th className="px-2 py-1 text-right text-xs font-medium w-16">VAT %</th>
              <th className="px-2 py-1 text-right text-xs font-medium w-24">VAT</th>
              <th className="px-2 py-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, idx) => (
              <tr key={li.key} className="border-b last:border-0">
                <td className="px-2 py-1 text-muted-foreground">{li.lineNumber}</td>
                <td className="px-2 py-1"><input type="text" value={li.description} onChange={(e) => updateLineItem(idx, 'description', e.target.value)} className="border rounded px-2 py-1 text-sm w-full" /></td>
                <td className="px-2 py-1"><input type="number" value={li.quantity} onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)} className="border rounded px-2 py-1 text-sm w-full text-right" step="0.01" /></td>
                <td className="px-2 py-1"><input type="text" value={li.unit} onChange={(e) => updateLineItem(idx, 'unit', e.target.value)} className="border rounded px-2 py-1 text-sm w-full" /></td>
                <td className="px-2 py-1"><input type="number" value={li.unitPriceNet} onChange={(e) => updateLineItem(idx, 'unitPriceNet', e.target.value)} className="border rounded px-2 py-1 text-sm w-full text-right" step="0.01" /></td>
                <td className="px-2 py-1"><input type="number" value={li.netAmount} readOnly className="border rounded px-2 py-1 text-sm w-full text-right bg-muted/50" /></td>
                <td className="px-2 py-1"><input type="text" value={li.vatRate} onChange={(e) => updateLineItem(idx, 'vatRate', e.target.value)} className="border rounded px-2 py-1 text-sm w-full text-right" /></td>
                <td className="px-2 py-1"><input type="number" value={li.vatAmount} readOnly className="border rounded px-2 py-1 text-sm w-full text-right bg-muted/50" /></td>
                <td className="px-2 py-1">
                  {lineItems.length > 1 && (
                    <button type="button" onClick={() => removeLineItem(idx)} className="text-red-500 hover:text-red-700 text-xs">x</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td colSpan={5} className="px-2 py-2 text-right">Totals:</td>
              <td className="px-2 py-2 text-right font-mono">{totals.net.toFixed(2)}</td>
              <td></td>
              <td className="px-2 py-2 text-right font-mono">{totals.vat.toFixed(2)}</td>
              <td></td>
            </tr>
            <tr className="font-bold">
              <td colSpan={5} className="px-2 py-1 text-right">Gross:</td>
              <td colSpan={3} className="px-2 py-1 text-right font-mono">{totals.gross.toFixed(2)} {currencyCode}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
