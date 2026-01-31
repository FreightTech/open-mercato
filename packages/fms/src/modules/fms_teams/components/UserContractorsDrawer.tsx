'use client'

import * as React from 'react'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, User, Building2, Mail, Users, Search, X } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'

type ContractorAssignment = {
  id: string
  contractorId: string
  contractorName: string
  createdAt: string
}

type Contractor = {
  id: string
  name: string
  shortName?: string | null
  isActive: boolean
}

type UserContractorsDrawerProps = {
  userId: string | null
  userName: string | null
  userEmail: string | null
  teamId?: string | null
  teamName?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserContractorsDrawer({
  userId,
  userName,
  userEmail,
  teamId,
  teamName,
  open,
  onOpenChange,
}: UserContractorsDrawerProps) {
  const queryClient = useQueryClient()
  const [showSelector, setShowSelector] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['user-contractors', userId],
    queryFn: async () => {
      if (!userId) return { items: [], total: 0 }
      const response = await apiCall<{ items: ContractorAssignment[]; total: number }>(
        `/api/fms_teams/user-contractors?userId=${userId}`
      )
      if (!response.ok) throw new Error('Failed to load user contractors')
      return response.result ?? { items: [], total: 0 }
    },
    enabled: open && !!userId,
  })

  // Fetch available contractors for inline selector
  const { data: contractorsData, isLoading: contractorsLoading } = useQuery({
    queryKey: ['contractors-search', search],
    queryFn: async () => {
      const params = new URLSearchParams({
        pageSize: '50',
        isActive: 'true',
      })
      if (search) params.set('search', search)

      const response = await apiCall<{ items: Contractor[] }>(
        `/api/contractors/contractors?${params.toString()}`
      )
      if (!response.ok) throw new Error('Failed to load contractors')
      return response.result?.items ?? []
    },
    enabled: showSelector,
  })

  const existingContractorIds = data?.items?.map((item) => item.contractorId) ?? []
  const filteredContractors = contractorsData?.filter(
    (contractor) => !existingContractorIds.includes(contractor.id)
  )

  const handleAddContractor = async (contractorId: string) => {
    if (!userId) return

    const response = await apiCall<{ id: string; error?: string }>('/api/fms_teams/user-contractors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, contractorId }),
    })

    if (response.ok) {
      flash('Contractor assigned', 'success')
      queryClient.invalidateQueries({ queryKey: ['user-contractors', userId] })
      setShowSelector(false)
      setSearch('')
    } else {
      const error = response.result?.error || 'Failed to assign contractor'
      flash(error, 'error')
    }
  }

  const handleRemoveContractor = async (contractorId: string) => {
    if (!userId) return

    setIsDeleting(contractorId)
    try {
      const response = await apiCall<{ ok: boolean; error?: string }>(
        '/api/fms_teams/user-contractors',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, contractorId }),
        }
      )

      if (response.ok) {
        flash('Contractor removed', 'success')
        queryClient.invalidateQueries({ queryKey: ['user-contractors', userId] })
      } else {
        const error = response.result?.error || 'Failed to remove contractor'
        flash(error, 'error')
      }
    } finally {
      setIsDeleting(null)
    }
  }

  const handleCloseSelector = () => {
    setShowSelector(false)
    setSearch('')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[600px] max-w-full p-0"
        overlayClassName="bg-black/20 backdrop-blur-none"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle>Member Details</SheetTitle>
        </SheetHeader>

        <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-80px)]">
          {/* User Info Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              User Information
            </h3>
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{userName || userEmail || 'Unknown User'}</div>
                  {userName && userEmail && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {userEmail}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Team Assignment Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Team Assignment
            </h3>
            <div className="bg-muted/30 rounded-lg p-4">
              {teamId ? (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-blue-500/10 flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium">{teamName || 'Unnamed Team'}</div>
                    <div className="text-xs text-muted-foreground">Assigned team</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-2">
                  No team assigned
                </div>
              )}
            </div>
          </div>

          {/* Contractors Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Assigned Contractors
              </h3>
              {!showSelector && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSelector(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              )}
            </div>

            {/* Inline Contractor Selector */}
            {showSelector && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Select Contractor</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleCloseSelector}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contractors..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {contractorsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Spinner size="sm" />
                    </div>
                  ) : filteredContractors?.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      {existingContractorIds.length > 0 && contractorsData && contractorsData.length > 0
                        ? 'All contractors are already assigned'
                        : 'No contractors found'}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredContractors?.map((contractor) => (
                        <button
                          key={contractor.id}
                          type="button"
                          onClick={() => handleAddContractor(contractor.id)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <div className="font-medium text-sm">{contractor.name}</div>
                          {contractor.shortName && (
                            <div className="text-xs text-muted-foreground">
                              {contractor.shortName}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : data?.items?.length === 0 && !showSelector ? (
              <div className="bg-muted/30 rounded-lg p-4 text-center text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No contractors assigned</p>
                <p className="text-xs mt-1">
                  Click "Add" to assign contractors to this user
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
      </SheetContent>
    </Sheet>
  )
}
