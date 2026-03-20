'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, AlertTriangle, ChevronDown, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import {
  MOCK_FCL_FILE, MOCK_LCL_FILE,
  MOCK_FCL_UNITS, MOCK_LCL_UNITS,
  MOCK_FCL_LEGS, MOCK_LCL_LEGS,
} from '../../../data/mock'
import type { MockFile, MockLegRow, MockUnitRow } from '../../../data/mock'
import { StatusBadge } from '../../../components/StatusBadge'
import { TransportView } from '../../../components/TransportView'
import { FileActivitySection } from '../../../components/FileActivitySection'

// ─── Page Component ───────────────────────────────────────────────────────────

export default function FmsFileDetailPage({ params: propsParams }: { params?: { id?: string } }) {
  const router = useRouter()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()

  const fileId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)
    ?? ''

  const { data: apiFile, isLoading: fileLoading } = useQuery({
    queryKey: ['fms-file', fileId],
    queryFn: async () => {
      if (!fileId) return null
      const res = await apiCall<any>(`/api/fms_files/files/${fileId}`)
      if (!res.ok) return null
      return res.result
    },
    enabled: !!fileId,
  })

  const file: MockFile = apiFile ?? (fileId === 'file-lcl-1' ? MOCK_LCL_FILE : MOCK_FCL_FILE)
  const isFCL = file.cargoType === 'FCL'

  const units: MockUnitRow[] = apiFile?.units ?? (isFCL ? MOCK_FCL_UNITS : MOCK_LCL_UNITS)
  const legs: MockLegRow[] = apiFile?.legs ?? (isFCL ? MOCK_FCL_LEGS : MOCK_LCL_LEGS)

  const [activityOpen, setActivityOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('fms-file-activity-open') !== 'false'
  })

  const toggleActivity = useCallback(() => {
    setActivityOpen((prev) => {
      const next = !prev
      localStorage.setItem('fms-file-activity-open', String(next))
      return next
    })
  }, [])

  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false)
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const queryClient = useQueryClient()

  const { data: usersData } = useQuery({
    queryKey: ['auth-users-for-picker'],
    queryFn: async () => {
      const res = await apiCall<{ items: Array<{ id: string; email: string; name?: string }> }>('/api/auth/users?pageSize=100')
      return res.ok ? (res.result?.items ?? []) : []
    },
  })
  const { data: profileData } = useQuery({
    queryKey: ['auth-profile'],
    queryFn: async () => {
      const res = await apiCall<{ id: string; email: string }>('/api/auth/profile')
      return res.ok ? res.result : null
    },
  })

  const handleAssigneeSelect = useCallback(async (userId: string | null) => {
    setAssigneePickerOpen(false)
    const res = await apiCall(`/api/fms_files/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ assigneeId: userId }),
    })
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })
    }
  }, [fileId, queryClient])

  const handleDeleteLeg = useCallback(async (legId: string) => {
    if (!confirm('Delete this leg? All unit assignments for this leg will also be removed.')) return
    const res = await apiCall(`/api/fms_files/files/${fileId}/legs/${legId}`, { method: 'DELETE' })
    if (res.ok) queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })
  }, [fileId, queryClient])

  if (fileLoading) {
    return React.createElement(LoadingMessage, null)
  }

  return (
    <div className="flex gap-6 pb-20">
    <div className="flex-1 min-w-0 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/backend/fms-files')} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground font-mono">{file.referenceNumber}</h1>
            <Badge variant="outline" className="text-[10px]">{file.cargoType}</Badge>
            <Badge variant="outline" className="text-[10px]">{file.shipmentType}</Badge>
            <StatusBadge status={file.derivedStatus} />
          </div>
        </div>
        <button
          onClick={toggleActivity}
          title={activityOpen ? 'Hide activity' : 'Show activity'}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
        >
          {activityOpen
            ? <PanelRightClose className="w-4 h-4" />
            : <PanelRightOpen className="w-4 h-4" />}
        </button>
        <Button variant="destructive" size="sm">Delete</Button>
      </div>

      {/* Key-value grid */}
      <div className="grid grid-cols-4 gap-4 border border-border rounded-lg bg-card px-4 py-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">Client</p>
          <p className="text-sm text-foreground">{file.contractorName}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">Assignee</p>
          <Popover open={assigneePickerOpen} onOpenChange={setAssigneePickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors group">
                {(file as any).assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}
                <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <Input
                placeholder="Search users..."
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                className="mb-2 h-7 text-xs"
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                <button
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-muted-foreground"
                  onClick={() => { setAssigneeSearch(''); handleAssigneeSelect(null) }}
                >
                  Unassigned
                </button>
                {profileData?.id && (
                  <button
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors font-medium"
                    onClick={() => { setAssigneeSearch(''); handleAssigneeSelect(profileData.id) }}
                  >
                    Assign to me ({profileData.email})
                  </button>
                )}
                <div className="border-t border-border my-1" />
                {(usersData ?? [])
                  .filter((u) => {
                    const q = assigneeSearch.toLowerCase()
                    return !q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q)
                  })
                  .map((u) => (
                    <button
                      key={u.id}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
                      onClick={() => { setAssigneeSearch(''); handleAssigneeSelect(u.id) }}
                    >
                      {u.name || u.email}
                    </button>
                  ))
                }
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">{isFCL ? 'Units' : 'Packages'}</p>
          <p className="text-sm text-foreground">
            {isFCL ? `${units.length}x ${units[0]?.containerType ?? ''}` : `${units[0]?.packageCount ?? 0} total`}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">Created</p>
          <p className="text-sm text-foreground">{file.createdAt}</p>
        </div>
      </div>

      {/* Warnings */}
      {(file.warnings?.length ?? 0) > 0 && (
        <div className="border border-amber-500/30 rounded-lg bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-medium text-amber-500">Warnings ({file.warnings.length})</p>
          </div>
          {file.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-amber-500 mt-0.5">!</span>
              <span className="text-foreground">{w.message} <span className="text-muted-foreground">({w.affectedItems.join(', ')})</span></span>
            </div>
          ))}
        </div>
      )}

      <TransportView
        fileId={fileId}
        units={units as any[]}
        legs={legs as any[]}
        unitLegs={(apiFile?.unitLegs ?? []) as any[]}
        isFCL={isFCL}
        onDeleteLeg={handleDeleteLeg}
        onUnitAdded={() => queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })}
        onAnnotationChange={() => queryClient.invalidateQueries({ queryKey: ['fms_file_activity', fileId] })}
      />
    </div>

    {/* Activity panel */}
    {activityOpen && (
      <div className="w-[360px] shrink-0 sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-hidden">
        <FileActivitySection fileId={fileId} />
      </div>
    )}

    </div>
  )
}
