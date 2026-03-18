import React, { useState, useRef, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ChevronDown, ChevronRight, Send, Trash2, Loader2, Building2, Pencil, X, Paperclip, FileText, Download } from 'lucide-react'
import { HighlightedText } from './HighlightedText'
import { ActivityAvatar } from '../../../lib/activity/components/ActivityAvatar'
import { formatFileSize } from '../../../lib/activity/utils'
import MentionPopup from '@open-mercato/ui/backend/dynamic-table/components/MentionPopup'
import type { MentionPopupHandle } from '@open-mercato/ui/backend/dynamic-table/components/MentionPopup'
import { ContractorSearchInput } from './ContractorSearchInput'
import { ExchangeRateSection } from './ExchangeRateSection'
import { useRfqAnnotations, type AnnotationComment } from '../lib/useRfqAnnotations'
import { useRfqAttachments } from '../lib/useRfqAttachments'
import type { ExtractionResult, RfqDetailData } from '../lib/wizard-types'

type CurrentUser = { id: string; name: string | null; email: string }

function useCurrentUser() {
  const { data } = useQuery({
    queryKey: ['current-user-profile'],
    queryFn: async () => {
      const res = await apiCall<CurrentUser>('/api/auth/profile')
      return res.result ?? null
    },
    staleTime: 5 * 60_000,
  })
  return data ?? null
}

type RfqContextPanelProps = {
  rfqId: string | null
  rfqTitle?: string
  rawText: string
  extracting?: boolean
  extraction: ExtractionResult | null
  rfqDetail: RfqDetailData | null | undefined
  usedCurrencies?: string[]
}

type TabId = 'details' | 'activity'

const MENTION_PATTERN = /@\[([^\]]+)\]\(([^)]+)\)/g

type PendingMention = { id: string; name: string }
type MentionState = { active: boolean; startIndex: number; query: string }

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function renderMentionText(content: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = new RegExp(MENTION_PATTERN.source, 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={match.index} className="font-medium text-primary">@{match[1]}</span>
    )
    lastIndex = regex.lastIndex
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}

function buildWireContent(displayText: string, pendingMentions: PendingMention[]): string {
  let result = displayText
  for (const m of pendingMentions) {
    result = result.replace(`@${m.name}`, `@[${m.name}](${m.id})`)
  }
  return result
}

function CommentItem({ comment, onDelete }: { comment: AnnotationComment; onDelete: (id: string) => void }) {
  return (
    <div className="flex gap-3 py-3 border-b last:border-b-0">
      <ActivityAvatar actor={{ userId: comment.userId, name: comment.userName }} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[13px] font-semibold text-foreground">{comment.userName || 'You'}</span>
          <span className="text-[13px] text-muted-foreground">commented</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatTimeAgo(comment.createdAt)}</span>
          <button
            type="button"
            onClick={() => onDelete(comment.id)}
            className="ml-auto opacity-0 group-hover/comment:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap mt-0.5">
          {renderMentionText(comment.content)}
        </p>
      </div>
    </div>
  )
}

