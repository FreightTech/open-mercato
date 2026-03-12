'use client'

import { FileText, Download } from 'lucide-react'
import type { ActivityEntry } from '../types'
import { formatFileSize, camelToLabel, formatValue } from '../utils'
import { ActivityAvatar } from './ActivityAvatar'

type ActivityItemProps = {
  entry: ActivityEntry
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

function CommentBody({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="space-y-2">
      {entry.body && (
        <p className="text-sm text-foreground whitespace-pre-wrap">{entry.body}</p>
      )}
      {entry.attachment && (
        <a
          href={entry.attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm hover:bg-muted/80 transition-colors"
        >
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1">{entry.attachment.filename}</span>
          <span className="text-muted-foreground text-xs shrink-0">
            {formatFileSize(entry.attachment.size)}
          </span>
          <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </a>
      )}
    </div>
  )
}

function DocumentBody({ entry }: { entry: ActivityEntry }) {
  const fileName = entry.metadata?.fileName as string | undefined
  const fileSize = entry.metadata?.fileSize as number | undefined
  const category = entry.metadata?.documentCategory as string | undefined

  return (
    <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 truncate">
        <span className="font-medium">{fileName || 'Document'}</span>
        {category && (
          <span className="ml-2 text-xs text-muted-foreground px-1.5 py-0.5 bg-background rounded">
            {category}
          </span>
        )}
      </div>
      {fileSize != null && (
        <span className="text-muted-foreground text-xs shrink-0">
          {formatFileSize(fileSize)}
        </span>
      )}
    </div>
  )
}

function TrackingBody({ entry }: { entry: ActivityEntry }) {
  const containerNumber = entry.metadata?.containerNumber as string | undefined
  const locationName = entry.metadata?.locationName as string | undefined

  return (
    <div className="text-sm space-y-0.5">
      <p className="text-foreground">{entry.title}</p>
      {entry.body && <p className="text-muted-foreground">{entry.body}</p>}
      {(containerNumber || locationName) && (
        <p className="text-xs text-muted-foreground">
          {containerNumber && <span>{containerNumber}</span>}
          {containerNumber && locationName && <span> - </span>}
          {locationName && <span>{locationName}</span>}
        </p>
      )}
    </div>
  )
}

function FieldChangeBody({ entry }: { entry: ActivityEntry }) {
  const changes = entry.metadata?.changes as Array<{ field: string; from: unknown; to: unknown }> | undefined

  if (!changes || changes.length === 0) {
    return <p className="text-sm text-foreground">{entry.title}</p>
  }

  return (
    <div className="text-sm space-y-0.5">
      {changes.map((change, i) => (
        <div key={i}>
          <span className="text-muted-foreground">{camelToLabel(change.field)}: </span>
          {change.from != null && (
            <span className="line-through text-muted-foreground">{formatValue(change.from)}</span>
          )}
          {change.from != null && change.to != null && (
            <span className="text-muted-foreground"> → </span>
          )}
          {change.to != null && <span className="text-foreground">{formatValue(change.to)}</span>}
        </div>
      ))}
    </div>
  )
}

function AnnotationBody({ entry }: { entry: ActivityEntry }) {
  const columnKey = entry.metadata?.columnKey as string | undefined

  return (
    <div className="text-sm space-y-1">
      {entry.body && <p className="text-foreground whitespace-pre-wrap">{entry.body}</p>}
      {columnKey && (
        <p className="text-xs text-muted-foreground">
          on <span className="font-medium">{camelToLabel(columnKey)}</span>
        </p>
      )}
    </div>
  )
}

function ProjectCreatedBody({ entry }: { entry: ActivityEntry }) {
  const projectNumber = entry.metadata?.projectNumber as string | undefined
  const route = entry.metadata?.route as string | undefined

  return (
    <div className="text-sm">
      <span className="text-foreground font-medium">
        {projectNumber || 'Project'} created
      </span>
      {route && <span className="text-muted-foreground ml-1">({route})</span>}
    </div>
  )
}

function EntryBody({ entry }: { entry: ActivityEntry }) {
  switch (entry.kind) {
    case 'comment':
      return <CommentBody entry={entry} />
    case 'document':
      return <DocumentBody entry={entry} />
    case 'tracking':
    case 'customs':
      return <TrackingBody entry={entry} />
    case 'field_change':
      return <FieldChangeBody entry={entry} />
    case 'annotation':
      return <AnnotationBody entry={entry} />
    case 'project_created':
      return <ProjectCreatedBody entry={entry} />
    default:
      return entry.body ? <p className="text-sm text-muted-foreground">{entry.body}</p> : null
  }
}

export function ActivityItem({ entry }: ActivityItemProps) {
  return (
    <div className="flex gap-3 py-3">
      <ActivityAvatar actor={entry.actor} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium truncate">{entry.actor.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatRelativeTime(entry.occurredAt)}
          </span>
        </div>
        <EntryBody entry={entry} />
      </div>
    </div>
  )
}
