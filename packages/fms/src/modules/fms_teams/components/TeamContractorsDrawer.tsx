'use client'

import * as React from 'react'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Users, Building2 } from 'lucide-react'
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
      <SheetContent
        side="right"
        className="w-[600px] max-w-full p-0"
        overlayClassName="bg-black/20 backdrop-blur-none"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle>Team Details</SheetTitle>
        </SheetHeader>

        <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-80px)]">
          {/* Team Info Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Team Information
            </h3>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium">{teamName || 'Unnamed Team'}</div>
                  <div className="text-sm text-muted-foreground">
                    Contractors assigned to all members of this team
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contractors Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Assigned Contractors
              </h3>
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
              <div className="bg-muted/30 rounded-lg p-4 text-center text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No contractors assigned to this team</p>
                <p className="text-xs mt-1">
                  Click "Add" to assign contractors that all team members can access
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {data?.items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-orange-500/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-orange-600" />
                      </div>
                      <span className="text-sm font-medium">{item.contractorName}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveContractor(item.contractorId)}
                      disabled={isDeleting === item.contractorId}
                      className="h-8 w-8"
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
