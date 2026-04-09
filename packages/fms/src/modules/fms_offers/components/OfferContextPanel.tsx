import React, { useState, useEffect, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ChevronDown, ChevronRight, User, MessageSquare, FileText, Package } from 'lucide-react'
import { HighlightedText } from '../../tasks_board/components/HighlightedText'
import { ContractorSearchInput } from './ContractorSearchInput'
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
  contractorId: string | null
  origin: string | null
  destination: string | null
  direction: string | null
  transportMode: string | null
  rawText: string | null
  senderEmail: string | null
  senderName: string | null
  context: string | null
  highlights: Highlight[] | null
  items: Array<{ id: string; cargoDescription: string | null }> | null
}

type OfferContextPanelProps = {
  offerId?: string | null
  rfqId?: string | null
  /** Controlled contractor state — when provided, the panel delegates state to the parent */
  contractorIdProp?: string | null
  contractorNameProp?: string | null
  onContractorChangeProp?: (id: string | null, name?: string) => void
}

type TabId = 'details' | 'activity'

export function OfferContextPanel({ offerId, rfqId, contractorIdProp, contractorNameProp, onContractorChangeProp }: OfferContextPanelProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const hasRfq = !!rfqId
  const isControlled = onContractorChangeProp !== undefined
  const notesEntityType = hasRfq ? 'fms_rfq' : 'fms_offer'
  const notesEntityId = hasRfq ? rfqId! : offerId
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['client', 'message']))
  const [noteInput, setNoteInput] = useState('')
  const [postingNote, setPostingNote] = useState(false)
  const [localContractorId, setLocalContractorId] = useState<string | null>(null)
  const [localContractorName, setLocalContractorName] = useState<string | null>(null)
  const [editingContractor, setEditingContractor] = useState(false)

  // Use controlled props when provided, otherwise fall back to local state
  const contractorId = isControlled ? (contractorIdProp ?? null) : localContractorId
  const contractorName = isControlled ? (contractorNameProp ?? null) : localContractorName
  const setContractorId = isControlled ? (_v: string | null) => {} : setLocalContractorId
  const setContractorName = isControlled ? (_v: string | null) => {} : setLocalContractorName

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
        contractorId: (d.contractorId as string) || null,
        origin: (d.origin as string) || null,
        destination: (d.destination as string) || null,
        direction: (d.direction as string) || null,
        transportMode: (d.transportMode as string) || null,
        rawText: (d.rawText as string) || null,
        senderEmail: (d.senderEmail as string) || null,
        senderName: (d.senderName as string) || null,
        context: (d.context as string) || null,
        highlights: (d.highlights as Highlight[]) || null,
        items: (d.items as RfqContextData['items']) || null,
      }
    },
    enabled: hasRfq,
    staleTime: 60_000,
  })

  // Sync contractor state when RFQ data loads
  useEffect(() => {
    if (rfqContext?.contractorId !== undefined) setContractorId(rfqContext.contractorId)
    if (rfqContext?.companyName !== undefined) setContractorName(rfqContext.companyName)
  }, [rfqContext?.contractorId, rfqContext?.companyName])

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
    if (isControlled) {
      onContractorChangeProp?.(newContractorId, name)
    } else {
      setLocalContractorId(newContractorId)
      setLocalContractorName(name ?? null)
    }
    setEditingContractor(false)
    if (!rfqId) return
    await apiCall(`/api/fms_offers/rfq/${rfqId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contractorId: newContractorId, companyName: name ?? null }),
    })
  }, [rfqId, isControlled, onContractorChangeProp])

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Fetch notes for the RFQ or offer
  const { data: notes } = useQuery({
    queryKey: ['entity_notes', notesEntityType, notesEntityId],
    queryFn: async () => {
      if (!notesEntityId) return []
      const res = await apiCall<{ items: Array<{ id: string; body: string; authorName: string | null; createdAt: string }> }>(`/api/fms_offers/notes?relatedEntityType=${notesEntityType}&relatedEntityId=${notesEntityId}`)
      return res.result?.items || []
    },
    enabled: !!notesEntityId,
    staleTime: 30_000,
  })

  const handlePostNote = useCallback(async () => {
    if (!notesEntityId || !noteInput.trim()) return
    setPostingNote(true)
    try {
      await apiCall('/api/fms_offers/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteInput.trim(), relatedEntityType: notesEntityType, relatedEntityId: notesEntityId }),
      })
      setNoteInput('')
      queryClient.invalidateQueries({ queryKey: ['entity_notes', notesEntityType, notesEntityId] })
      if (hasRfq) {
        queryClient.invalidateQueries({ queryKey: ['rfq_activity', rfqId] })
      }
    } catch { /* non-critical */ }
    setPostingNote(false)
  }, [notesEntityId, notesEntityType, noteInput, queryClient, hasRfq, rfqId])

  const sectionButtonStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
    textAlign: 'left', padding: '10px 16px', cursor: 'pointer',
    border: 'none', background: 'none', color: 'var(--foreground)',
    fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'details', label: t('fms_offers.context.tabDetails', 'Details') },
    { id: 'activity', label: t('fms_offers.context.tabActivity', 'Activity') },
  ]

  return (
    <div className="w-[420px] shrink-0 overflow-hidden bg-card flex flex-col border-l">
      {/* Tabs — only when we have an offerId (for activity tab) */}
      {offerId && (
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
      )}

      {/* Tab: Details — accordion sections */}
      {activeTab === 'details' && (
        <div className="flex-1 overflow-y-auto">
          {/* Section: Client */}
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => toggleSection('client')}
              style={sectionButtonStyle}
            >
              {expandedSections.has('client')
                ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {t('fms_offers.context.client', 'Client')}
            </button>
            {expandedSections.has('client') && (
              <div style={{ padding: '0 16px 12px' }}>
                {contractorId && !editingContractor ? (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '13px' }}>
                      {rfqContext?.contactPerson || ''}
                    </div>
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '6px' }}>
                      {contractorName || rfqContext?.companyName || ''}
                    </div>
                    {rfqContext?.senderEmail && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--primary)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>✉</span>
                        {rfqContext.senderEmail}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <ContractorSearchInput
                      value={contractorId}
                      onChange={handleContractorChange}
                      placeholder={t('fms_offers.context.selectContractor', 'Assign contractor...')}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section: Client message — only when RFQ exists */}
          {hasRfq && (
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => toggleSection('message')}
                style={sectionButtonStyle}
              >
                {expandedSections.has('message')
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {t('fms_offers.context.clientMessage', 'Client message')}
              </button>
              {expandedSections.has('message') && (
                <div style={{ padding: '0 16px 12px' }}>
                  {rfqContext?.rawText && rfqContext.highlights ? (
                    <HighlightedText
                      text={rfqContext.rawText}
                      highlights={rfqContext.highlights}
                      senderEmail={rfqContext.senderEmail}
                      senderName={rfqContext.contactPerson}
                      companyName={rfqContext.companyName}
                    />
                  ) : rfqContext?.rawText ? (
                    <div className="p-3 rounded-lg border bg-background text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                      {rfqContext.rawText}
                    </div>
                  ) : rfqContext?.context ? (
                    <div className="p-3 rounded-lg border bg-background text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                      {rfqContext.context}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                      {t('fms_offers.context.noMessage', 'No client message available')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section: Notes */}
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => toggleSection('notes')}
              style={sectionButtonStyle}
            >
              {expandedSections.has('notes')
                ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {t('fms_offers.context.notes', 'Notes')}
              {(notes?.length ?? 0) > 0 && (
                <span style={{
                  fontSize: '10px', fontWeight: 600, background: '#ede9fe', color: '#7c3aed',
                  padding: '1px 6px', borderRadius: '10px', marginLeft: '2px',
                }}>
                  {notes!.length}
                </span>
              )}
            </button>
            {expandedSections.has('notes') && (
              <div style={{ padding: '0 16px 12px' }}>
                {notes && notes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                    {notes.map((note) => (
                      <div key={note.id} className="p-3 rounded-lg border bg-background text-[13px]">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '13px' }}>
                            {note.authorName || 'System'}
                          </span>
                          <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>
                            {new Date(note.createdAt).toLocaleDateString('pl', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        <p style={{ color: 'var(--foreground)', lineHeight: 1.6, margin: 0, fontSize: '13px' }}>
                          {note.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                  <textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    rows={2}
                    placeholder={t('fms_offers.context.addNote', 'Add a note...')}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault()
                        handlePostNote()
                      }
                    }}
                    style={{
                      flex: 1, padding: '6px 8px', border: '1px solid var(--border)',
                      borderRadius: '6px', fontSize: '12px', resize: 'none', outline: 'none',
                      fontFamily: 'inherit', lineHeight: 1.5, color: 'var(--foreground)',
                      background: 'var(--background)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handlePostNote}
                    disabled={postingNote || !noteInput.trim()}
                    style={{
                      width: 28, height: 28, background: 'var(--primary)', border: 'none',
                      borderRadius: '6px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      opacity: postingNote || !noteInput.trim() ? 0.4 : 1,
                    }}
                  >
                    <svg style={{ width: 12, height: 12, color: 'white' }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
                      <path d="M8 13V3M4 7l4-4 4 4" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section: Cargo */}
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => toggleSection('cargo')}
              style={sectionButtonStyle}
            >
              {expandedSections.has('cargo')
                ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {t('fms_offers.context.cargo', 'Cargo')}
            </button>
            {expandedSections.has('cargo') && (
              <div style={{ padding: '0 16px 12px' }}>
                <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Commodity
                </div>
                <input
                  type="text"
                  defaultValue={rfqContext?.items?.[0]?.cargoDescription || ''}
                  placeholder="e.g. Furniture, electronics..."
                  onBlur={async (e) => {
                    const value = e.target.value.trim()
                    if (!rfqId || !rfqContext?.items?.[0]?.id) return
                    await apiCall(`/api/fms_offers/rfq/${rfqId}/items/${rfqContext.items[0].id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cargoDescription: value || null }),
                    })
                  }}
                  style={{
                    width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
                    borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
                    color: 'var(--foreground)', background: 'var(--background)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Activity */}
      {activeTab === 'activity' && offerId && (
        <div className="flex-1 min-h-0">
          <OfferActivitySection offerId={offerId} />
        </div>
      )}
    </div>
  )
}
