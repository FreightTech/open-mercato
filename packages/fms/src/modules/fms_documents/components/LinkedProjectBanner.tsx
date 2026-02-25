'use client'

import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Link2 } from 'lucide-react'

interface ProjectMatch {
  projectId: string
  projectNumber: string
  clientName: string | null
  currentStep: string | null
  matchedBy: string[]
}

interface MatchedProjectsResponse {
  matches: ProjectMatch[]
}

function formatMatchReason(reason: string): string {
  if (reason === 'blNumber') return 'BL Number'
  if (reason === 'mblNumber') return 'MBL Number'
  if (reason === 'bookingNumber') return 'Booking Number'
  if (reason.startsWith('containerNumber:')) return `Container: ${reason.split(':')[1]}`
  return reason
}

export function LinkedProjectBanner({ documentId }: { documentId: string }) {
  const { data } = useQuery({
    queryKey: ['document-matched-projects', documentId],
    queryFn: async (): Promise<MatchedProjectsResponse | null> => {
      const response = await apiCall<MatchedProjectsResponse>(
        `/api/fms_documents/documents/${documentId}/matched-projects`
      )
      return response.ok ? (response.result as MatchedProjectsResponse) : null
    },
    enabled: !!documentId,
  })

  if (!data?.matches?.length) return null

  return (
    <div className="rounded-lg border bg-blue-50/50 border-blue-200 p-3 space-y-2">
      {data.matches.map((match) => (
        <div key={match.projectId} className="flex items-center gap-2 flex-wrap">
          <Link2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="text-sm text-blue-800">Linked to project:</span>
          <a
            href={`/backend/fms-projects/${match.projectId}`}
            className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
          >
            {match.projectNumber}
          </a>
          {match.clientName && (
            <span className="text-sm text-blue-600">({match.clientName})</span>
          )}
          {match.currentStep && (
            <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300">
              {match.currentStep}
            </Badge>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {match.matchedBy.map((reason) => (
              <Badge
                key={reason}
                variant="secondary"
                className="text-xs"
              >
                {formatMatchReason(reason)}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