export function RfqContextPanel({ rfqId, rfqTitle, rawText, extracting, extraction, rfqDetail, usedCurrencies = [] }: RfqContextPanelProps) {
  const t = useT()
  const currentUser = useCurrentUser()
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [messageCollapsed, setMessageCollapsed] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [mentionState, setMentionState] = useState<MentionState | null>(null)
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([])
  const [contractorId, setContractorId] = useState<string | null>(rfqDetail?.contractorId ?? null)
  const [contractorName, setContractorName] = useState<string | null>(rfqDetail?.companyName ?? null)
  const [editingContractor, setEditingContractor] = useState(false)
  const [baseCurrency, setBaseCurrency] = useState(usedCurrencies[0] || 'USD')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionRef = useRef<MentionPopupHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const { comments, loading: commentsLoading, submitting, addComment, deleteComment } = useRfqAnnotations(rfqId)
  const { attachments, loading: attachmentsLoading, uploading, uploadFile, deleteFile } = useRfqAttachments(rfqId)
  const currentUserActor = { userId: currentUser?.id ?? null, name: currentUser?.name || currentUser?.email || '?' }

  const canSubmit = commentText.trim().length > 0 && !submitting

  const handleSubmitComment = useCallback(async () => {
    if (!canSubmit) return
    const wireContent = buildWireContent(commentText.trim(), pendingMentions)
    const mentionedUserIds = pendingMentions.map((m) => m.id)
    await addComment(wireContent, mentionedUserIds.length > 0 ? mentionedUserIds : undefined)
    setCommentText('')
    setPendingMentions([])
  }, [canSubmit, commentText, pendingMentions, addComment])

  const handleCommentKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState?.active) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmitComment()
    }
  }, [mentionState, handleSubmitComment])

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart ?? value.length
    setCommentText(value)

    setPendingMentions((prev) => prev.filter((m) => value.includes(`@${m.name}`)))

    const textBeforeCursor = value.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex >= 0) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' '
      const isStartOfWord = lastAtIndex === 0 || /\s/.test(charBeforeAt)
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)

      if (isStartOfWord && (textAfterAt.length === 0 || !/\s/.test(textAfterAt.slice(0, 1)))) {
        const query = textAfterAt
        if (query.length <= 30 && !/\n/.test(query)) {
          setMentionState({ active: true, startIndex: lastAtIndex, query })
          return
        }
      }
    }

    setMentionState(null)
  }, [])

  const handleMentionSelect = useCallback((user: { id: string; name: string; email: string }) => {
    if (!mentionState || !textareaRef.current) return

    const displayName = user.name || user.email
    const before = commentText.slice(0, mentionState.startIndex)
    const after = commentText.slice(mentionState.startIndex + 1 + mentionState.query.length)
    const displayText = `@${displayName}`
    const updatedComment = before + displayText + ' ' + after

    setCommentText(updatedComment)
    setPendingMentions((prev) => {
      if (prev.some((m) => m.id === user.id)) return prev
      return [...prev, { id: user.id, name: displayName }]
    })
    setMentionState(null)

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const cursorPos = before.length + displayText.length + 1
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(cursorPos, cursorPos)
      }
    })
  }, [mentionState, commentText])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }, [uploadFile])

  const text = rawText || rfqDetail?.rawText || ''
  const highlights = extraction?.extraction.highlights || rfqDetail?.highlights
  const hasMessage = !!(text || rfqDetail?.context)
  const displayTitle = rfqTitle || rfqDetail?.title

  const TABS: { id: TabId; label: string }[] = [
    { id: 'details', label: t('tasks_board.context.tabDetails', 'Details') },
    { id: 'activity', label: t('tasks_board.context.tabActivity', 'Context') },
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

      {/* Tab: Context — exchange rates on top, then composer + comments below */}
      {activeTab === 'activity' && rfqId && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Exchange rates — pinned at top */}
          <div className="shrink-0 px-5 py-3 border-b">
            <ExchangeRateSection
              usedCurrencies={usedCurrencies}
              baseCurrency={baseCurrency}
              onBaseCurrencyChange={setBaseCurrency}
            />
          </div>

          {/* Composer + attach */}
          <div className="px-5 py-2.5 shrink-0 border-b space-y-1.5">
            <div className="flex gap-2 items-center">
              <ActivityAvatar actor={currentUserActor} size={26} />
              <div className="flex-1 relative">
                <input
                  ref={textareaRef as unknown as React.RefObject<HTMLInputElement>}
                  type="text"
                  className="w-full rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={t('tasks_board.context.addNote', 'Add a comment...')}
                  value={commentText}
                  onChange={handleTextareaChange as unknown as React.ChangeEventHandler<HTMLInputElement>}
                  onKeyDown={handleCommentKeyDown as unknown as React.KeyboardEventHandler<HTMLInputElement>}
                  disabled={submitting}
                />
                {mentionState?.active && textareaRef.current && (
                  <MentionPopup
                    ref={mentionRef}
                    query={mentionState.query}
                    anchorEl={textareaRef.current}
                    onSelect={handleMentionSelect}
                    onClose={() => setMentionState(null)}
                    visible
                  />
                )}
              </div>
              <button
                type="button"
                onClick={handleSubmitComment}
                disabled={!canSubmit}
                className={`
                  inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all shrink-0
                  ${canSubmit
                    ? 'bg-foreground text-background hover:bg-foreground/90 shadow-sm'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                  }
                `}
              >
                <Send className="h-2.5 w-2.5" />
                {submitting ? '...' : t('tasks_board.context.send', 'Post')}
              </button>
            </div>
            <div className="ml-8">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs py-0.5 rounded transition-colors"
              >
                <Paperclip className="h-3 w-3" />
                <span>{t('tasks_board.context.attachFile', 'Attach file')}</span>
              </button>
            </div>
          </div>

          {/* Comments + attachments feed — scrollable, takes remaining space */}
          <div className="flex-1 px-5 overflow-y-auto">
            {commentsLoading || attachmentsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {comments.map((comment) => (
                  <div key={comment.id} className="group/comment">
                    <CommentItem comment={comment} onDelete={deleteComment} />
                  </div>
                ))}

                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2.5 py-2.5 border-b last:border-b-0 group/att"
                  >
                    <a
                      href={att.url || `/api/attachments/file/${att.id}?download=1`}
                      download
                      className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded bg-muted shrink-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-foreground truncate">{att.fileName}</div>
                        <div className="text-[10px] text-muted-foreground">{formatFileSize(att.fileSize)}</div>
                      </div>
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteFile(att.id)}
                      className="opacity-0 group-hover/att:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {uploading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading...
                  </div>
                )}
              </>
            )}
          </div>
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
