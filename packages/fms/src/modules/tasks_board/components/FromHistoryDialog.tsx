import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { X, Search, Copy, Package, ChevronRight } from 'lucide-react'
import type { ChargeRow } from './ChargesTable'

type FromHistoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectOffer: (rows: ChargeRow[]) => void
  currentOrigin?: string | null
  currentDestination?: string | null
}

type OfferLine = {
  id: string
  productId?: string | null
  productName?: string | null
  chargeCode?: string | null
  chargeBasis?: string | null
  containerType?: string | null
  currencyCode: string
  rate: number
  buyPrice: number
  sellPrice: number
  isEnabled: boolean
}

type OfferCalculation = {
  id: string
  lines?: OfferLine[]
}

type OfferListItem = {
  id: string
  offerNumber: string
  type?: string
  status: string
  version: number
  createdAt: string
  validUntil?: string | null
  contractorName?: string | null
  carrierName?: string | null
  assignedToName?: string | null
  totalPrice?: string | null
  totalPriceCurrency?: string | null
  rfq?: {
    origin?: string | null
    destination?: string | null
    companyName?: string | null
  } | null
  calculations?: OfferCalculation[]
}

type OffersListResponse = {
  items: OfferListItem[]
  total: number
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function computeTotal(calculations?: OfferCalculation[]): { amount: number; currency: string } {
  if (!calculations || calculations.length === 0) return { amount: 0, currency: 'USD' }

  let total = 0
  let currency = 'USD'

  for (const calc of calculations) {
    for (const line of calc.lines || []) {
      if (line.isEnabled) {
        total += Number(line.sellPrice) || 0
        currency = line.currencyCode
      }
    }
  }

  return { amount: total, currency }
}

function countLines(calculations?: OfferCalculation[]): number {
  if (!calculations) return 0
  return calculations.reduce((sum, calc) => sum + (calc.lines?.length || 0), 0)
}

function getAllLines(calculations?: OfferCalculation[]): OfferLine[] {
  if (!calculations) return []
  const lines: OfferLine[] = []
  for (const calc of calculations) {
    for (const line of calc.lines || []) {
      lines.push(line)
    }
  }
  return lines
}

function computeMargin(buyPrice: number, sellPrice: number): number {
  if (sellPrice <= 0 || buyPrice <= 0) return 0
  return ((sellPrice - buyPrice) / sellPrice) * 100
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280' },
  sent: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' },
  accepted: { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669' },
  declined: { bg: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' },
  expired: { bg: 'rgba(234, 179, 8, 0.1)', color: '#b45309' },
  superseded: { bg: 'rgba(139, 92, 246, 0.08)', color: '#7c3aed' },
}

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  sell: { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669' },
  buy: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' },
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '20px 24px 16px',
  borderBottom: '1px solid var(--border, #e5e7eb)',
}

const searchContainerStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderBottom: '1px solid var(--border, #e5e7eb)',
}

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 8,
  padding: '8px 12px 8px 36px',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--background, #fff)',
  color: 'var(--foreground, #111)',
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
}

const footerStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderTop: '1px solid var(--border, #e5e7eb)',
  fontSize: 12,
  color: 'var(--muted-foreground, #6b7280)',
  lineHeight: 1.5,
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
  color: 'var(--muted-foreground, #6b7280)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const copyButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border, #e5e7eb)',
  cursor: 'pointer',
  padding: '6px',
  borderRadius: 6,
  color: 'var(--muted-foreground, #6b7280)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
}

const linesHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '28px 1fr 70px 80px 80px 60px',
  padding: '6px 24px 6px 48px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground, #6b7280)',
  borderBottom: '1px solid var(--border, #f3f4f6)',
}

const lineRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '28px 1fr 70px 80px 80px 60px',
  padding: '8px 24px 8px 48px',
  fontSize: 12,
  alignItems: 'center',
  borderBottom: '1px solid var(--border, #f3f4f6)',
}

