'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2, X } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type SopCommentCategory = 'general' | 'financial' | 'operations' | 'compliance'

type SopComment = {
  id: string
  category: SopCommentCategory
  body: string
  authorUserId?: string | null
  authorName?: string | null
  createdAt: string
  updatedAt: string
}

type SopCommentsResponse = {
  items?: SopComment[]
  total?: number
}

type ContractorSopSectionProps = {
  contractorId: string
  contractorName?: string
}

const CATEGORY_COLORS: Record<SopCommentCategory, { bg: string; text: string; ring: string; label: string }> = {
  general: { bg: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', ring: 'ring-gray-400', label: 'General' },
  financial: { bg: 'bg-yellow-200 dark:bg-yellow-800', text: 'text-yellow-800 dark:text-yellow-300', ring: 'ring-yellow-400', label: 'Finance' },
  operations: { bg: 'bg-green-200 dark:bg-green-800', text: 'text-green-800 dark:text-green-300', ring: 'ring-green-500', label: 'Booking' },
  compliance: { bg: 'bg-purple-200 dark:bg-purple-800', text: 'text-purple-800 dark:text-purple-300', ring: 'ring-purple-400', label: 'Compliance' },
}

const CATEGORY_PILL_STYLES: Record<SopCommentCategory, { active: string; inactive: string }> = {
  general: { active: 'bg-gray-200 text-gray-800 ring-1 ring-gray-400 dark:bg-gray-700 dark:text-gray-200', inactive: 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400' },
  financial: { active: 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-400 dark:bg-yellow-900/40 dark:text-yellow-300', inactive: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400' },
  operations: { active: 'bg-green-100 text-green-800 ring-1 ring-green-400 dark:bg-green-900/40 dark:text-green-300', inactive: 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400' },
  compliance: { active: 'bg-purple-100 text-purple-800 ring-1 ring-purple-400 dark:bg-purple-900/40 dark:text-purple-300', inactive: 'bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400' },
}

const CATEGORIES: SopCommentCategory[] = ['general', 'financial', 'operations', 'compliance']

function getInitials(name: string | null | undefined): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return '1 month ago'
  return `${Math.floor(diffDays / 30)} months ago`
}

export function ContractorSopSection({ contractorId, contractorName }: ContractorSopSectionProps) {
  const t = useT()
  const [isAdding, setIsAdding] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [newBody, setNewBody] = React.useState('')
  const [newCategory, setNewCategory] = React.useState<SopCommentCategory>('general')
  const [editBody, setEditBody] = React.useState('')
  const [editCategory, setEditCategory] = React.useState<SopCommentCategory>('general')
  const [isSaving, setIsSaving] = React.useState(false)
  const addTextareaRef = React.useRef<HTMLTextAreaElement>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contractor-sop-comments', contractorId],
    queryFn: async () => {
      const response = await apiCall<SopCommentsResponse>(
        `/api/contractors/sop-comments?contractorId=${contractorId}`
      )
      if (!response.ok) throw new Error('Failed to load SOP comments')
      return response.result?.items ?? []
    },
    enabled: !!contractorId,
  })

  const comments = data ?? []

  const handleAddNote = React.useCallback(async () => {
    if (!newBody.trim()) return
    setIsSaving(true)
    try {
      const response = await apiCall('/api/contractors/sop-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          body: newBody.trim(),
          category: newCategory,
        }),
      })
      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to save'
        throw new Error(errorMsg)
      }
      flash(t('contractors.sop.created', 'Comment added'), 'success')
      setNewBody('')
      setNewCategory('general')
      setIsAdding(false)
      refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [contractorId, newBody, newCategory, refetch, t])

  const handleEditSave = React.useCallback(async (commentId: string) => {
    if (!editBody.trim()) return
    setIsSaving(true)
    try {
      const response = await apiCall('/api/contractors/sop-comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: commentId,
          body: editBody.trim(),
          category: editCategory,
        }),
      })
      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Update failed'
        throw new Error(errorMsg)
      }
      setEditingId(null)
      refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed'
      flash(errorMessage, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [editBody, editCategory, refetch])

  const handleDelete = React.useCallback(async (commentId: string) => {
    try {
      const response = await apiCall('/api/contractors/sop-comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: commentId, deletedAt: new Date().toISOString() }),
      })
      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Delete failed'
        throw new Error(errorMsg)
      }
      refetch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Delete failed'
      flash(errorMessage, 'error')
    }
  }, [refetch])

  const startEdit = React.useCallback((comment: SopComment) => {
    setEditingId(comment.id)
    setEditBody(comment.body)
    setEditCategory(comment.category)
  }, [])

  // Keyboard shortcut: Cmd+Enter to send in add mode
  const handleAddKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleAddNote()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setNewBody('')
      setNewCategory('general')
    }
  }, [handleAddNote])

  // Keyboard shortcut: Cmd+Enter to send in edit mode
  const handleEditKeyDown = React.useCallback((e: React.KeyboardEvent, commentId: string) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleEditSave(commentId)
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }, [handleEditSave])

  React.useEffect(() => {
    if (isAdding && addTextareaRef.current) {
      addTextareaRef.current.focus()
    }
  }, [isAdding])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{t('contractors.sop.title', 'SOP Notes')}</span>
          {comments.length > 0 && (
            <Badge variant="secondary" className="h-5 text-xs px-1.5 rounded-full">
              {comments.length}
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          {t('contractors.sop.addNote', 'Add Note')}
        </button>
      </div>

      {/* Add note dialog (floating popover style) */}
      {isAdding && (
        <div className="border rounded-xl bg-card shadow-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{t('contractors.sop.commentsOn', 'Comments on')}</div>
              <div className="text-sm font-semibold">{contractorName || t('contractors.sop.sopNote', 'SOP Note')}</div>
            </div>
            <button
              type="button"
              onClick={() => { setIsAdding(false); setNewBody(''); setNewCategory('general') }}
              className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <textarea
            ref={addTextareaRef}
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder={t('contractors.sop.placeholder', 'Leave a comment')}
            className="w-full min-h-[80px] text-sm border rounded-lg p-3 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Category selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORIES.map((cat) => {
              const isSelected = newCategory === cat
              const style = CATEGORY_PILL_STYLES[cat]
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setNewCategory(cat)}
                  className={`h-7 px-3 rounded-full text-xs font-medium transition-all ${isSelected ? style.active : style.inactive}`}
                >
                  {CATEGORY_COLORS[cat].label}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">
              {t('contractors.sop.sendHint', 'Press \u2318+Enter to send')}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={handleAddNote}
              disabled={isSaving || !newBody.trim()}
              className="h-8 px-4"
            >
              {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {t('contractors.sop.send', 'Send')}
            </Button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {comments.length === 0 && !isAdding && (
        <div className="text-sm text-muted-foreground text-center py-6 border rounded-lg border-dashed">
          {t('contractors.sop.empty', 'No SOP notes yet')}
        </div>
      )}

      {comments.map((comment) => {
        const catStyle = CATEGORY_COLORS[comment.category]

        return (
          <div key={comment.id} className="border rounded-lg px-3 py-2.5">
            {editingId === comment.id ? (
              /* Edit form (same dialog style) */
              <div className="space-y-3">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, comment.id)}
                  className="w-full min-h-[80px] text-sm border rounded-lg p-3 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
                <div className="flex items-center gap-2 flex-wrap">
                  {CATEGORIES.map((cat) => {
                    const isSelected = editCategory === cat
                    const style = CATEGORY_PILL_STYLES[cat]
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setEditCategory(cat)}
                        className={`h-7 px-3 rounded-full text-xs font-medium transition-all ${isSelected ? style.active : style.inactive}`}
                      >
                        {CATEGORY_COLORS[cat].label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('contractors.sop.sendHint', 'Press \u2318+Enter to send')}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                      className="h-7 text-xs"
                      disabled={isSaving}
                    >
                      {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleEditSave(comment.id)}
                      className="h-8 px-4"
                      disabled={isSaving || !editBody.trim()}
                    >
                      {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      {t('contractors.sop.send', 'Send')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Display mode */
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">
                  {getInitials(comment.authorName)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge
                      variant="secondary"
                      className={`text-xs h-5 px-2 font-medium border-0 ${catStyle.bg} ${catStyle.text}`}
                    >
                      {catStyle.label}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed">{comment.body}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <span className="text-xs text-muted-foreground mr-1">
                    {formatRelativeDate(comment.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(comment)}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
