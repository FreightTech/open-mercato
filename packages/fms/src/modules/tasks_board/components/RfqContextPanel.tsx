import React, { useState, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ChevronDown, ChevronRight, Building2, Pencil, X } from 'lucide-react'
import { HighlightedText } from './HighlightedText'
import { ContractorSearchInput } from './ContractorSearchInput'
import { RfqActivitySection } from '../../fms_offers/components/RfqActivitySection'
import type { ExtractionResult, RfqDetailData } from '../lib/wizard-types'

type RfqContextPanelProps = {
  rfqId: string | null
  rfqTitle?: string
  rawText: string
  extracting?: boolean
  extraction: ExtractionResult | null
  rfqDetail: RfqDetailData | null | undefined
}

type TabId = 'details' | 'activity'

export function RfqContextPanel({ rfqId, rfqTitle, rawText, extracting, extraction, rfqDetail }: RfqContextPanelProps) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [messageCollapsed, setMessageCollapsed] = useState(false)
  const [contractorId, setContractorId] = useState<string | null>(rfqDetail?.contractorId ?? null)
  const [contractorName, setContractorName] = useState<string | null>(rfqDetail?.companyName ?? null)
  const [editingContractor, setEditingContractor] = useState(false)

  // Sync contractorId when rfqDetail loads
  React.useEffect(() => {
    if (rfqDetail?.contractorId !== undefined) setContractorId(rfqDetail.contractorId)
    if (rfqDetail?.companyName !== undefined) setContractorName(rfqDetail.companyName)
  }, [rfqDetail?.contractorId, rfqDetail?.companyName])

  // Fetch contractor name if we have an ID but no name
  useQuery({
    queryKey: ['contractor-name', contractorId],
    queryFn: async () => {
      if (!contractorId) return null
      const res = await apiCall<{ id: string; name: string }>(`/api/contractors/contractors/${contractorId}`)
      if (res.ok && res.result) {
        setContractorName(res.result.name)
        return res.result.name
      }
      return null
    },
    enabled: !!contractorId && !contractorName,
    staleTime: 5 * 60_000,
  })

  const handleContractorChange = useCallback(async (newContractorId: string | null, name?: string) => {
    setContractorId(newContractorId)
    setContractorName(name ?? null)
    setEditingContractor(false)
    if (!rfqId) return
    await apiCall(`/api/fms_offers/rfq/${rfqId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contractorId: newContractorId, companyName: name ?? null }),
    })
  }, [rfqId])

  const handleClearContractor = useCallback(async () => {
    setContractorId(null)
    setContractorName(null)
    if (!rfqId) return
    await apiCall(`/api/fms_offers/rfq/${rfqId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contractorId: null }),
    })
  }, [rfqId])

  const text = rawText || rfqDetail?.rawText || ''
  const highlights = extraction?.extraction.highlights || rfqDetail?.highlights
  const hasMessage = !!(text || rfqDetail?.context)
  const displayTitle = rfqTitle || rfqDetail?.title

  const TABS: { id: TabId; label: string }[] = [
    { id: 'details', label: t('tasks_board.context.tabDetails', 'Details') },
    { id: 'activity', label: t('tasks_board.context.tabActivity', 'Activity') },
  ]

  return (
    <div className="w-[420px] shrink-0 overflow-hidden bg-card flex flex-col">
      {/* Tabs + Title */}
      <div className="px-5 pt-4 shrink-0">
        {rfqId && (
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
        )}

      </div>

      {/* Tab: Details — contractor + original message */}
      {activeTab === 'details' && (
        <div className="flex-1 overflow-y-auto px-5 pt-4">
          {rfqId && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('tasks_board.context.contractor', 'Contractor')}
              </div>
              {contractorId && !editingContractor ? (
                <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2 group/contractor">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-foreground truncate">
                      {contractorName || contractorId.slice(0, 8)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingContractor(true)}
                    className="opacity-0 group-hover/contractor:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
                    title={t('tasks_board.context.changeContractor', 'Change')}
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={handleClearContractor}
                    className="opacity-0 group-hover/contractor:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
                    title={t('tasks_board.context.removeContractor', 'Remove')}
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div>
                  <ContractorSearchInput
                    value={contractorId}
                    onChange={handleContractorChange}
                    placeholder={t('tasks_board.context.selectContractor', 'Assign contractor...')}
                  />
                  {editingContractor && (
                    <button
                      type="button"
                      onClick={() => setEditingContractor(false)}
                      className="text-[11px] text-muted-foreground mt-1 hover:text-foreground transition-colors"
                    >
                      {t('tasks_board.context.cancel', 'Cancel')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {(hasMessage || extracting) && (
            <>
              <button
                type="button"
                onClick={() => setMessageCollapsed((prev) => !prev)}
                className="flex items-center gap-1.5 mb-2.5"
              >
                {messageCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {text
                    ? t('tasks_board.wizard.originalMessage', 'Original Message')
                    : t('tasks_board.detail.context', 'Additional Context')}
                </span>
              </button>

              {!messageCollapsed && (
                <div className="pb-4">
                  {extracting ? (
                    <div className="flex flex-col gap-2.5">
                      {[100, 80, 90, 70, 60, 85, 75].map((w, i) => (
                        <div
                          key={i}
                          className="h-3.5 rounded-md bg-muted animate-pulse"
                          style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }}
                        />
                      ))}
                    </div>
                  ) : text && highlights ? (
                    <HighlightedText
                      text={text}
                      highlights={highlights}
                      senderEmail={extraction?.extraction.senderEmail || rfqDetail?.senderEmail}
                      senderName={extraction?.extraction.contactPerson || rfqDetail?.senderName}
                      companyName={extraction?.extraction.companyName || rfqDetail?.companyName}
                    />
                  ) : text ? (
                    <div className="p-4 rounded-xl border bg-background text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                      {text}
                    </div>
                  ) : rfqDetail?.context ? (
                    <div className="p-4 rounded-xl border bg-background text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                      {rfqDetail.context}
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Activity */}
      {activeTab === 'activity' && rfqId && (
        <div className="flex-1 flex flex-col min-h-0">
          <RfqActivitySection rfqId={rfqId} />
        </div>
      )}

      {/* Fallback when no rfqId — just show message content without tabs */}
      {!rfqId && (hasMessage || extracting) && (
        <div className="flex-1 overflow-y-auto px-5 pt-4">
          {(hasMessage || extracting) && (
            <>
              <button
                type="button"
                onClick={() => setMessageCollapsed((prev) => !prev)}
                className="flex items-center gap-1.5 mb-2.5"
              >
                {messageCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t('tasks_board.wizard.originalMessage', 'Original Message')}
                </span>
              </button>

              {!messageCollapsed && (
                <div className="pb-4">
                  {extracting ? (
                    <div className="flex flex-col gap-2.5">
                      {[100, 80, 90, 70, 60, 85, 75].map((w, i) => (
                        <div
                          key={i}
                          className="h-3.5 rounded-md bg-muted animate-pulse"
                          style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }}
                        />
                      ))}
                    </div>
                  ) : text && highlights ? (
                    <HighlightedText
                      text={text}
                      highlights={highlights}
                      senderEmail={extraction?.extraction.senderEmail}
                      senderName={extraction?.extraction.contactPerson}
                      companyName={extraction?.extraction.companyName}
                    />
                  ) : text ? (
                    <div className="p-4 rounded-xl border bg-background text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                      {text}
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
