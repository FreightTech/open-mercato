'use client'

import { useState, useCallback, useEffect } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ActivityPanel } from '../../../lib/activity/components/ActivityPanel'
import type { ActivityEntry, ActivityFilter } from '../../../lib/activity/types'

type FileActivitySectionProps = {
  fileId: string
  onDocumentClick?: (documentId: string) => void
}

type ActivityPage = {
  items: ActivityEntry[]
  total: number
  nextCursor: string | null
  currentUser?: { userId: string | null; name: string }
}

export function FileActivitySection({ fileId, onDocumentClick }: FileActivitySectionProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const queryClient = useQueryClient()

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['fms_file_activity', fileId, filter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ filter, limit: '50' })
      if (pageParam) params.set('cursor', pageParam)
      const response = await apiCall<ActivityPage>(`/api/fms_files/files/${fileId}/activity?${params}`)
      if (!response.ok) throw new Error('Failed to load activity')
      return response.result
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !!fileId,
    staleTime: 30_000,
  })

  // Invalidate activity when file-related queries succeed
  useEffect(() => {
    const invalidateActivity = () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['fms_file_activity', fileId] })
      }, 1500)
    }

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return
      const key = event.query.queryKey
      if (!Array.isArray(key)) return
      const isFileMutation =
        (key[0] === 'fms-file' && key[1] === fileId) ||
        (typeof key[0] === 'string' && key[0].startsWith('fms_file') && key[1] === fileId)
      if (isFileMutation) invalidateActivity()
    })

    return unsubscribe
  }, [queryClient, fileId])

  const postMutation = useMutation({
    mutationFn: async ({ body, file, mentionedUserIds }: { body: string; file?: File; mentionedUserIds?: string[] }) => {
      let fetchOptions: RequestInit

      if (file) {
        const formData = new FormData()
        formData.append('body', body)
        formData.append('file', file)
        if (mentionedUserIds && mentionedUserIds.length > 0) formData.append('mentionedUserIds', JSON.stringify(mentionedUserIds))
        fetchOptions = { method: 'POST', body: formData }
      } else {
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, ...(mentionedUserIds && mentionedUserIds.length > 0 ? { mentionedUserIds } : {}) }),
        }
      }

      const response = await apiCall(`/api/fms_files/files/${fileId}/notes`, fetchOptions)
      if (!response.ok) throw new Error((response.result as { error?: string })?.error || 'Failed to post comment')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_file_activity', fileId] })
    },
    onError: (error: Error) => {
      flash(error.message, 'error')
    },
  })

  const handlePostComment = useCallback(
    async (body: string, file?: File, mentionedUserIds?: string[]) => {
      await postMutation.mutateAsync({ body, file, mentionedUserIds })
    },
    [postMutation]
  )

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const allEntries = data?.pages.flatMap((page) => page?.items ?? []) ?? []
  const currentUser = data?.pages[0]?.currentUser

  return (
    <ActivityPanel
      entries={allEntries}
      isLoading={isLoading}
      activeFilter={filter}
      onFilterChange={setFilter}
      onPostComment={handlePostComment}
      isPostingComment={postMutation.isPending}
      currentUser={currentUser}
      hasMore={!!hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={handleLoadMore}
      onDocumentClick={onDocumentClick}
    />
  )
}
