'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'

type CommentComposerProps = {
  onSubmit: (body: string, file?: File | null) => void
  isSubmitting?: boolean
  placeholder?: string
}

export function CommentComposer({
  onSubmit,
  isSubmitting = false,
  placeholder = 'Write a comment...',
}: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = body.trim()
    if (!trimmed) return
    onSubmit(trimmed, file)
    setBody('')
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [body, file, onSubmit])

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
  }, [])

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="border-t bg-background p-3">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        disabled={isSubmitting}
      />
      {file && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          <span className="truncate max-w-[200px]">{file.name}</span>
          <button
            type="button"
            onClick={() => {
              setFile(null)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            className="text-destructive hover:underline ml-1"
          >
            Remove
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleAttachClick}
            disabled={isSubmitting}
          >
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 px-3"
          onClick={handleSubmit}
          disabled={isSubmitting || !body.trim()}
        >
          <Send className="h-3.5 w-3.5" />
          Post
        </Button>
      </div>
    </div>
  )
}
