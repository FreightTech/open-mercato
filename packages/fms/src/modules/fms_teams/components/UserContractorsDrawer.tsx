'use client'

import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, User, Building2, Mail, Users, Search, X, Check, Unlink } from 'lucide-react'
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

type Team = {
  id: string
  name: string
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
  onTeamClick?: (teamId: string, teamName: string) => void
  onTeamChange?: () => void
}

export function UserContractorsDrawer({
  userId,
  userName,
  userEmail,
  teamId,
  teamName,
  open,
  onOpenChange,
  onTeamClick,
  onTeamChange,
}: UserContractorsDrawerProps) {
  const queryClient = useQueryClient()
  const [showSelector, setShowSelector] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Team selector state
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamId ?? null)
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)

  const createInputRef = useRef<HTMLInputElement>(null)
  const contractorSearchRef = useRef<HTMLDivElement>(null)

  // Sync selectedTeamId with prop when drawer opens
  useEffect(() => {
    if (open) {
      setSelectedTeamId(teamId ?? null)
      setShowCreateTeam(false)
      setNewTeamName('')
      setSearch('')
      setShowSelector(false)
    }
  }, [open, teamId])

  // Focus create input when shown
  useEffect(() => {
    if (showCreateTeam && createInputRef.current) {
      createInputRef.current.focus()
    }
  }, [showCreateTeam])

  // Close contractor dropdown on outside click
  useEffect(() => {
    if (!showSelector) return

    const handleClickOutside = (e: MouseEvent) => {
      if (contractorSearchRef.current && !contractorSearchRef.current.contains(e.target as Node)) {
        setShowSelector(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSelector])

  // Fetch teams for dropdown
  const { data: teamsData } = useQuery({
    queryKey: ['fms-teams-list'],
    queryFn: async () => {
      const response = await apiCall<{ items: Team[] }>('/api/fms_teams/teams?pageSize=100')
      if (!response.ok) throw new Error('Failed to load teams')
      return response.result?.items ?? []
    },
    enabled: open,
  })

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

  const handleTeamChange = async (newTeamId: string | null) => {
    if (!userId) return
    if (newTeamId === selectedTeamId) return

    setIsUpdatingTeam(true)
    try {
      const response = await apiCall<{ ok: boolean; error?: string }>(
        `/api/fms_teams/members/${userId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: newTeamId }),
        }
      )

      if (response.ok) {
        flash('Team assignment updated', 'success')
        setSelectedTeamId(newTeamId)
        queryClient.invalidateQueries({ queryKey: ['fms-team-members'] })
        queryClient.invalidateQueries({ queryKey: ['fms-teams-list'] })
        onTeamChange?.()
      } else {
        const error = response.result?.error || 'Failed to update team'
        flash(error, 'error')
      }
    } finally {
      setIsUpdatingTeam(false)
    }
  }

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      flash('Team name is required', 'error')
      return
    }

    setIsCreatingTeam(true)
    try {
      const response = await apiCall<{ id: string; error?: string }>('/api/fms_teams/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim() }),
      })

      if (response.ok && response.result) {
        flash('Team created', 'success')
        const newTeamId = response.result.id
        queryClient.invalidateQueries({ queryKey: ['fms-teams-list'] })
        // Automatically assign the user to the new team
        await handleTeamChange(newTeamId)
        setShowCreateTeam(false)
        setNewTeamName('')
      } else {
        const error = response.result?.error || 'Failed to create team'
        flash(error, 'error')
      }
    } finally {
      setIsCreatingTeam(false)
    }
  }

  const selectedTeam = teamsData?.find((t) => t.id === selectedTeamId)
  const selectedTeamDisplayName = selectedTeam?.name ?? teamName

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
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              {/* Team chips */}
              <div className="flex flex-wrap gap-2">
                {/* Current team chip or no team */}
                {selectedTeamId ? (
                  <button
                    type="button"
                    onClick={() => onTeamClick?.(selectedTeamId, selectedTeamDisplayName ?? '')}
                    disabled={isUpdatingTeam}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {selectedTeamDisplayName ?? 'Unnamed Team'}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTeamChange(null)
                      }}
                      className="ml-1 hover:bg-primary-foreground/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm">
                    <Users className="h-3.5 w-3.5" />
                    No team assigned
                  </span>
                )}

                {/* Available teams as chips */}
                {teamsData
                  ?.filter((team) => team.id !== selectedTeamId)
                  .map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => handleTeamChange(team.id)}
                      disabled={isUpdatingTeam}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
                    >
                      {team.name}
                    </button>
                  ))}

                {/* Add team chip */}
                {!showCreateTeam && (
                  <button
                    type="button"
                    onClick={() => setShowCreateTeam(true)}
                    disabled={isUpdatingTeam}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add team
                  </button>
                )}
              </div>

              {/* Loading indicator */}
              {isUpdatingTeam && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size="sm" />
                  <span>Updating team...</span>
                </div>
              )}

              {/* Create team form */}
              {showCreateTeam && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    ref={createInputRef}
                    placeholder="Enter team name..."
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreateTeam()
                      } else if (e.key === 'Escape') {
                        setShowCreateTeam(false)
                        setNewTeamName('')
                      }
                    }}
                    disabled={isCreatingTeam}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateTeam}
                    disabled={isCreatingTeam || !newTeamName.trim()}
                  >
                    {isCreatingTeam ? <Spinner size="sm" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowCreateTeam(false)
                      setNewTeamName('')
                    }}
                    disabled={isCreatingTeam}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Contractors Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Assigned Contractors
            </h3>

            {/* Contractor dropdown selector */}
            <div className="relative" ref={contractorSearchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search and add contractor..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setShowSelector(true)
                  }}
                  onFocus={() => setShowSelector(true)}
                  className="pl-10"
                />
              </div>

              {/* Dropdown results */}
              {showSelector && search && (
                <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                  {contractorsLoading ? (
                    <div className="flex items-center justify-center py-3">
                      <Spinner size="sm" />
                    </div>
                  ) : filteredContractors?.length === 0 ? (
                    <div className="text-center py-3 text-sm text-muted-foreground">
                      {existingContractorIds.length > 0 && contractorsData && contractorsData.length > 0
                        ? 'All contractors already assigned'
                        : 'No contractors found'}
                    </div>
                  ) : (
                    filteredContractors?.map((contractor) => (
                      <button
                        key={contractor.id}
                        type="button"
                        onClick={() => {
                          handleAddContractor(contractor.id)
                          setSearch('')
                          setShowSelector(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <div className="font-medium">{contractor.name}</div>
                        {contractor.shortName && (
                          <div className="text-xs text-muted-foreground">{contractor.shortName}</div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Assigned contractors list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="sm" />
              </div>
            ) : data?.items?.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                No contractors assigned
              </div>
            ) : (
              <div className="divide-y divide-border border rounded-md">
                {data?.items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 px-3 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate">{item.contractorName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveContractor(item.contractorId)}
                      disabled={isDeleting === item.contractorId}
                      className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isDeleting === item.contractorId ? (
                        <Spinner size="sm" />
                      ) : (
                        <Unlink className="h-3.5 w-3.5" />
                      )}
                    </button>
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
