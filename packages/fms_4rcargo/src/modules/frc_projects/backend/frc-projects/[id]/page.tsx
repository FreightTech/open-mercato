'use client'

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Eye, FolderOpen, Truck } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AddConsoleDialog } from '../../../components/AddConsoleDialog'

interface ProjectDetail {
  id: string
  projectNumber: string
  rfqId: string | null
  rfqName: string | null
  offerId: string | null
  offerName: string | null
  accountId: string | null
  status: string
  totalValue: string | null
  currencyCode: string
  createdAt: string
  updatedAt: string
}

interface ConsoleRow {
  id: string
  name: string
  date: string
  status: string
  truckPresetId: string
  truck: { id: string; name: string } | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
}

const PROJECT_STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
}

const CONSOLE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planning: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  loaded: { bg: '#d1fae5', text: '#065f46' },
  completed: { bg: '#e5e7eb', text: '#374151' },
}

export default function FrcProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showAddConsole, setShowAddConsole] = useState(false)

  const projectId = params.id

  // Fetch project details
  const { data: project, isLoading: isLoadingProject } = useQuery({
    queryKey: ['frc_project', projectId],
    queryFn: async () => {
      const call = await apiCall<ProjectDetail>(`/api/frc_projects/projects/${projectId}`)
      if (!call.ok) throw new Error('Failed to load project')
      return call.result
    },
    enabled: !!projectId,
  })

  // Fetch consoles for this project
  const { data: consolesData, isLoading: isLoadingConsoles, refetch: refetchConsoles } = useQuery({
    queryKey: ['frc_console', 'project', projectId],
    queryFn: async () => {
      const call = await apiCall<{ items: ConsoleRow[]; total: number }>(
        `/api/frc_console/console?projectId=${projectId}&limit=100`
      )
      if (!call.ok) throw new Error('Failed to load consoles')
      return call.result ?? { items: [], total: 0 }
    },
    enabled: !!projectId,
  })

  const handleViewConsole = useCallback((consoleId: string) => {
    router.push(`/backend/frc-console/${consoleId}`)
  }, [router])

  const handleAddConsoleSuccess = useCallback(() => {
    setShowAddConsole(false)
    refetchConsoles()
    queryClient.invalidateQueries({ queryKey: ['frc_console'] })
  }, [refetchConsoles, queryClient])

  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/backend/frc-projects')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{project.projectNumber}</h1>
            <Badge variant={PROJECT_STATUS_COLORS[project.status] ?? 'secondary'}>
              {project.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {project.rfqName && <span>RFQ: {project.rfqName}</span>}
            {project.offerName && <span> | Offer: {project.offerName}</span>}
          </p>
        </div>
      </div>

      {/* Project Info Card */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Project Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Project Number</p>
              <p className="font-mono">{project.projectNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="capitalize">{project.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Value</p>
              <p>{project.totalValue ? `${project.totalValue} ${project.currencyCode}` : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p>{new Date(project.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consoles Section */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">
                Truck Loading Consoles ({consolesData?.items.length ?? 0})
              </CardTitle>
            </div>
            <Button size="sm" onClick={() => setShowAddConsole(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Console
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoadingConsoles ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : consolesData?.items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No consoles for this project. Click &quot;Add Console&quot; to create one.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead className="w-[120px]">Truck</TableHead>
                    <TableHead className="w-[150px]">Route</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consolesData?.items.map((console_) => (
                    <TableRow
                      key={console_.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewConsole(console_.id)}
                    >
                      <TableCell className="font-medium">{console_.name}</TableCell>
                      <TableCell>{new Date(console_.date).toLocaleDateString()}</TableCell>
                      <TableCell>{console_.truck?.name ?? '-'}</TableCell>
                      <TableCell>
                        {console_.originAirport?.code ?? '?'} - {console_.destinationAirport?.code ?? '?'}
                      </TableCell>
                      <TableCell>
                        <span
                          className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                          style={{
                            backgroundColor: CONSOLE_STATUS_COLORS[console_.status]?.bg ?? '#f3f4f6',
                            color: CONSOLE_STATUS_COLORS[console_.status]?.text ?? '#374151',
                          }}
                        >
                          {console_.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewConsole(console_.id)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Console Dialog */}
      <AddConsoleDialog
        projectId={projectId}
        open={showAddConsole}
        onOpenChange={setShowAddConsole}
        onSuccess={handleAddConsoleSuccess}
      />
    </div>
  )
}