const badgeStyle = (colors: { bg: string; color: string }): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 9999,
  background: colors.bg,
  color: colors.color,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  lineHeight: '16px',
})

export function FromHistoryDialog({
  open,
  onOpenChange,
  onSelectOffer,
  currentOrigin,
  currentDestination,
}: FromHistoryDialogProps) {
  const t = useT()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterOrigin, setFilterOrigin] = useState(currentOrigin || '')
  const [filterDestination, setFilterDestination] = useState(currentDestination || '')
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (open) {
      setFilterOrigin(currentOrigin || '')
      setFilterDestination(currentDestination || '')
    } else {
      setSearch('')
      setDebouncedSearch('')
      setCopyingId(null)
      setExpandedId(null)
      setSelectedLineIds(new Set())
      setFilterOrigin('')
      setFilterDestination('')
    }
  }, [open, currentOrigin, currentDestination])

  const { data, isLoading } = useQuery({
    queryKey: ['history-offers', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' })
      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim())
      }
      const response = await apiCall<OffersListResponse>(`/api/fms_offers/offers?${params.toString()}`)
      if (response.ok && response.result) {
        return response.result
      }
      return { items: [], total: 0 }
    },
    enabled: open,
  })

  // Client-side route filtering
  const filteredItems = useMemo(() => {
    const allItems = data?.items || []
    const originFilter = filterOrigin.trim().toLowerCase()
    const destFilter = filterDestination.trim().toLowerCase()
    if (!originFilter && !destFilter) return allItems
    return allItems.filter((offer) => {
      const offerOrigin = (offer.rfq?.origin || '').toLowerCase()
      const offerDest = (offer.rfq?.destination || '').toLowerCase()
      if (originFilter && !offerOrigin.includes(originFilter)) return false
      if (destFilter && !offerDest.includes(destFilter)) return false
      return true
    })
  }, [data?.items, filterOrigin, filterDestination])

  const toggleExpanded = useCallback((offerId: string) => {
    setExpandedId((prev) => {
      if (prev === offerId) return null
      setSelectedLineIds(new Set())
      return offerId
    })
  }, [])

  const toggleLineSelection = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) {
        next.delete(lineId)
      } else {
        next.add(lineId)
      }
      return next
    })
  }, [])

  const handleCopy = useCallback((offer: OfferListItem) => {
    setCopyingId(offer.id)
    try {
      const allLines = getAllLines(offer.calculations)
      const linesToCopy = selectedLineIds.size > 0 && expandedId === offer.id
        ? allLines.filter((line) => selectedLineIds.has(line.id))
        : allLines.filter((line) => line.isEnabled)

      const rows: ChargeRow[] = linesToCopy.map((line) => ({
        id: `new-history-${Date.now()}-${Math.random()}`,
        productId: line.productId || null,
        productName: line.productName || '',
        chargeCode: line.chargeCode || '',
        chargeBasis: line.chargeBasis || '',
        containerType: line.containerType || null,
        currencyCode: line.currencyCode,
        rate: line.rate,
        marginPercent: line.sellPrice > 0 && line.buyPrice > 0
          ? Math.round(((line.sellPrice - line.buyPrice) / line.sellPrice) * 100)
          : 0,
        buyPrice: line.buyPrice,
        sellPrice: line.sellPrice,
        isEnabled: line.isEnabled,
      }))

      onSelectOffer(rows)
      onOpenChange(false)
    } finally {
      setCopyingId(null)
    }
  }, [onSelectOffer, onOpenChange, selectedLineIds, expandedId])

  const routeSubtitle = currentOrigin && currentDestination
    ? `${currentOrigin} \u2192 ${currentDestination}`
    : currentOrigin || currentDestination || null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="p-0 flex flex-col"
        style={{ width: '620px', maxWidth: '620px' }}
        hideCloseButton
        ariaTitle={t('tasks_board.charges.history.title')}
        overlayClassName="backdrop-blur-none"
      >
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={20} style={{ color: 'var(--muted-foreground, #6b7280)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {t('tasks_board.charges.history.title')}
              </div>
              {routeSubtitle && (
                <div style={{ fontSize: 12, color: 'var(--muted-foreground, #6b7280)', marginTop: 2 }}>
                  {routeSubtitle}
                </div>
              )}
            </div>
          </div>
          <button style={closeButtonStyle} onClick={() => onOpenChange(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Search + Route filters */}
        <div style={searchContainerStyle}>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted-foreground, #6b7280)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tasks_board.charges.history.search')}
              style={searchInputStyle}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <input
              type="text"
              value={filterOrigin}
              onChange={(e) => setFilterOrigin(e.target.value)}
              placeholder="Origin"
              style={{
                flex: 1,
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 12,
                fontFamily: 'inherit',
                outline: 'none',
                background: 'var(--background, #fff)',
                color: 'var(--foreground, #111)',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--muted-foreground, #6b7280)', flexShrink: 0 }}>{'\u2192'}</span>
            <input
              type="text"
              value={filterDestination}
              onChange={(e) => setFilterDestination(e.target.value)}
              placeholder="Destination"
              style={{
                flex: 1,
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 12,
                fontFamily: 'inherit',
                outline: 'none',
                background: 'var(--background, #fff)',
                color: 'var(--foreground, #111)',
              }}
            />
            {(filterOrigin || filterDestination) && (
              <button
                type="button"
                onClick={() => { setFilterOrigin(''); setFilterDestination('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: 'var(--muted-foreground, #6b7280)', display: 'flex', flexShrink: 0,
                }}
                title="Clear route filter"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={bodyStyle}>
          {isLoading ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted-foreground, #6b7280)', fontSize: 13 }}>
              Loading...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted-foreground, #6b7280)', fontSize: 13 }}>
              {t('tasks_board.charges.history.noResults')}
            </div>
          ) : (
            filteredItems.map((offer) => {
              const lineCount = countLines(offer.calculations)
              const total = computeTotal(offer.calculations)
              const amount = Number(total?.amount) || 0
              const currency = total?.currency || 'USD'
              const origin = offer.rfq?.origin
              const destination = offer.rfq?.destination
              const route = origin && destination
                ? `${origin} \u2192 ${destination}`
                : origin || destination || null
              const isExpanded = expandedId === offer.id
              const lines = getAllLines(offer.calculations)
              const offerType = offer.type || 'sell'
              const statusColors = STATUS_COLORS[offer.status] || STATUS_COLORS.draft
              const typeColors = TYPE_COLORS[offerType] || TYPE_COLORS.sell
              const clientName = offer.contractorName || offer.rfq?.companyName || null

              // Use server-computed total if available, fall back to client-side
              const displayTotal = offer.totalPrice || (amount > 0 ? formatAmount(amount) : null)
              const displayCurrency = offer.totalPriceCurrency || currency

              return (
                <React.Fragment key={offer.id}>
                  {/* Offer card row */}
                  <div
                    style={{
                      padding: '12px 24px',
                      borderBottom: '1px solid var(--border, #f3f4f6)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                      background: undefined,
                    }}
                    onClick={() => toggleExpanded(offer.id)}
                    onMouseEnter={(e) => {
                      if (!isExpanded) {
                        (e.currentTarget as HTMLDivElement).style.background = 'var(--muted, #f9fafb)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) {
                        (e.currentTarget as HTMLDivElement).style.background = ''
                      }
                    }}
                  >
                    {/* Top line: chevron, offer number, badges, total, copy */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ChevronRight
                        size={14}
                        style={{
                          color: 'var(--muted-foreground, #6b7280)',
                          transition: 'transform 0.15s',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                        {offer.offerNumber}
                      </div>
                      <span style={badgeStyle(typeColors)}>{offerType}</span>
                      <span style={badgeStyle(statusColors)}>{offer.status}</span>
                      {lineCount > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--muted-foreground, #6b7280)' }}>
                          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                        </span>
                      )}
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{displayTotal || '0.00'}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted-foreground, #6b7280)', marginLeft: 4 }}>{displayCurrency}</span>
                        </div>
                        <button
                          style={{
                            ...copyButtonStyle,
                            opacity: copyingId === offer.id ? 0.5 : 1,
                            cursor: copyingId ? 'wait' : 'pointer',
                          }}
                          disabled={copyingId !== null}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopy(offer)
                          }}
                          title={t('tasks_board.charges.history.copyLines', 'Copy lines')}
                          onMouseEnter={(e) => {
                            if (!copyingId) {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--foreground, #111)'
                              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground, #111)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border, #e5e7eb)'
                            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground, #6b7280)'
                          }}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Bottom line: client, route, date, validity, creator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, paddingLeft: 22, fontSize: 12, color: 'var(--muted-foreground, #6b7280)' }}>
                      {clientName && (
                        <span style={{ fontWeight: 500, color: 'var(--foreground, #111)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                          {clientName}
                        </span>
                      )}
                      {route && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                          {route}
                        </span>
                      )}
                      <span style={{ flexShrink: 0 }}>{formatDate(offer.createdAt)}</span>
                      {offer.validUntil && (
                        <span style={{ flexShrink: 0 }}>
                          {t('tasks_board.offerDetail.validUntil', 'Valid Until')}: {formatDate(offer.validUntil)}
                        </span>
                      )}
                      {offer.assignedToName && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                          {offer.assignedToName}
                        </span>
                      )}
                      {offer.carrierName && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                          {t('tasks_board.charges.history.carrier', 'Carrier')}: {offer.carrierName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded lines */}
                  {isExpanded && lines.length > 0 && (
                    <>
                      <div style={linesHeaderStyle}>
                        <span />
                        <span>{t('tasks_board.offerDetail.product')}</span>
                        <span>{t('tasks_board.offerDetail.currency')}</span>
                        <span style={{ textAlign: 'right' }}>{t('tasks_board.offerDetail.buyPrice')}</span>
                        <span style={{ textAlign: 'right', fontWeight: 600 }}>{t('tasks_board.offerDetail.sellPrice')}</span>
                        <span style={{ textAlign: 'right' }}>{t('tasks_board.offerDetail.margin')}</span>
                      </div>
                      {lines.map((line) => {
                        const margin = computeMargin(Number(line.buyPrice), Number(line.sellPrice))
                        const isSelected = selectedLineIds.has(line.id)
                        return (
                          <div
                            key={line.id}
                            style={lineRowStyle}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleLineSelection(line.id)
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: 3,
                                  border: `1.5px solid ${isSelected ? 'var(--foreground, #111)' : 'var(--border, #d1d5db)'}`,
                                  background: isSelected ? 'var(--foreground, #111)' : 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.1s',
                                }}
                              >
                                {isSelected && (
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {line.productName || line.chargeCode || '\u2014'}
                            </div>
                            <div style={{ color: 'var(--muted-foreground, #6b7280)' }}>
                              {line.currencyCode}
                            </div>
                            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {formatAmount(Number(line.buyPrice))}
                            </div>
                            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                              {formatAmount(Number(line.sellPrice))}
                            </div>
                            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground, #6b7280)' }}>
                              {margin > 0 ? `${margin.toFixed(1)}%` : '\u2014'}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {isExpanded && lines.length === 0 && (
                    <div style={{ padding: '12px 24px 12px 48px', fontSize: 12, color: 'var(--muted-foreground, #6b7280)', fontStyle: 'italic', borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                      {t('tasks_board.charges.history.noLines', 'No lines in this offer')}
                    </div>
                  )}
                </React.Fragment>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          {t('tasks_board.charges.history.footer')}
        </div>
      </SheetContent>
    </Sheet>
  )
}
