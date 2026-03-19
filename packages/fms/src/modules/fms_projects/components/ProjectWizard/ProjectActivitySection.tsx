'use client'

import { useState, useCallback, useEffect } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ActivityPanel } from '../../../../lib/activity/components/ActivityPanel'
import type { ActivityEntry, ActivityFilter } from '../../../../lib/activity/types'

type ProjectActivitySectionProps = {
  projectId: string
  onDocumentClick?: (documentId: string) => void
}

type ActivityPage = {
  items: ActivityEntry[]
  total: number
  nextCursor: string | null
  currentUser?: { userId: string | null; name: string }
}

export function ProjectActivitySection({ projectId, onDocumentClick }: ProjectActivitySectionProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const queryClient = useQueryClient()

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['fms_project_activity', projectId, filter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ filter, limit: '50' })
      if (pageParam) params.set('cursor', pageParam)

      const response = await apiCall<ActivityPage>(
        `/api/fms_projects/projects/${projectId}/activity?${params}`
      )
      if (!response.ok) throw new Error('Failed to load activity')
      return response.result
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !!projectId,
    staleTime: 30_000,
  })

  // Listen for project mutations and reload activity
  useEffect(() => {
    const invalidateActivity = () => {
      // Small delay so the server has time to write the ActionLog
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['fms_project_activity', projectId] })
      }, 1500)
    }

    // Subscribe to query cache to detect project-related mutations completing
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return
      const key = event.query.queryKey
      if (!Array.isArray(key)) return

      const isProjectMutation =
        (key[0] === 'fms_project' && key[1] === projectId) ||
        (typeof key[0] === 'string' && key[0].startsWith('fms_project_') && key[1] === projectId)

      if (isProjectMutation) invalidateActivity()
    })

    return unsubscribe
  }, [queryClient, projectId])

  const allEntries = data?.pages.flatMap((page) => page?.items ?? []) ?? []
  const currentUser = data?.pages[0]?.currentUser

  const postMutation = useMutation({
    mutationFn: async ({ body, file, mentionedUserIds }: { body: string; file?: File; mentionedUserIds?: string[] }) => {
      let fetchOptions: RequestInit

      if (file) {
        const formData = new FormData()
        formData.append('body', body)
        formData.append('file', file)
        if (mentionedUserIds && mentionedUserIds.length > 0) {
          formData.append('mentionedUserIds', JSON.stringify(mentionedUserIds))
        }
        fetchOptions = {
          method: 'POST',
          body: formData,
        }
      } else {
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, ...(mentionedUserIds && mentionedUserIds.length > 0 ? { mentionedUserIds } : {}) }),
        }
      }

      const response = await apiCall(
        `/api/fms_projects/projects/${projectId}/notes`,
        fetchOptions
      )
      if (!response.ok) {
        throw new Error((response.result as { error?: string })?.error || 'Failed to post comment')
      }
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_project_activity', projectId] })
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
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

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
