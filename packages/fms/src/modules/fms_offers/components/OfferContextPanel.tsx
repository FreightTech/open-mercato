import React, { useState, useEffect } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { HighlightedText } from '../../tasks_board/components/HighlightedText'
import { ExchangeRateSection } from '../../tasks_board/components/ExchangeRateSection'
import { OfferActivitySection } from './OfferActivitySection'

type Highlight = {
  start: number
  end: number
  type: string
  label: string
}

type RfqContextData = {
  title: string | null
  companyName: string | null
  contactPerson: string | null
  origin: string | null
  destination: string | null
  direction: string | null
  transportMode: string | null
  rawText: string | null
  senderEmail: string | null
  senderName: string | null
  context: string | null
  highlights: Highlight[] | null
}

type OfferContextPanelProps = {
  offerId: string
  rfqId?: string | null
  usedCurrencies?: string[]
}

type TabId = 'details' | 'activity'

export function OfferContextPanel({ offerId, rfqId, usedCurrencies = [] }: OfferContextPanelProps) {
  const t = useT()
  const hasRfq = !!rfqId
  const [activeTab, setActiveTab] = useState<TabId>('activity')
  const [messageCollapsed, setMessageCollapsed] = useState(false)
  const [baseCurrency, setBaseCurrency] = useState(usedCurrencies[0] || 'USD')

  // Switch to Details tab when rfqId becomes available
  useEffect(() => {
    if (hasRfq) setActiveTab('details')
  }, [hasRfq])

  // Fetch RFQ context data if offer has an RFQ
  const { data: rfqContext } = useQuery<RfqContextData>({
    queryKey: ['rfq-context', rfqId],
    queryFn: async () => {
      const res = await apiCall<Record<string, unknown>>(`/api/fms_offers/rfq/${rfqId}`)
      if (!res.ok || !res.result) throw new Error('Failed to fetch RFQ')
      const d = res.result
      return {
        title: (d.title as string) || null,
        companyName: (d.companyName as string) || null,
        contactPerson: (d.contactPerson as string) || null,
        origin: (d.origin as string) || null,
        destination: (d.destination as string) || null,
        direction: (d.direction as string) || null,
        transportMode: (d.transportMode as string) || null,
        rawText: (d.rawText as string) || null,
        senderEmail: (d.senderEmail as string) || null,
        senderName: (d.senderName as string) || null,
        context: (d.context as string) || null,
        highlights: (d.highlights as Highlight[]) || null,
      }
    },
    enabled: hasRfq,
    staleTime: 60_000,
  })

  // No RFQ: show activity directly without tabs or exchange rates
  if (!hasRfq) {
    return (
      <div className="w-[420px] shrink-0 overflow-hidden bg-card flex flex-col border-l">
        <div className="flex-1 min-h-0">
          <OfferActivitySection offerId={offerId} />
        </div>
      </div>
    )
  }

  // Has RFQ: show Details / Activity tabs
  const TABS: { id: TabId; label: string }[] = [
    { id: 'details', label: t('fms_offers.context.tabDetails', 'Details') },
    { id: 'activity', label: t('fms_offers.context.tabActivity', 'Activity') },
  ]

  return (
    <div className="w-[420px] shrink-0 overflow-hidden bg-card flex flex-col border-l">
      {/* Tabs */}
      <div className="px-5 pt-4 shrink-0">
        <div className="flex border-b mb-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 pb-2 text-[13px] font-medium transition-colors relative text-center
                ${activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/70'
                }
              `}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-foreground rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Details — RFQ info + original message */}
      {activeTab === 'details' && (
        <div className="flex-1 overflow-y-auto px-5 pt-2">
          {/* RFQ title */}
          {rfqContext?.title && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {t('fms_offers.context.rfqTitle', 'RFQ')}
              </div>
              <div className="text-[13px] font-medium text-foreground">{rfqContext.title}</div>
            </div>
          )}

          {/* Company / Contact */}
          {(rfqContext?.companyName || rfqContext?.contactPerson) && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {t('fms_offers.context.customer', 'Customer')}
              </div>
              {rfqContext?.companyName && (
                <div className="text-[13px] font-medium text-foreground">{rfqContext.companyName}</div>
              )}
              {rfqContext?.contactPerson && (
                <div className="text-[12px] text-muted-foreground">{rfqContext.contactPerson}</div>
              )}
            </div>
          )}

          {/* Route */}
          {(rfqContext?.origin || rfqContext?.destination) && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {t('fms_offers.context.route', 'Route')}
              </div>
              <div className="text-[13px] text-foreground">
                {rfqContext?.origin || '—'} → {rfqContext?.destination || '—'}
              </div>
            </div>
          )}

          {/* Original message */}
          {(rfqContext?.rawText || rfqContext?.context) && (
            <>
              <button
                type="button"
                onClick={() => setMessageCollapsed((prev) => !prev)}
                className="flex items-center gap-1.5 mb-2.5 mt-2"
              >
                {messageCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {rfqContext?.rawText
                    ? t('fms_offers.context.originalMessage', 'Original Message')
                    : t('fms_offers.context.additionalContext', 'Additional Context')}
                </span>
              </button>

              {!messageCollapsed && (
                <div className="pb-4">
                  {rfqContext?.rawText && rfqContext.highlights ? (
                    <HighlightedText
                      text={rfqContext.rawText}
                      highlights={rfqContext.highlights}
                      senderEmail={rfqContext.senderEmail}
                      senderName={rfqContext.contactPerson}
                      companyName={rfqContext.companyName}
                    />
                  ) : (
                    <div className="p-4 rounded-xl border bg-background text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                      {rfqContext?.rawText || rfqContext?.context}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Activity — exchange rates + activity panel */}
      {activeTab === 'activity' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Exchange rates — pinned at top */}
          <div className="shrink-0 px-5 py-3 border-b">
            <ExchangeRateSection
              usedCurrencies={usedCurrencies}
              baseCurrency={baseCurrency}
              onBaseCurrencyChange={setBaseCurrency}
            />
          </div>

          {/* Activity panel */}
          <div className="flex-1 min-h-0">
            <OfferActivitySection offerId={offerId} />
          </div>
        </div>
      )}
    </div>
  )
}
