'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { FolderOpen, Trash2, Plane } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export interface ProjectHeaderData {
  id: string
  projectNumber: string
  status: string
  rfqName: string | null
  offerName: string | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  createdAt: string
}

interface ProjectHeaderCardProps {
  project: ProjectHeaderData
  onDelete: () => Promise<void>
  onDeactivate: () => Promise<void>
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

export function ProjectHeaderCard({ project, onDelete, onDeactivate }: ProjectHeaderCardProps) {
  const t = useT()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      t('frc_projects.detail.deleteConfirm', 'Are you sure you want to delete this project?')
    )
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await onDelete()
    } finally {
      setIsDeleting(false)
    }
  }, [onDelete, t])

  const handleDeactivate = useCallback(async () => {
    const isActive = project.status === 'active'
    const action = isActive ? 'deactivate' : 'activate'
    const confirmMessage = isActive
      ? t('frc_projects.detail.deactivateConfirm', 'Are you sure you want to deactivate this project?')
      : t('frc_projects.detail.activateConfirm', 'Are you sure you want to activate this project?')

    const confirmed = window.confirm(confirmMessage)
    if (!confirmed) return

    setIsDeactivating(true)
    try {
      await onDeactivate()
    } finally {
      setIsDeactivating(false)
    }
  }, [onDeactivate, project.status, t])

  const route = `${project.originAirport?.code ?? '?'} → ${project.destinationAirport?.code ?? '?'}`
  const isActive = project.status === 'active'

  return (
    <div className="border rounded-lg p-6 bg-card">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{project.projectNumber}</h1>
              <Badge variant={STATUS_VARIANTS[project.status] ?? 'secondary'}>
                {project.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Plane className="w-4 h-4" />
              <span className="font-mono">{route}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {project.rfqName && (
                <span>
                  {t('frc_projects.detail.header.opportunity', 'Opportunity')}: {project.rfqName}
                </span>
              )}
              {project.offerName && (
                <span>
                  {t('frc_projects.detail.header.offer', 'Offer')}: {project.offerName}
                </span>
              )}
              <span>{formatDate(project.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeactivate}
            disabled={isDeactivating}
          >
            {isDeactivating ? (
              <Spinner className="w-4 h-4" />
            ) : isActive ? (
              t('frc_projects.detail.deactivate', 'Deactivate')
            ) : (
              t('frc_projects.detail.activate', 'Activate')
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Spinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
