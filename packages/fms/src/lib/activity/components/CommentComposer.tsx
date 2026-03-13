'use client'

import { useState, useRef, useCallback } from 'react'
import { Paperclip, X, FileText, Send } from 'lucide-react'
import { formatFileSize } from '../utils'
import { ActivityAvatar } from './ActivityAvatar'

type CommentComposerProps = {
  onSubmit: (body: string, file?: File) => Promise<void>
  isSubmitting: boolean
  currentUser?: { userId?: string | null; name: string }
}

export function CommentComposer({ onSubmit, isSubmitting, currentUser }: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = (body.trim().length > 0 || file !== null) && !isSubmitting

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    await onSubmit(body.trim(), file ?? undefined)
    setBody('')
    setFile(null)
  }, [body, file, canSubmit, onSubmit])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

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
        <textarea
          className="flex-1 resize-none rounded-lg border bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Write a comment..."
          rows={1}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
        />
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
