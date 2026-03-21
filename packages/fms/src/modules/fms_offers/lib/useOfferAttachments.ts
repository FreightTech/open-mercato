import { useState, useCallback, useEffect, useRef } from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type AttachmentItem = {
  id: string
  fileName: string
  fileSize: number
  mimeType?: string | null
  url?: string
  createdAt?: string
}

export function useOfferAttachments(offerId: string | null) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fetchedRef = useRef<string | null>(null)

  const fetchAttachments = useCallback(async () => {
    if (!offerId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ entityId: 'fms_offer', recordId: offerId })
      const res = await apiCall<{ items: AttachmentItem[] }>(`/api/attachments?${params}`)
      const items = res.result?.items
      setAttachments(Array.isArray(items) ? items : [])
    } catch {
      setAttachments([])
    } finally {
      setLoading(false)
    }
  }, [offerId])

  useEffect(() => {
    if (offerId && offerId !== fetchedRef.current) {
      fetchedRef.current = offerId
      fetchAttachments()
    }
    if (!offerId) {
      fetchedRef.current = null
      setAttachments([])
    }
  }, [offerId, fetchAttachments])

  const uploadFile = useCallback(async (file: File) => {
    if (!offerId) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('entityId', 'fms_offer')
      fd.set('recordId', offerId)
      fd.set('file', file)
      await apiCall<{ ok?: boolean }>('/api/attachments', { method: 'POST', body: fd })
      await fetchAttachments()
    } finally {
      setUploading(false)
    }
  }, [offerId, fetchAttachments])

  const deleteFile = useCallback(async (attachmentId: string) => {
    await apiCall(`/api/attachments?id=${encodeURIComponent(attachmentId)}`, { method: 'DELETE' })
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }, [])

  return { attachments, loading, uploading, uploadFile, deleteFile, refresh: fetchAttachments }
}
