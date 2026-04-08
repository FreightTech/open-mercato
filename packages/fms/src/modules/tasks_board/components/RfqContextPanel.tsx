import React, { useState, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ChevronDown, ChevronRight, Building2, Pencil, X, User, MessageSquare, FileText, Package } from 'lucide-react'
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
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['client', 'message']))
  const [noteInput, setNoteInput] = useState('')
  const [postingNote, setPostingNote] = useState(false)
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

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Fetch notes for the RFQ
  const { data: notes } = useQuery({
    queryKey: ['rfq_notes', rfqId],
    queryFn: async () => {
      if (!rfqId) return []
      const res = await apiCall<{ items: Array<{ id: string; body: string; authorName: string | null; createdAt: string }> }>(`/api/fms_offers/notes?relatedEntityType=fms_rfq&relatedEntityId=${rfqId}`)
      return res.result?.items || []
    },
    enabled: !!rfqId,
    staleTime: 30_000,
  })

  const handlePostNote = useCallback(async () => {
    if (!rfqId || !noteInput.trim()) return
    setPostingNote(true)
    try {
      await apiCall('/api/fms_offers/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteInput.trim(), relatedEntityType: 'fms_rfq', relatedEntityId: rfqId }),
      })
      setNoteInput('')
      queryClient.invalidateQueries({ queryKey: ['rfq_notes', rfqId] })
      queryClient.invalidateQueries({ queryKey: ['rfq_activity', rfqId] })
    } catch { /* non-critical */ }
    setPostingNote(false)
  }, [rfqId, noteInput, queryClient])

  const text = rawText || rfqDetail?.rawText || ''
  const highlights = extraction?.extraction.highlights || rfqDetail?.highlights
  const hasMessage = !!(text || rfqDetail?.context)
  const displayTitle = rfqTitle || rfqDetail?.title

  const TABS: { id: TabId; label: string }[] = [
    { id: 'details', label: t('tasks_board.context.tabDetails', 'Details') },
    { id: 'activity', label: t('tasks_board.context.tabContext', 'Context') },
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

      {/* Tab: Details — accordion sections */}
      {activeTab === 'details' && (
        <div className="flex-1 overflow-y-auto">
          {/* Section: Klient (Client) */}
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => toggleSection('client')}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
                textAlign: 'left', padding: '10px 16px', cursor: 'pointer',
                border: 'none', background: 'none', color: 'var(--foreground)',
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              {expandedSections.has('client')
                ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {t('tasks_board.context.client', 'Client')}
            </button>
            {expandedSections.has('client') && (
              <div style={{ padding: '0 16px 12px' }}>
                {contractorId && !editingContractor ? (
                  <div className="group/contractor">
                    <div style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '13px' }}>
                      {extraction?.extraction.contactPerson || rfqDetail?.contactPerson || ''}
                    </div>
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '6px' }}>
                      {contractorName || rfqDetail?.companyName || ''}
                    </div>
                    {(extraction?.extraction.senderEmail || rfqDetail?.senderEmail) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--primary)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>✉</span>
                        {extraction?.extraction.senderEmail || rfqDetail?.senderEmail}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <ContractorSearchInput
                      value={contractorId}
                      onChange={handleContractorChange}
                      placeholder={t('tasks_board.context.selectContractor', 'Assign contractor...')}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section: Wiadomość klienta (Client message) */}
          {rfqId && (
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => toggleSection('message')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
                  textAlign: 'left', padding: '10px 16px', cursor: 'pointer',
                  border: 'none', background: 'none', color: 'var(--foreground)',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                {expandedSections.has('message')
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {t('tasks_board.context.clientMessage', 'Client message')}
              </button>
              {expandedSections.has('message') && (
                <div style={{ padding: '0 16px 12px' }}>
                  {extracting ? (
                    <div className="flex flex-col gap-2.5">
                      {[100, 80, 90, 70].map((w, i) => (
                        <div key={i} className="h-3.5 rounded-md bg-muted animate-pulse" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
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
                    <div className="p-3 rounded-lg border bg-background text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                      {text}
                    </div>
                  ) : rfqDetail?.context ? (
                    <div className="p-3 rounded-lg border bg-background text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                      {rfqDetail.context}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                      {t('tasks_board.context.noMessage', 'No client message available')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section: Notatki (Notes) */}
          {rfqId && (
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => toggleSection('notes')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
                  textAlign: 'left', padding: '10px 16px', cursor: 'pointer',
                  border: 'none', background: 'none', color: 'var(--foreground)',
                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                {expandedSections.has('notes')
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {t('tasks_board.context.notes', 'Notes')}
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
                      placeholder={t('tasks_board.context.addNote', 'Add a note...')}
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
          )}

          {/* Section: Ładunek (Cargo) */}
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => toggleSection('cargo')}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
                textAlign: 'left', padding: '10px 16px', cursor: 'pointer',
                border: 'none', background: 'none', color: 'var(--foreground)',
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              {expandedSections.has('cargo')
                ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {t('tasks_board.context.cargo', 'Cargo')}
            </button>
            {expandedSections.has('cargo') && (
              <div style={{ padding: '0 16px 12px' }}>
                <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Commodity
                </div>
                <input
                  type="text"
                  defaultValue={rfqDetail?.items?.[0]?.cargoDescription || extraction?.extraction.items?.[0]?.cargoDescription || ''}
                  placeholder="e.g. Furniture, electronics..."
                  onBlur={async (e) => {
                    const value = e.target.value.trim()
                    if (!rfqId || !rfqDetail?.items?.[0]?.id) return
                    await apiCall(`/api/fms_offers/rfq/${rfqId}/items/${rfqDetail.items[0].id}`, {
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
                onClick={() => toggleSection('fallback-message')}
                className="flex items-center gap-1.5 mb-2.5"
              >
                {!expandedSections.has('fallback-message') ? (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t('tasks_board.wizard.originalMessage', 'Original Message')}
                </span>
              </button>

              {expandedSections.has('fallback-message') && (
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
