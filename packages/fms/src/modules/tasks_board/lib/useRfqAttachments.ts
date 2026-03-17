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

export function useRfqAttachments(rfqId: string | null) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fetchedRef = useRef<string | null>(null)

  const fetchAttachments = useCallback(async () => {
    if (!rfqId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ entityId: 'fms_rfq', recordId: rfqId })
      const res = await apiCall<AttachmentItem[]>(`/api/attachments?${params}`)
      setAttachments(Array.isArray(res.result) ? res.result : [])
    } catch {
      setAttachments([])
    } finally {
      setLoading(false)
    }
  }, [rfqId])

  useEffect(() => {
    if (rfqId && rfqId !== fetchedRef.current) {
      fetchedRef.current = rfqId
      fetchAttachments()
    }
    if (!rfqId) {
      fetchedRef.current = null
      setAttachments([])
    }
  }, [rfqId, fetchAttachments])

  const uploadFile = useCallback(async (file: File) => {
    if (!rfqId) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('entityId', 'fms_rfq')
      fd.set('recordId', rfqId)
      fd.set('file', file)
      await apiCall<{ ok?: boolean }>('/api/attachments', { method: 'POST', body: fd })
      await fetchAttachments()
    } finally {
      setUploading(false)
    }
  }, [rfqId, fetchAttachments])

  const deleteFile = useCallback(async (attachmentId: string) => {
    await apiCall(`/api/attachments?id=${encodeURIComponent(attachmentId)}`, { method: 'DELETE' })
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }, [])

  return { attachments, loading, uploading, uploadFile, deleteFile, refresh: fetchAttachments }
}
