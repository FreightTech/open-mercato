import React, { useState, useCallback, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'
import { X, Search, Copy, Package } from 'lucide-react'
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
  status: string
  version: number
  createdAt: string
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

type OfferDetailResponse = OfferListItem & {
  calculations: OfferCalculation[]
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(2px)',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--background, #fff)',
  borderRadius: 16,
  maxWidth: 640,
  width: '100%',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  border: '1px solid var(--border, #e5e7eb)',
  margin: 16,
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
  padding: '0',
}

const footerStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderTop: '1px solid var(--border, #e5e7eb)',
  fontSize: 12,
  color: 'var(--muted-foreground, #6b7280)',
  lineHeight: 1.5,
}

const tableHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 100px 100px 48px',
  padding: '8px 24px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground, #6b7280)',
  borderBottom: '1px solid var(--border, #e5e7eb)',
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 100px 100px 48px',
  padding: '10px 24px',
  fontSize: 13,
  alignItems: 'center',
  borderBottom: '1px solid var(--border, #f3f4f6)',
  cursor: 'default',
  transition: 'background 0.1s',
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

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function computeTotal(calculations?: OfferCalculation[]): { amount: number; currency: string } {
  if (!calculations || calculations.length === 0) return { amount: 0, currency: 'USD' }

  let total = 0
  let currency = 'USD'

  for (const calc of calculations) {
    for (const line of calc.lines || []) {
      if (line.isEnabled) {
        total += line.sellPrice
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
  const [copyingId, setCopyingId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!open) {
      setSearch('')
      setDebouncedSearch('')
      setCopyingId(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  const { data, isLoading } = useQuery({
    queryKey: ['history-offers', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' })
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

  const handleCopy = useCallback(async (offer: OfferListItem) => {
    setCopyingId(offer.id)
    try {
      const response = await apiCall<OfferDetailResponse>(`/api/fms_offers/offers/${offer.id}`)
      if (response.ok && response.result) {
        const rows: ChargeRow[] = []
        for (const calc of response.result.calculations || []) {
          for (const line of calc.lines || []) {
            rows.push({
              id: crypto.randomUUID(),
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
            })
          }
        }
        onSelectOffer(rows)
        onOpenChange(false)
      }
    } finally {
      setCopyingId(null)
    }
  }, [onSelectOffer, onOpenChange])

  if (!open) return null

  const items = data?.items || []
  const routeSubtitle = currentOrigin && currentDestination
    ? `${currentOrigin} \u2192 ${currentDestination}`
    : currentOrigin || currentDestination || null

  const dialog = (
    <div style={overlayStyle} onClick={() => onOpenChange(false)}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={20} style={{ color: 'var(--primary, #3b82f6)' }} />
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

        {/* Search */}
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
        </div>

        {/* Table */}
        <div style={bodyStyle}>
          <div style={tableHeaderStyle}>
            <span>Offer #</span>
            <span>Route</span>
            <span>Date</span>
            <span style={{ textAlign: 'right' }}>Total</span>
            <span />
          </div>

          {isLoading ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted-foreground, #6b7280)', fontSize: 13 }}>
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted-foreground, #6b7280)', fontSize: 13 }}>
              {t('tasks_board.charges.history.noResults')}
            </div>
          ) : (
            items.map((offer) => {
              const lineCount = countLines(offer.calculations)
              const { amount, currency } = computeTotal(offer.calculations)
              const origin = offer.rfq?.origin
              const destination = offer.rfq?.destination
              const route = origin && destination
                ? `${origin} \u2192 ${destination}`
                : origin || destination || '\u2014'

              return (
                <div
                  key={offer.id}
                  style={rowStyle}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--muted, #f9fafb)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = ''
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 500 }}>{offer.offerNumber}</span>
                    {lineCount > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground, #6b7280)', marginLeft: 6 }}>
                        {lineCount} {t('tasks_board.charges.history.lines')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground, #6b7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {route}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground, #6b7280)' }}>
                    {formatDate(offer.createdAt)}
                  </div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                    {amount.toFixed(2)} {currency}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                      style={{
                        ...copyButtonStyle,
                        opacity: copyingId === offer.id ? 0.5 : 1,
                        cursor: copyingId ? 'wait' : 'pointer',
                      }}
                      disabled={copyingId !== null}
                      onClick={() => handleCopy(offer)}
                      title="Copy lines"
                      onMouseEnter={(e) => {
                        if (!copyingId) {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary, #3b82f6)'
                          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--primary, #3b82f6)'
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
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          {t('tasks_board.charges.history.footer')}
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(dialog, document.body)
}
