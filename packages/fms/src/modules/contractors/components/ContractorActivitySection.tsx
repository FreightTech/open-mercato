'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ActivityPanel } from '../../../lib/activity'
import type { ActivityEntry, ActivityFilter } from '../../../lib/activity'

type ContractorActivitySectionProps = {
  contractorId: string
}

type ActivityResponse = {
  items: ActivityEntry[]
  total: number
}

export function ContractorActivitySection({ contractorId }: ContractorActivitySectionProps) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['contractor_activity', contractorId, filter],
    queryFn: async () => {
      const response = await apiCall<ActivityResponse>(
        `/api/contractors/contractors/${contractorId}/activity?filter=${filter}`
      )
      if (!response.ok) throw new Error('Failed to load activity')
      return response.result?.items ?? []
    },
    enabled: !!contractorId,
  })

  const entries = data ?? []

  const handleCommentSubmit = useCallback(
    async (body: string, file?: File | null) => {
      setIsSubmitting(true)
      try {
        let response
        if (file) {
          const formData = new FormData()
          formData.append('body', body)
          formData.append('contractorId', contractorId)
          formData.append('file', file)
          response = await apiCall(
            '/api/contractors/comments',
            { method: 'POST', body: formData }
          )
        } else {
          response = await apiCall(
            '/api/contractors/comments',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body, contractorId }),
            }
          )
        }

        if (!response.ok) {
          const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to post comment'
          throw new Error(errorMsg)
        }

        queryClient.invalidateQueries({ queryKey: ['contractor_activity', contractorId] })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to post comment'
        flash(errorMessage, 'error')
      } finally {
        setIsSubmitting(false)
      }
    },
    [contractorId, queryClient]
  )

  return (
    <ActivityPanel
      entries={entries}
      isLoading={isLoading}
      activeFilter={filter}
      onFilterChange={setFilter}
      onCommentSubmit={handleCommentSubmit}
      isSubmitting={isSubmitting}
    />
  )
}
