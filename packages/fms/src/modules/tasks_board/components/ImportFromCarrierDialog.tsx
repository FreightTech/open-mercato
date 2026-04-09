import React, { useState, useCallback, useRef } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Sparkles, X, Plus, Check, ArrowLeft, Upload } from 'lucide-react'
import type { ChargeRow } from './ChargesTable'
import { normalizeChargeBasis } from '../lib/wizard-types'

type ExtractedCharge = {
  productName: string
  chargeCode: string | null
  chargeBasis: string | null
  currencyCode: string
  rate: number
  buyPrice: number
  category: 'freight' | 'origin' | 'destination' | 'other'
}

type ExtractionApiResult = {
  charges: ExtractedCharge[]
  sourceTitle?: string | null
  sourceSummary?: string | null
}

type ExistingProduct = {
  id: string
  name: string
  chargeCode: string | null
  chargeUnit: string | null
}

type ProductMatch = {
  productId: string
  productName: string
} | null

type ImportSource = {
  text: string | null
  sourceTitle: string | null
  sourceSummary: string | null
  lineCount: number
}

type ImportFromCarrierDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (rows: ChargeRow[], source: ImportSource) => void
  itemLabel?: string
}

// step: 'paste' | 'review' | 'confirm-products'
type DialogStep = 'paste' | 'review' | 'confirm-products'

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findProductMatch(chargeName: string, chargeCode: string | null, products: ExistingProduct[]): ProductMatch {
  const normalizedCharge = normalizeName(chargeName)

  if (chargeCode) {
    const codeMatch = products.find((p) => p.chargeCode && p.chargeCode.toLowerCase() === chargeCode.toLowerCase())
    if (codeMatch) return { productId: codeMatch.id, productName: codeMatch.name }
  }

  const exactMatch = products.find((p) => normalizeName(p.name) === normalizedCharge)
  if (exactMatch) return { productId: exactMatch.id, productName: exactMatch.name }

  const substringMatch = products.find((p) => {
    const normalizedProduct = normalizeName(p.name)
    return normalizedCharge.includes(normalizedProduct) || normalizedProduct.includes(normalizedCharge)
  })
  if (substringMatch) return { productId: substringMatch.id, productName: substringMatch.name }

  return null
}

