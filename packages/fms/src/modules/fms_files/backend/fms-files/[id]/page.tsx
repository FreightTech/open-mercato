'use client'

import * as React from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, AlertTriangle, AlertOctagon, Info, ChevronDown, PanelRightOpen, PanelRightClose, DollarSign, Clock } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import type { MockFile, MockLegRow, MockUnitRow } from '../../../data/mock'
import { StatusBadge } from '../../../components/StatusBadge'
import { TransportView } from '../../../components/TransportView'
import { FileActivitySection } from '../../../components/FileActivitySection'
import { FileDocumentsSection } from '../../../components/FileDocumentsSection'
import { FileCostsDrawer } from '../../../components/FileCostsDrawer'

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

  const file: (MockFile & {
    status?: { transport: string; financial: string; documentation: string }
    demDetExposure?: Array<{ legSequence: number; unitId?: string | null; containerNumber?: string | null; type: string; freeTimeDays: number; elapsedDays: number; overdueDays: number; status: string }>
  }) | null = apiFile ?? null
  const isFCL = file?.cargoType === 'FCL'

  const units: MockUnitRow[] = apiFile?.units ?? []
  const legs: MockLegRow[] = apiFile?.legs ?? []

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

  const handleDeleteUnit = useCallback(async (unitId: string) => {
    if (!confirm('Remove this container? All leg assignments for this container will also be removed.')) return
    const res = await apiCall(`/api/fms_files/files/${fileId}/units/${unitId}`, { method: 'DELETE' })
    if (res.ok) queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })
  }, [fileId, queryClient])

  const [costsOpen, setCostsOpen] = useState(false)

  const [notes, setNotes] = useState<string>('')
  const [notesSaving, setNotesSaving] = useState(false)
  const notesInitialized = useRef(false)

  useEffect(() => {
    if (apiFile && !notesInitialized.current) {
      setNotes(apiFile.notes ?? '')
      notesInitialized.current = true
    }
  }, [apiFile])

  const handleNotesSave = useCallback(async () => {
    setNotesSaving(true)
    await apiCall(`/api/fms_files/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ notes: notes || null }),
    })
    setNotesSaving(false)
  }, [fileId, notes])

  if (fileLoading) {
    return React.createElement(LoadingMessage, null)
  }

  if (!file) {
    return React.createElement(ErrorMessage, { label: 'File not found or failed to load.' })
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
            {file.status && (
              <>
                <StatusBadge status={file.status.transport} kind="transport" />
                <StatusBadge status={file.status.financial} kind="financial" />
                <StatusBadge status={file.status.documentation} kind="documentation" />
              </>
            )}
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
        <Button variant="outline" size="sm" onClick={() => setCostsOpen(true)}>
          <DollarSign className="w-4 h-4 mr-1" />
          Costs
        </Button>
        <Button variant="destructive" size="sm" type="button" onClick={async () => {
          if (!confirm('Delete this file? This action cannot be undone.')) return
          const res = await apiCall(`/api/fms_files/files/${fileId}`, { method: 'DELETE' })
          if (res.ok) router.push('/backend/fms-files')
        }}>Delete</Button>
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
          <p className="text-sm text-foreground">{file.createdAt ? new Date(file.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
        </div>
      </div>

      {/* Warnings — grouped by severity */}
      {(file.warnings?.length ?? 0) > 0 && (() => {
        const critical = file.warnings.filter((w: any) => w.severity === 'critical')
        const warning = file.warnings.filter((w: any) => w.severity === 'warning')
        const info = file.warnings.filter((w: any) => w.severity === 'info')

        return (
          <div className="space-y-2">
            {critical.length > 0 && (
              <div className="border border-red-500/30 rounded-lg bg-red-500/10 px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertOctagon className="w-4 h-4 text-red-500" />
                  <p className="text-sm font-medium text-red-500">Critical ({critical.length})</p>
                </div>
                {critical.map((w: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs ml-6">
                    <span className="text-foreground">{w.message}</span>
                  </div>
                ))}
              </div>
            )}
            {warning.length > 0 && (
              <div className="border border-amber-500/30 rounded-lg bg-amber-500/10 px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-medium text-amber-500">Warnings ({warning.length})</p>
                </div>
                {warning.map((w: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs ml-6">
                    <span className="text-foreground">{w.message}</span>
                  </div>
                ))}
              </div>
            )}
            {info.length > 0 && (
              <div className="border border-blue-500/30 rounded-lg bg-blue-500/10 px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Info className="w-4 h-4 text-blue-500" />
                  <p className="text-sm font-medium text-blue-500">Info ({info.length})</p>
                </div>
                {info.map((w: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs ml-6">
                    <span className="text-foreground">{w.message} <span className="text-muted-foreground">({w.affectedItems.join(', ')})</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Demurrage & Detention Exposure */}
      {(file.demDetExposure?.length ?? 0) > 0 && file.demDetExposure!.some((d) => d.status !== 'within_free_time') && (
        <div className="border border-border rounded-lg bg-card px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Demurrage & Detention</p>
          </div>
          <div className="space-y-2">
            {file.demDetExposure!
              .filter((d) => d.status !== 'within_free_time')
              .map((d: any, i: number) => {
                const pct = Math.min(100, (d.elapsedDays / d.freeTimeDays) * 100)
                const barColor = d.status === 'overdue'
                  ? 'bg-red-500'
                  : 'bg-amber-500'
                const label = d.type === 'demurrage' ? 'Demurrage' : 'Detention'

                return (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground shrink-0">{d.containerNumber ? `${d.containerNumber}` : `Leg ${d.legSequence}`}</span>
                    <span className="w-20 shrink-0 font-medium">{label}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 text-right shrink-0">{d.elapsedDays}/{d.freeTimeDays}d</span>
                    {d.overdueDays > 0 && (
                      <span className="text-red-500 font-medium shrink-0">+{d.overdueDays}d</span>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="border border-border rounded-lg bg-card px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase text-muted-foreground font-medium">Notes</p>
          {notesSaving && <span className="text-[10px] text-muted-foreground">Saving…</span>}
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesSave}
          placeholder="Add notes about this file…"
          className="resize-none text-sm min-h-[72px] border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
          rows={3}
        />
      </div>

      <TransportView
        fileId={fileId}
        units={units as any[]}
        legs={legs as any[]}
        unitLegs={(apiFile?.unitLegs ?? []) as any[]}
        isFCL={isFCL}
        onDeleteLeg={handleDeleteLeg}
        onDeleteUnit={handleDeleteUnit}
        onUnitAdded={() => queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })}
        onAnnotationChange={() => queryClient.invalidateQueries({ queryKey: ['fms_file_activity', fileId] })}
      />

      <FileDocumentsSection fileId={fileId} />
    </div>

    <FileCostsDrawer
      fileId={fileId}
      offerId={(apiFile as any)?.offerId ?? null}
      currencyCode={apiFile?.lines?.[0]?.currencyCode ?? 'USD'}
      open={costsOpen}
      onClose={() => setCostsOpen(false)}
    />

    {/* Activity panel */}
    {activityOpen && (
      <div className="w-[360px] shrink-0 sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-hidden">
        <FileActivitySection fileId={fileId} />
      </div>
    )}

    </div>
  )
}
