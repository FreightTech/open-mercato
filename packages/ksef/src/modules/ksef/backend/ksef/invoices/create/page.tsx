"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'

// ── Constants ──

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'oo', 'np'] as const
const NUMERIC_VAT_RATES = new Set(['23', '22', '8', '7', '5', '4', '3', '0'])

const GTU_OPTIONS = [
  '', 'GTU_01', 'GTU_02', 'GTU_03', 'GTU_04', 'GTU_05', 'GTU_06',
  'GTU_07', 'GTU_08', 'GTU_09', 'GTU_10', 'GTU_11', 'GTU_12', 'GTU_13',
] as const

const INVOICE_TYPES = [
  { value: 'VAT', label: 'VAT — Standard invoice' },
  { value: 'KOR', label: 'KOR — Corrective invoice' },
  { value: 'ZAL', label: 'ZAL — Advance invoice' },
  { value: 'ROZ', label: 'ROZ — Final settlement' },
  { value: 'UPR', label: 'UPR — Simplified invoice' },
  { value: 'KOR_ZAL', label: 'KOR_ZAL — Corrective advance' },
  { value: 'KOR_ROZ', label: 'KOR_ROZ — Corrective settlement' },
] as const

const PAYMENT_METHODS = [
  { value: '1', label: 'Transfer' },
  { value: '2', label: 'Cash' },
  { value: '3', label: 'Card' },
  { value: '4', label: 'Check' },
  { value: '5', label: 'Credit' },
  { value: '6', label: 'Other' },
] as const

const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'SEK', 'NOK', 'DKK'] as const

const COUNTRIES = [
  'PL', 'DE', 'FR', 'GB', 'CZ', 'SK', 'LT', 'UA', 'NL', 'BE',
  'AT', 'IT', 'ES', 'SE', 'DK', 'NO', 'CH', 'HU', 'RO', 'BG',
] as const

const CORRECTION_TYPES = new Set(['KOR', 'KOR_ZAL', 'KOR_ROZ'])
const MAX_DESCRIPTION_LENGTH = 256

// ── Types ──

interface CompanyProfile {
  nip: string
  name: string
  regon: string | null
  krs: string | null
  residenceAddress: string | null
  workingAddress: string | null
  statusVat: string | null
  accountNumbers: string[]
  verifiedAt: string
}

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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function computeVatAmount(netAmount: number, vatRate: string): number {
  if (!NUMERIC_VAT_RATES.has(vatRate)) return 0
  const rate = parseFloat(vatRate) || 0
  return Math.round(netAmount * (rate / 100) * 100) / 100
}

// ── Component ──

