'use client'

import { useState, useRef, useCallback } from 'react'
import { Paperclip, X, FileText } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { formatFileSize } from '../utils'

type CommentComposerProps = {
  onSubmit: (body: string, file?: File) => Promise<void>
  isSubmitting: boolean
}

export function CommentComposer({ onSubmit, isSubmitting }: CommentComposerProps) {
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
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleRemoveFile = useCallback(() => {
    setFile(null)
  }, [])

  return (
    <div className="border-t p-3 space-y-2">
      <textarea
        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder="Write a comment..."
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSubmitting}
      />

      {file && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1">{file.name}</span>
          <span className="text-muted-foreground text-xs shrink-0">
            {formatFileSize(file.size)}
          </span>
          <button
            type="button"
            onClick={handleRemoveFile}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          disabled={isSubmitting}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Posting...' : 'Post'}
        </Button>
      </div>
    </div>
  )
}
