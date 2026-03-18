import { useState, useCallback, useEffect, useRef } from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type AnnotationComment = {
  id: string
  userId: string
  userName: string
  content: string
  createdAt: string
  updatedAt: string
}

type AnnotationData = {
  id: string
  entityType: string
  rowId: string
  columnKey: string
  comments: Array<{
    id: string
    userId: string
    userName?: string
    user_name?: string
    content: string
    createdAt: string
    updatedAt: string
  }>
}

export function useOfferAnnotations(offerId: string | null) {
  const [annotationId, setAnnotationId] = useState<string | null>(null)
  const [comments, setComments] = useState<AnnotationComment[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fetchedRef = useRef<string | null>(null)

  const fetchAnnotations = useCallback(async () => {
    if (!offerId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ entityType: 'fms_offer', rowIds: offerId })
      const res = await apiCall<{ items?: AnnotationData[] }>(`/api/annotations/annotations?${params}`)
      const items = res.result?.items || []
      const contextAnnotation = items.find((a) => a.columnKey === '_context')
      if (contextAnnotation) {
        setAnnotationId(contextAnnotation.id)
        setComments(
          (contextAnnotation.comments || []).map((c) => ({
            id: c.id,
            userId: c.userId,
            userName: c.userName || c.user_name || 'User',
            content: c.content,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          }))
        )
      } else {
        setAnnotationId(null)
        setComments([])
      }
    } catch {
      setAnnotationId(null)
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [offerId])

  useEffect(() => {
    if (offerId && offerId !== fetchedRef.current) {
      fetchedRef.current = offerId
      fetchAnnotations()
    }
    if (!offerId) {
      fetchedRef.current = null
      setAnnotationId(null)
      setComments([])
    }
  }, [offerId, fetchAnnotations])

  const ensureAnnotation = useCallback(async (): Promise<string | null> => {
    if (annotationId) return annotationId
    if (!offerId) return null
    const res = await apiCall<{ id?: string }>('/api/annotations/annotations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entityType: 'fms_offer',
        rowId: offerId,
        columnKey: '_context',
      }),
    })
    const newId = res.result?.id || null
    if (newId) setAnnotationId(newId)
    return newId
  }, [annotationId, offerId])

  const addComment = useCallback(async (content: string, mentionedUserIds?: string[]) => {
    if (!content.trim()) return
    setSubmitting(true)
    try {
      const annId = await ensureAnnotation()
      if (!annId) return
      await apiCall(`/api/annotations/annotations/${annId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          ...(mentionedUserIds && mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
        }),
      })
      await fetchAnnotations()
    } finally {
      setSubmitting(false)
    }
  }, [ensureAnnotation, fetchAnnotations])

  const deleteComment = useCallback(async (commentId: string) => {
    if (!annotationId) return
    await apiCall(`/api/annotations/annotations/${annotationId}/comments?commentId=${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
    })
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }, [annotationId])

  return { comments, loading, submitting, addComment, deleteComment, refresh: fetchAnnotations }
}
