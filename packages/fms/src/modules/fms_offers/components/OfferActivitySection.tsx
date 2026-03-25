'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ActivityPanel } from '../../../lib/activity/components/ActivityPanel'
import type { ActivityEntry, ActivityFilter } from '../../../lib/activity/types'

type OfferActivitySectionProps = {
  offerId: string
}

export function OfferActivitySection({ offerId }: OfferActivitySectionProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['offer_activity', offerId, filter],
    queryFn: async () => {
      const response = await apiCall<{ items: ActivityEntry[]; total: number }>(
        `/api/fms_offers/offers/${offerId}/activity?filter=${filter}`
      )
      if (!response.ok) throw new Error('Failed to load activity')
      return response.result
    },
    enabled: !!offerId,
    staleTime: 30_000,
  })

  const postMutation = useMutation({
    mutationFn: async ({ body, file }: { body: string; file?: File }) => {
      let fetchOptions: RequestInit

      if (file) {
        const formData = new FormData()
        formData.append('body', body)
        formData.append('relatedEntityType', 'fms_offer')
        formData.append('relatedEntityId', offerId)
        formData.append('file', file)
        fetchOptions = {
          method: 'POST',
          body: formData,
        }
      } else {
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, relatedEntityType: 'fms_offer', relatedEntityId: offerId }),
        }
      }

      const response = await apiCall(
        '/api/fms_offers/notes',
        fetchOptions
      )
      if (!response.ok) {
        throw new Error((response.result as { error?: string })?.error || 'Failed to post comment')
      }
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer_activity', offerId] })
    },
    onError: (error: Error) => {
      flash(error.message, 'error')
    },
  })

  const handlePostComment = useCallback(
    async (body: string, file?: File) => {
      await postMutation.mutateAsync({ body, file })
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
      borderless
    />
  )
}
