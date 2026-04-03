'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ActivityPanel } from '../../../lib/activity/components/ActivityPanel'
import type { ActivityEntry, ActivityFilter } from '../../../lib/activity/types'

type ContractorActivitySectionProps = {
  contractorId: string
}

export function ContractorActivitySection({ contractorId }: ContractorActivitySectionProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['contractor_activity', contractorId, filter],
    queryFn: async () => {
      const response = await apiCall<{ items: ActivityEntry[]; total: number }>(
        `/api/contractors/contractors/${contractorId}/activity?filter=${filter}`
      )
      if (!response.ok) throw new Error('Failed to load activity')
      return response.result
    },
    enabled: !!contractorId,
    staleTime: 30_000,
  })

  const postMutation = useMutation({
    mutationFn: async ({ body, file, mentionedUserIds }: { body: string; file?: File; mentionedUserIds?: string[] }) => {
      let fetchOptions: RequestInit

      if (file) {
        const formData = new FormData()
        formData.append('body', body)
        formData.append('contractorId', contractorId)
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
          body: JSON.stringify({
            body,
            contractorId,
            ...(mentionedUserIds && mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
          }),
        }
      }

      const response = await apiCall(
        '/api/contractors/comments',
        fetchOptions
      )
      if (!response.ok) {
        throw new Error((response.result as { error?: string })?.error || 'Failed to post comment')
      }
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor_activity', contractorId] })
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

  return (
    <ActivityPanel
      entries={data?.items ?? []}
      isLoading={isLoading}
      activeFilter={filter}
      onFilterChange={setFilter}
      onPostComment={handlePostComment}
      isPostingComment={postMutation.isPending}
    />
  )
}
