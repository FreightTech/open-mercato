'use client'

import { useState, useRef, useCallback } from 'react'
import { Paperclip, X, FileText, Send } from 'lucide-react'
import { formatFileSize } from '../utils'
import { ActivityAvatar } from './ActivityAvatar'
import MentionPopup from '@open-mercato/ui/backend/dynamic-table/components/MentionPopup'
import type { MentionPopupHandle } from '@open-mercato/ui/backend/dynamic-table/components/MentionPopup'

const MENTION_PATTERN = /@\[([^\]]+)\]\(([^)]+)\)/g

type PendingMention = { id: string; name: string }

type MentionState = { active: boolean; startIndex: number; query: string }

type CommentComposerProps = {
  onSubmit: (body: string, file?: File, mentionedUserIds?: string[]) => Promise<void>
  isSubmitting: boolean
  currentUser?: { userId?: string | null; name: string }
}

function buildWireContent(displayText: string, pendingMentions: PendingMention[]): string {
  let result = displayText
  for (const m of pendingMentions) {
    const displayMention = `@${m.name}`
    const wireMention = `@[${m.name}](${m.id})`
    result = result.replace(displayMention, wireMention)
  }
  return result
}

export function CommentComposer({ onSubmit, isSubmitting, currentUser }: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [mentionState, setMentionState] = useState<MentionState | null>(null)
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionRef = useRef<MentionPopupHandle>(null)

  const canSubmit = (body.trim().length > 0 || file !== null) && !isSubmitting

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    const wireContent = buildWireContent(body.trim(), pendingMentions)
    const mentionedUserIds = pendingMentions.map((m) => m.id)
    await onSubmit(wireContent, file ?? undefined, mentionedUserIds.length > 0 ? mentionedUserIds : undefined)
    setBody('')
    setFile(null)
    setPendingMentions([])
  }, [body, file, canSubmit, onSubmit, pendingMentions])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionState?.active) return
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit, mentionState]
  )

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart ?? value.length
    setBody(value)

    // Sync pending mentions: remove any whose display name is no longer in text
    setPendingMentions((prev) => prev.filter((m) => value.includes(`@${m.name}`)))

    // Detect @ trigger
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
    const before = body.slice(0, mentionState.startIndex)
    const after = body.slice(mentionState.startIndex + 1 + mentionState.query.length)
    const displayText = `@${displayName}`
    const updatedBody = before + displayText + ' ' + after

    setBody(updatedBody)
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
  }, [mentionState, body])

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    setFile(selected)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleRemoveFile = useCallback(() => {
    setFile(null)
  }, [])

  const actor = currentUser ?? { userId: null, name: '?' }

  return (
    <div className="space-y-2.5">
      {/* Avatar + textarea row */}
      <div className="flex gap-3 items-start">
        <ActivityAvatar actor={actor} size={32} />
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            className="w-full resize-none rounded-lg border bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Write a comment... (type @ to mention)"
            rows={1}
            value={body}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
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
      </div>

      {/* Attached file preview */}
      {file && (
        <div className="flex items-center gap-2.5 p-2.5 bg-muted/50 rounded-lg text-sm ml-11">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1 text-foreground">{file.name}</span>
          <span className="text-muted-foreground text-xs shrink-0">
            {formatFileSize(file.size)}
          </span>
          <button
            type="button"
            onClick={handleRemoveFile}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Attach + Post row */}
      <div className="flex items-center justify-between ml-11">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs py-1 rounded transition-colors"
          disabled={isSubmitting}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span>Attach</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`
            inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all
            ${canSubmit
              ? 'bg-foreground text-background hover:bg-foreground/90 shadow-sm'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
            }
          `}
        >
          <Send className="h-3 w-3" />
          {isSubmitting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  )
}