export function ImportFromCarrierDialog({
  open,
  onOpenChange,
  onImport,
  itemLabel,
}: ImportFromCarrierDialogProps) {
  const t = useT()
  const [step, setStep] = useState<DialogStep>('paste')
  const [text, setText] = useState('')
  const [pastedImage, setPastedImage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [extractedCharges, setExtractedCharges] = useState<ExtractedCharge[] | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [sourceTitle, setSourceTitle] = useState<string | null>(null)
  const [sourceSummary, setSourceSummary] = useState<string | null>(null)
  const [productMatches, setProductMatches] = useState<ProductMatch[]>([])
  const [saveAsProduct, setSaveAsProduct] = useState<Set<number>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleImageFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setPastedImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }, [])

  const resetState = useCallback(() => {
    setStep('paste')
    setText('')
    setPastedImage(null)
    setIsDragging(false)
    setImporting(false)
    setApplying(false)
    setExtractedCharges(null)
    setSelectedIndices(new Set())
    setSourceTitle(null)
    setSourceSummary(null)
    setProductMatches([])
    setSaveAsProduct(new Set())
  }, [])

  const handleClose = useCallback(() => {
    if (importing || applying) return
    resetState()
    onOpenChange(false)
  }, [importing, applying, onOpenChange, resetState])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return
        handleImageFile(file)
        return
      }
    }
  }, [handleImageFile])

  const handleExtract = useCallback(async () => {
    const imageBase64 = pastedImage ? pastedImage.split(',')[1] : undefined
    if (!text?.trim() && !imageBase64) return
    setImporting(true)
    try {
      const body: Record<string, string> = {}
      if (text?.trim()) body.text = text
      if (imageBase64) body.imageBase64 = imageBase64

      const [extractionResponse, productsResponse] = await Promise.all([
        apiCall<ExtractionApiResult>('/api/fms_offers/rfq/extract-charges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        apiCall<{ items: ExistingProduct[] }>('/api/fms_products/products?limit=100'),
      ])

      const result = extractionResponse.ok && extractionResponse.result
        ? extractionResponse.result
        : { charges: [] }
      const existingProducts = productsResponse.ok && productsResponse.result?.items
        ? productsResponse.result.items
        : []

      const matches = result.charges.map((charge) =>
        findProductMatch(charge.productName, charge.chargeCode, existingProducts),
      )

      const newProductIndices = new Set<number>()
      matches.forEach((match, i) => {
        if (!match) newProductIndices.add(i)
      })

      setExtractedCharges(result.charges)
      setSelectedIndices(new Set(result.charges.map((_, i) => i)))
      setSourceTitle(result.sourceTitle || null)
      setSourceSummary(result.sourceSummary || null)
      setProductMatches(matches)
      setSaveAsProduct(newProductIndices)
      setStep('review')
    } catch {
      setExtractedCharges([])
      setSelectedIndices(new Set())
      setProductMatches([])
      setSaveAsProduct(new Set())
      setStep('review')
    } finally {
      setImporting(false)
    }
  }, [text, pastedImage])

  // Compute new products list for the confirm step
  const newProducts = extractedCharges
    ? extractedCharges
        .map((charge, i) => ({ charge, index: i }))
        .filter(({ index }) => selectedIndices.has(index) && !productMatches[index])
    : []

  const handleFinalApply = useCallback(async () => {
    if (!extractedCharges) return
    setApplying(true)

    try {
      const createdProducts = new Map<number, string>()
      const toCreate = [...saveAsProduct].filter((i) => selectedIndices.has(i) && !productMatches[i])

      if (toCreate.length > 0) {
        const results = await Promise.all(
          toCreate.map(async (i) => {
            const charge = extractedCharges[i]
            const res = await apiCall<{ id: string; name: string }>('/api/fms_products/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: charge.productName,
                chargeCode: charge.chargeCode || null,
              }),
            })
            return { index: i, result: res }
          }),
        )
        for (const { index, result } of results) {
          if (result.ok && result.result?.id) {
            createdProducts.set(index, result.result.id)
          }
        }
      }

      const rows: ChargeRow[] = extractedCharges
        .filter((_, i) => selectedIndices.has(i))
        .map((charge) => {
          const originalIndex = extractedCharges.indexOf(charge)
          const match = productMatches[originalIndex]
          const createdId = createdProducts.get(originalIndex)
          const productId = match?.productId || createdId || null

          return {
            id: `new-import-${Date.now()}-${Math.random()}`,
            productId,
            productName: charge.productName || '',
            chargeCode: charge.chargeCode || '',
            chargeBasis: normalizeChargeBasis(charge.chargeBasis),
            containerType: null,
            currencyCode: charge.currencyCode,
            rate: charge.rate,
            marginPercent: 0,
            buyPrice: charge.buyPrice,
            sellPrice: 0,
            quantity: 1,
            isEnabled: true,
          }
        })

      onImport(rows, {
        text: text || null,
        sourceTitle,
        sourceSummary,
        lineCount: rows.length,
      })
      resetState()
      onOpenChange(false)
    } finally {
      setApplying(false)
    }
  }, [extractedCharges, selectedIndices, productMatches, saveAsProduct, onImport, onOpenChange, resetState])

  const handleReviewApply = useCallback(() => {
    if (newProducts.length > 0) {
      setStep('confirm-products')
    } else {
      handleFinalApply()
    }
  }, [newProducts.length, handleFinalApply])

  const toggleCharge = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const toggleSaveAsProduct = useCallback((index: number) => {
    setSaveAsProduct((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (!extractedCharges) return
    setSelectedIndices((prev) =>
      prev.size === extractedCharges.length
        ? new Set()
        : new Set(extractedCharges.map((_, i) => i)),
    )
  }, [extractedCharges])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClose()
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (step === 'confirm-products') handleFinalApply()
      else if (step === 'review') handleReviewApply()
      else handleExtract()
    }
  }, [handleClose, handleExtract, handleReviewApply, handleFinalApply, step])

  const removeImage = useCallback(() => {
    setPastedImage(null)
  }, [])

  if (!open) return null

  const isBusy = importing || applying

  const categorySummary = extractedCharges
    ? (() => {
        const counts: Record<string, number> = {}
        for (const c of extractedCharges) {
          counts[c.category] = (counts[c.category] || 0) + 1
        }
        return Object.entries(counts)
          .map(([cat, count]) => `${count} ${cat}`)
          .join(' + ')
      })()
    : null

  const newProductCount = newProducts.filter(({ index }) => saveAsProduct.has(index)).length

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          backgroundColor: 'var(--popover, #fff)',
          color: 'var(--popover-foreground, #111)',
          borderRadius: 16,
          maxWidth: step === 'paste' ? 560 : 680,
          width: '100%',
          margin: '0 16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
          transition: 'max-width 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step !== 'paste' && (
              <Sparkles style={{ width: 18, height: 18, opacity: 0.6 }} />
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {step === 'confirm-products'
                  ? 'Save New Products'
                  : step === 'review'
                    ? t('tasks_board.charges.import.reviewTitle', 'Import Pricing Lines')
                    : t('tasks_board.charges.import.title', 'Import from Carrier')}
              </div>
              {step === 'paste' && itemLabel && (
                <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>{itemLabel}</div>
              )}
              {step === 'confirm-products' && (
                <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                  {newProducts.length} new product{newProducts.length > 1 ? 's' : ''} will be added to your catalog
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {step === 'review' && extractedCharges && (
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                border: '1px solid var(--border)', color: 'var(--foreground)',
              }}>
                {extractedCharges.length} {t('tasks_board.charges.import.linesFound', 'lines found')}
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: 'var(--muted-foreground)', display: 'flex' }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>

        {/* ── Step: Paste ── */}
        {step === 'paste' && (
          <>
            <div style={{ padding: '8px 24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea
                ref={textareaRef}
                style={{
                  width: '100%', minHeight: 120, padding: 12,
                  border: '1px solid var(--border)', borderRadius: 8,
                  fontSize: 13, lineHeight: 1.5, resize: 'vertical',
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  background: 'var(--background)', color: 'var(--foreground)',
                }}
                placeholder={t('tasks_board.charges.import.placeholder', 'Paste carrier rate text or screenshot here...')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={handlePaste}
                autoFocus
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageFile(file)
                  e.target.value = ''
                }}
              />

              {pastedImage ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={pastedImage}
                    alt="Attached screenshot"
                    style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    style={{
                      position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%',
                      background: 'var(--background)', border: '1px solid var(--border)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)',
                    }}
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ) : (
                <div
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsDragging(false)
                    const file = e.dataTransfer.files?.[0]
                    if (file && file.type.startsWith('image/')) handleImageFile(file)
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 8,
                    padding: '16px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    background: isDragging ? 'color-mix(in srgb, var(--primary) 5%, transparent)' : 'transparent',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <Upload style={{ width: 14, height: 14, color: 'var(--muted-foreground)', opacity: 0.6 }} />
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {t('tasks_board.charges.import.dropzoneHint', 'Drop an image here, or click to browse')}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted-foreground)' }}>
                <Sparkles style={{ width: 13, height: 13, opacity: 0.5 }} />
                {t('tasks_board.charges.import.textHint', 'Paste carrier rate text — the agent will map lines automatically.')}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 24px 20px' }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--background)',
                  color: 'var(--foreground)', cursor: 'pointer',
                }}
              >
                {t('tasks_board.charges.import.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={(!text.trim() && !pastedImage) || importing}
                onClick={() => handleExtract()}
                style={{
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                  border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  background: (!text.trim() && !pastedImage) || importing ? 'var(--muted)' : 'var(--primary)',
                  color: (!text.trim() && !pastedImage) || importing ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                  cursor: (!text.trim() && !pastedImage) || importing ? 'not-allowed' : 'pointer',
                }}
              >
                {importing
                  ? t('tasks_board.charges.import.importing', 'Importing...')
                  : t('tasks_board.charges.import.import', 'Import')}
                {!importing && <span aria-hidden>→</span>}
              </button>
            </div>
          </>
        )}

        {/* ── Step: Review charges ── */}
        {step === 'review' && extractedCharges && (
          <>
            {(sourceTitle || sourceSummary) && (
              <div style={{ margin: '0 24px 12px', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--accent)' }}>
                {pastedImage && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {t('tasks_board.charges.import.screenshot', 'Screenshot')}
                  </div>
                )}
                {sourceTitle && <div style={{ fontSize: 14, fontWeight: 600 }}>{sourceTitle}</div>}
                {sourceSummary && <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>{sourceSummary}</div>}
                {categorySummary && <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>{categorySummary}</div>}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <div style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={selectedIndices.size === extractedCharges.length}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer', accentColor: 'black' }}
                  />
                </div>
                <div style={{ flex: 1 }}>{t('tasks_board.charges.import.colCharge', 'Charge')}</div>
                <div style={{ width: 100 }}>{t('tasks_board.charges.basis', 'Basis')}</div>
                <div style={{ width: 100, textAlign: 'center' }}>{t('tasks_board.charges.import.colCategory', 'Category')}</div>
                <div style={{ width: 80, textAlign: 'center' }}>{t('tasks_board.charges.import.colCurrency', 'Currency')}</div>
                <div style={{ width: 100, textAlign: 'right' }}>{t('tasks_board.charges.import.colPrice', 'Price')}</div>
              </div>

              {extractedCharges.map((charge, i) => {
                const isSelected = selectedIndices.has(i)
                const match = productMatches[i]
                const isNew = !match
                const categoryColors: Record<string, { bg: string; color: string }> = {
                  freight: { bg: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' },
                  origin: { bg: 'rgba(234, 179, 8, 0.1)', color: '#b45309' },
                  destination: { bg: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5' },
                  other: { bg: 'var(--muted)', color: 'var(--muted-foreground)' },
                }
                const catStyle = categoryColors[charge.category] || categoryColors.other

                return (
                  <div
                    key={i}
                    onClick={() => toggleCharge(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      opacity: isSelected ? 1 : 0.4,
                      transition: 'opacity 0.1s',
                    }}
                  >
                    <div style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCharge(i)}
                        style={{ cursor: 'pointer', accentColor: 'black' }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{charge.productName}</span>
                      {isNew && isSelected && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                          background: 'rgba(234, 179, 8, 0.15)', color: '#b45309',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          New
                        </span>
                      )}
                    </div>
                    <div style={{ width: 100, fontSize: 12, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {charge.chargeBasis || '—'}
                    </div>
                    <div style={{ width: 100, textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: '9999px',
                        background: catStyle.bg, color: catStyle.color,
                        textTransform: 'capitalize',
                      }}>
                        {charge.category}
                      </span>
                    </div>
                    <div style={{ width: 80, textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)' }}>
                      {charge.currencyCode}
                    </div>
                    <div style={{ width: 100, textAlign: 'right', fontSize: 14, fontWeight: 600 }}>
                      {charge.buyPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                )
              })}

              {extractedCharges.length === 0 && (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>
                  {t('tasks_board.charges.import.noCharges', 'No charges could be extracted')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                {selectedIndices.size} {t('tasks_board.charges.import.of', 'of')} {extractedCharges.length} {t('tasks_board.charges.import.selected', 'selected')}
                {' · '}{t('tasks_board.charges.import.asBuyPrices', 'Imported as buy prices')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { setStep('paste'); setExtractedCharges(null); setProductMatches([]) }}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--background)',
                    color: 'var(--foreground)', cursor: 'pointer',
                  }}
                >
                  {t('tasks_board.wizard.back', 'Back')}
                </button>
                <button
                  type="button"
                  disabled={selectedIndices.size === 0}
                  onClick={handleReviewApply}
                  style={{
                    padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                    border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                    background: selectedIndices.size === 0 ? 'var(--muted)' : 'var(--primary)',
                    color: selectedIndices.size === 0 ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                    cursor: selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t('tasks_board.charges.import.apply', 'Apply')}
                  <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step: Confirm new products ── */}
        {step === 'confirm-products' && extractedCharges && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              <div style={{
                padding: '12px 14px', margin: '0 0 16px', borderRadius: 8,
                background: 'var(--accent)', border: '1px solid var(--border)',
                fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5,
              }}>
                The following charges don't match any existing products. Toggle which ones you'd like to save to your product catalog for future use.
              </div>

              {newProducts.map(({ charge, index }) => {
                const willSave = saveAsProduct.has(index)
                return (
                  <div
                    key={index}
                    onClick={() => toggleSaveAsProduct(index)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: willSave ? 'rgba(16, 185, 129, 0.1)' : 'var(--muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                      }}>
                        {willSave
                          ? <Check style={{ width: 14, height: 14, color: '#059669' }} />
                          : <Plus style={{ width: 14, height: 14, color: 'var(--muted-foreground)' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{charge.productName}</div>
                        {charge.chargeCode && (
                          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>
                            Code: {charge.chargeCode}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        background: willSave ? '#059669' : 'var(--border)',
                        position: 'relative',
                        transition: 'background 0.15s',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 2,
                          left: willSave ? 18 : 2,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: 'white',
                          transition: 'left 0.15s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                {newProductCount > 0
                  ? `${newProductCount} product${newProductCount > 1 ? 's' : ''} will be created`
                  : 'No new products will be created'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setStep('review')}
                  disabled={applying}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--background)',
                    color: 'var(--foreground)', cursor: applying ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    opacity: applying ? 0.5 : 1,
                  }}
                >
                  <ArrowLeft style={{ width: 14, height: 14 }} />
                  {t('tasks_board.wizard.back', 'Back')}
                </button>
                <button
                  type="button"
                  disabled={applying}
                  onClick={handleFinalApply}
                  style={{
                    padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                    border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                    background: applying ? 'var(--muted)' : 'var(--primary)',
                    color: applying ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                    cursor: applying ? 'not-allowed' : 'pointer',
                  }}
                >
                  {applying ? 'Saving...' : 'Confirm & Apply'}
                  {!applying && <span aria-hidden>→</span>}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Loading overlay */}
        {isBusy && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 16,
            background: 'color-mix(in srgb, var(--background) 80%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Sparkles style={{ width: 24, height: 24, opacity: 0.6, animation: 'pulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                {applying
                  ? 'Saving products & importing...'
                  : t('tasks_board.charges.import.extracting', 'Extracting charges...')}
              </span>
            </div>
          </div>
        )}

        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      </div>
    </div>
  )
}
