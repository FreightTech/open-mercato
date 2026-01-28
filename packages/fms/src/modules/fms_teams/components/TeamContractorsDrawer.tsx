'use client'

import * as React from 'react'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { ContractorSelector } from './ContractorSelector'

type ContractorAssignment = {
  id: string
  contractorId: string
  contractorName: string
  createdAt: string
}

type TeamContractorsDrawerProps = {
  teamId: string | null
  teamName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TeamContractorsDrawer({
  teamId,
  teamName,
  open,
  onOpenChange,
}: TeamContractorsDrawerProps) {
  const queryClient = useQueryClient()
  const [showSelector, setShowSelector] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['team-contractors', teamId],
    queryFn: async () => {
      if (!teamId) return { items: [], total: 0 }
      const response = await apiCall<{ items: ContractorAssignment[]; total: number }>(
        `/api/fms_teams/team-contractors?teamId=${teamId}`
      )
      if (!response.ok) throw new Error('Failed to load team contractors')
      return response.result ?? { items: [], total: 0 }
    },
    enabled: open && !!teamId,
  })

  const handleAddContractor = async (contractorId: string) => {
    if (!teamId) return

    const response = await apiCall<{ id: string; error?: string }>('/api/fms_teams/team-contractors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, contractorId }),
    })

    if (response.ok) {
      flash('Contractor assigned to team', 'success')
      queryClient.invalidateQueries({ queryKey: ['team-contractors', teamId] })
      setShowSelector(false)
    } else {
      const error = response.result?.error || 'Failed to assign contractor'
      flash(error, 'error')
    }
  }

  const handleRemoveContractor = async (contractorId: string) => {
    if (!teamId) return

    setIsDeleting(contractorId)
    try {
      const response = await apiCall<{ ok: boolean; error?: string }>(
        '/api/fms_teams/team-contractors',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, contractorId }),
        }
      )

      if (response.ok) {
        flash('Contractor removed from team', 'success')
        queryClient.invalidateQueries({ queryKey: ['team-contractors', teamId] })
      } else {
        const error = response.result?.error || 'Failed to remove contractor'
        flash(error, 'error')
      }
    } finally {
      setIsDeleting(null)
    }
  }

  const existingContractorIds = data?.items?.map((item) => item.contractorId) ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] max-w-full p-0">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <SheetTitle>Team Contractors</SheetTitle>
          </div>
        </SheetHeader>

        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">{teamName || 'Team'}</div>
            <div className="text-sm text-muted-foreground">
              Contractors assigned to all members of this team
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Assigned Contractors</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSelector(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : data?.items?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No contractors assigned to this team
              </div>
            ) : (
              <div className="space-y-2">
                {data?.items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded border"
                  >
                    <span className="text-sm">{item.contractorName}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveContractor(item.contractorId)}
                      disabled={isDeleting === item.contractorId}
                    >
                      {isDeleting === item.contractorId ? (
                        <Spinner size="xs" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showSelector && (
          <ContractorSelector
            open={showSelector}
            onOpenChange={setShowSelector}
            onSelect={handleAddContractor}
            excludeIds={existingContractorIds}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