export default function KsefInvoiceCreatePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Seller (from company profile)
  const [sellerProfile, setSellerProfile] = React.useState<CompanyProfile | null>(null)
  const [sellerBankAccount, setSellerBankAccount] = React.useState('')

  // Invoice info
  const [invoiceNumber, setInvoiceNumber] = React.useState('')
  const [invoiceDate, setInvoiceDate] = React.useState(todayStr())
  const [dueDate, setDueDate] = React.useState('')
  const [serviceDate, setServiceDate] = React.useState('')
  const [invoiceType, setInvoiceType] = React.useState('VAT')
  const [currencyCode, setCurrencyCode] = React.useState('PLN')
  const [paymentMethod, setPaymentMethod] = React.useState('1')
  const [correctedKsefNumber, setCorrectedKsefNumber] = React.useState('')

  // Buyer
  const [buyerName, setBuyerName] = React.useState('')
  const [buyerTaxId, setBuyerTaxId] = React.useState('')
  const [buyerAddress, setBuyerAddress] = React.useState('')
  const [buyerCountryCode, setBuyerCountryCode] = React.useState('PL')
  const [buyerVerifying, setBuyerVerifying] = React.useState(false)
  const [buyerVatStatus, setBuyerVatStatus] = React.useState<string | null>(null)

  // Line items
  const [lineItems, setLineItems] = React.useState<LineItemForm[]>([createEmptyLineItem(1)])

  // ── Load seller profile + edit data ──

  React.useEffect(() => {
    async function init() {
      const profileResult = await apiCall<{ profile: CompanyProfile | null }>('/api/ksef/company-profile')
      if (profileResult.ok && profileResult.result?.profile) {
        const p = profileResult.result.profile
        setSellerProfile(p)
        setSellerBankAccount(p.accountNumbers[0] ?? '')
      }

      if (editId) {
        const result = await apiCall<Record<string, unknown>>(`/api/ksef/invoices/${editId}`)
        if (!result.ok) {
          setError('Invoice not found')
          setLoading(false)
          return
        }
        const inv = result.result as Record<string, unknown>
        setInvoiceNumber(inv.invoiceNumber as string ?? '')
        setInvoiceDate(inv.invoiceDate ? String(inv.invoiceDate).substring(0, 10) : todayStr())
        setDueDate(inv.dueDate ? String(inv.dueDate).substring(0, 10) : '')
        setServiceDate(inv.serviceDate ? String(inv.serviceDate).substring(0, 10) : '')
        setInvoiceType(inv.invoiceType as string ?? 'VAT')
        setCurrencyCode(inv.currencyCode as string ?? 'PLN')
        setPaymentMethod(inv.paymentMethod as string ?? '1')
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
      }
      setLoading(false)
    }
    init()
  }, [editId])

  // ── Line item helpers ──

  const updateLineItem = (index: number, field: keyof LineItemForm, value: string) => {
    setLineItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'quantity' || field === 'unitPriceNet') {
        const qty = parseFloat(updated[index].quantity) || 0
        const price = parseFloat(updated[index].unitPriceNet) || 0
        const net = Math.round(qty * price * 100) / 100
        updated[index].netAmount = String(net)
        updated[index].vatAmount = String(computeVatAmount(net, updated[index].vatRate))
      }
      if (field === 'vatRate') {
        const net = parseFloat(updated[index].netAmount) || 0
        updated[index].vatAmount = String(computeVatAmount(net, value))
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

  // ── Totals + VAT breakdown ──

  const totals = React.useMemo(() => {
    let net = 0
    let vat = 0
    const byRate: Record<string, { net: number; vat: number }> = {}
    for (const li of lineItems) {
      const n = parseFloat(li.netAmount) || 0
      const v = parseFloat(li.vatAmount) || 0
      net += n
      vat += v
      const rateKey = li.vatRate || '0'
      if (!byRate[rateKey]) byRate[rateKey] = { net: 0, vat: 0 }
      byRate[rateKey].net += n
      byRate[rateKey].vat += v
    }
    return {
      net: Math.round(net * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      gross: Math.round((net + vat) * 100) / 100,
      byRate: Object.entries(byRate)
        .map(([rate, vals]) => ({ rate, net: Math.round(vals.net * 100) / 100, vat: Math.round(vals.vat * 100) / 100 }))
        .sort((a, b) => {
          const na = parseFloat(a.rate)
          const nb = parseFloat(b.rate)
          if (!isNaN(na) && !isNaN(nb)) return nb - na
          if (!isNaN(na)) return -1
          if (!isNaN(nb)) return 1
          return a.rate.localeCompare(b.rate)
        }),
    }
  }, [lineItems])

  // ── Buyer NIP lookup ──

  const handleVerifyBuyerNip = async () => {
    if (!/^\d{10}$/.test(buyerTaxId)) return
    setBuyerVerifying(true)
    const result = await apiCall<CompanyProfile>('/api/ksef/lookup-nip', {
      method: 'POST',
      body: JSON.stringify({ nip: buyerTaxId }),
    })
    setBuyerVerifying(false)
    if (result.ok && result.result) {
      setBuyerName(result.result.name)
      setBuyerAddress(result.result.workingAddress ?? result.result.residenceAddress ?? '')
      setBuyerVatStatus(result.result.statusVat)
      setBuyerCountryCode('PL')
    }
  }

  // ── Validation ──

  const validate = (): string | null => {
    const today = todayStr()
    if (!invoiceNumber.trim()) return 'Invoice number is required.'

    if (dueDate && dueDate < today) return 'Due date must be on or after today.'

    if (serviceDate) {
      if (serviceDate > today) return 'Service date cannot be a future date.'
    }

    if (CORRECTION_TYPES.has(invoiceType) && !correctedKsefNumber.trim()) {
      return 'Original KSeF number is required for corrective invoices.'
    }

    if (!sellerProfile) return 'Seller company profile is not configured. Go to KSeF Settings first.'

    for (const li of lineItems) {
      if (!li.description.trim()) return `Line item #${li.lineNumber}: description is required.`
      if ((parseFloat(li.quantity) || 0) <= 0) return `Line item #${li.lineNumber}: quantity must be greater than 0.`
    }

    return null
  }

  // ── Save ──

  const handleSave = async () => {
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)

    const payload = {
      invoiceNumber,
      invoiceDate: todayStr(),
      dueDate: dueDate || null,
      serviceDate: serviceDate || null,
      direction: 'outgoing' as const,
      invoiceType,
      currencyCode,
      paymentMethod: paymentMethod || null,
      sellerName: sellerProfile?.name ?? null,
      sellerTaxId: sellerProfile?.nip ?? null,
      sellerAddress: sellerProfile?.workingAddress ?? sellerProfile?.residenceAddress ?? null,
      sellerCountryCode: 'PL',
      sellerBankAccount: sellerBankAccount || null,
      buyerName: buyerName || null,
      buyerTaxId: buyerTaxId || null,
      buyerAddress: buyerAddress || null,
      buyerCountryCode: buyerCountryCode || null,
      netAmount: String(totals.net),
      vatAmount: String(totals.vat),
      grossAmount: String(totals.gross),
      ...(CORRECTION_TYPES.has(invoiceType) && correctedKsefNumber
        ? { correctionReason: `Corrects KSeF ${correctedKsefNumber}` }
        : {}),
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

    const result = await apiCall<{ id: string }>(url, {
      method,
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    })

    if (result.ok) {
      const invoiceId = editId ?? (result.result as { id: string } | null)?.id
      router.push(`/backend/ksef/invoices/${invoiceId}`)
    } else {
      setError((result as unknown as { error?: string }).error ?? 'Failed to save invoice')
    }
    setSaving(false)
  }

  if (loading) return <LoadingMessage label="Loading…" />

  const inputCls = 'rounded-md border px-3 py-1.5 text-sm bg-background w-full'
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
  const today = todayStr()
  const isCorrection = CORRECTION_TYPES.has(invoiceType)
  const buyerIsB2C = !buyerTaxId.trim()
  const isNonPln = currencyCode !== 'PLN'

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{editId ? 'Edit Invoice' : 'New Invoice'}</h1>
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-medium">Outgoing</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Invoice'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {/* ── Invoice Info ── */}
      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">Invoice Info</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>Invoice Number *</label>
            <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
              maxLength={256} className={inputCls} required />
            <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{invoiceNumber.length}/256</p>
          </div>
          <div>
            <label className={labelCls}>Invoice Date *</label>
            <input type="date" value={today} readOnly className={`${inputCls} bg-muted`} />
          </div>
          <div>
            <label className={labelCls}>Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              min={invoiceDate || undefined} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Service Date</label>
            <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)}
              max={today} className={inputCls} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Leave empty if same as invoice date.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>Invoice Type</label>
            <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)} className={inputCls}>
              {INVOICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
              {PAYMENT_METHODS.map((pm) => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
            </select>
          </div>
          {isCorrection && (
            <div>
              <label className={labelCls}>Original KSeF Number *</label>
              <input type="text" value={correctedKsefNumber} onChange={(e) => setCorrectedKsefNumber(e.target.value)}
                placeholder="KSeF reference number" className={inputCls} required />
            </div>
          )}
        </div>
        {isNonPln && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            KSeF requires VAT amounts to also be expressed in PLN. Exchange rate conversion may be needed for FA(3) XML.
          </div>
        )}
      </div>

      {/* ── Seller & Buyer ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Seller — read-only from company profile */}
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Seller</h2>
          {sellerProfile ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{sellerProfile.name}</p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p className="font-mono">NIP: {sellerProfile.nip}</p>
                {(sellerProfile.workingAddress ?? sellerProfile.residenceAddress) && (
                  <p>{sellerProfile.workingAddress ?? sellerProfile.residenceAddress}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Bank Account</label>
                <input type="text" value={sellerBankAccount} onChange={(e) => setSellerBankAccount(e.target.value)}
                  className={inputCls} placeholder="PL00 0000 0000 0000 0000 0000 0000" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Editable — needed for split payment.</p>
              </div>
              <Link href="/backend/integrations/ksef" className="text-xs text-primary hover:underline">
                Change in KSeF Settings
              </Link>
            </div>
          ) : (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              No seller configured.{' '}
              <Link href="/backend/integrations/ksef" className="font-medium underline">Go to KSeF Settings</Link>{' '}
              to add company credentials.
            </div>
          )}
        </div>

        {/* Buyer — editable with NIP lookup */}
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Buyer</h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Name</label>
              <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{buyerCountryCode !== 'PL' ? 'VAT-EU / Tax ID' : 'Tax ID (NIP)'}</label>
              <div className="flex gap-2">
                <input type="text" value={buyerTaxId} onChange={(e) => setBuyerTaxId(e.target.value)} className={inputCls}
                  onBlur={() => { if (/^\d{10}$/.test(buyerTaxId) && buyerCountryCode === 'PL') handleVerifyBuyerNip() }} />
                {buyerCountryCode === 'PL' && (
                  <button type="button" disabled={buyerVerifying || !/^\d{10}$/.test(buyerTaxId)} onClick={handleVerifyBuyerNip}
                    className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
                    {buyerVerifying ? '...' : 'Verify'}
                  </button>
                )}
              </div>
              {buyerVatStatus && (
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                  buyerVatStatus === 'Czynny' ? 'bg-green-100 text-green-800'
                    : buyerVatStatus === 'Zwolniony' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  VAT: {buyerVatStatus}
                </span>
              )}
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input type="text" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <select value={buyerCountryCode} onChange={(e) => setBuyerCountryCode(e.target.value)} className={inputCls}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {buyerIsB2C && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              No buyer NIP — this is a B2C invoice and does not require KSeF submission.
            </div>
          )}
        </div>
      </div>

      {/* ── Line Items ── */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Line Items</h2>
          <button type="button" onClick={addLineItem} className="rounded-md border px-3 py-1 text-sm hover:bg-accent">+ Add Line</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-1 text-left text-xs font-medium w-8">#</th>
                <th className="px-2 py-1 text-left text-xs font-medium min-w-[200px]">Description</th>
                <th className="px-2 py-1 text-right text-xs font-medium w-20">Qty</th>
                <th className="px-2 py-1 text-left text-xs font-medium w-16">Unit</th>
                <th className="px-2 py-1 text-right text-xs font-medium w-24">Unit Price</th>
                <th className="px-2 py-1 text-right text-xs font-medium w-24">Net</th>
                <th className="px-2 py-1 text-center text-xs font-medium w-20">VAT %</th>
                <th className="px-2 py-1 text-right text-xs font-medium w-24">VAT</th>
                <th className="px-2 py-1 text-center text-xs font-medium w-24">GTU</th>
                <th className="px-2 py-1 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, idx) => (
                <tr key={li.key} className="border-b last:border-0">
                  <td className="px-2 py-1 text-muted-foreground">{li.lineNumber}</td>
                  <td className="px-2 py-1">
                    <input type="text" value={li.description} maxLength={MAX_DESCRIPTION_LENGTH}
                      onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" value={li.quantity} step="0.01"
                      onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full text-right" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="text" value={li.unit}
                      onChange={(e) => updateLineItem(idx, 'unit', e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" value={li.unitPriceNet} step="0.01"
                      onChange={(e) => updateLineItem(idx, 'unitPriceNet', e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full text-right" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" value={li.netAmount} readOnly
                      className="border rounded px-2 py-1 text-sm w-full text-right bg-muted/50" />
                  </td>
                  <td className="px-2 py-1">
                    <select value={li.vatRate} onChange={(e) => updateLineItem(idx, 'vatRate', e.target.value)}
                      className="border rounded px-1 py-1 text-sm w-full text-center">
                      {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" value={li.vatAmount} readOnly
                      className="border rounded px-2 py-1 text-sm w-full text-right bg-muted/50" />
                  </td>
                  <td className="px-2 py-1">
                    <select value={li.gtuCode} onChange={(e) => updateLineItem(idx, 'gtuCode', e.target.value)}
                      className="border rounded px-1 py-1 text-sm w-full text-center">
                      {GTU_OPTIONS.map((g) => <option key={g} value={g}>{g || '—'}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLineItem(idx)} className="text-red-500 hover:text-red-700 text-xs">x</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── VAT Summary ── */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          {totals.byRate.map((row) => (
            <React.Fragment key={row.rate}>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net ({row.rate}%)</span>
                <span className="font-mono">{row.net.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT ({row.rate}%)</span>
                <span className="font-mono">{row.vat.toFixed(2)}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className="border-t pt-2 flex justify-between text-sm font-bold">
          <span>Gross total</span>
          <span className="font-mono">{totals.gross.toFixed(2)} {currencyCode}</span>
        </div>
      </div>
    </div>
  )
}
