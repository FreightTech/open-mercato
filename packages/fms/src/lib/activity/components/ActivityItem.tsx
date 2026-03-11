'use client'

import {
  MessageSquare,
  FileText,
  Ship,
  AlertTriangle,
  ArrowRight,
  FolderPlus,
  Paperclip,
} from 'lucide-react'
import type { ActivityEntry } from '../types'
import { formatFileSize } from '../utils'
import { ActivityAvatar } from './ActivityAvatar'

type ActivityItemProps = {
  entry: ActivityEntry
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function KindIcon({ kind }: { kind: ActivityEntry['kind'] }) {
  const iconClass = 'h-3.5 w-3.5'
  switch (kind) {
    case 'comment':
      return <MessageSquare className={`${iconClass} text-blue-500`} />
    case 'document':
      return <FileText className={`${iconClass} text-emerald-500`} />
    case 'tracking':
      return <Ship className={`${iconClass} text-violet-500`} />
    case 'customs':
      return <AlertTriangle className={`${iconClass} text-amber-500`} />
    case 'field_change':
      return <ArrowRight className={`${iconClass} text-orange-500`} />
    case 'project_created':
      return <FolderPlus className={`${iconClass} text-teal-500`} />
    default:
      return null
  }
}

function CommentContent({ entry }: { entry: ActivityEntry }) {
  return (
    <div>
      <p className="text-sm whitespace-pre-wrap break-words">{entry.body}</p>
      {entry.attachment && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 w-fit">
          <Paperclip className="h-3 w-3" />
          <span className="truncate max-w-[200px]">{entry.attachment.fileName}</span>
          {entry.attachment.fileSize != null && (
            <span className="text-muted-foreground/70">({formatFileSize(entry.attachment.fileSize)})</span>
          )}
        </div>
      )}
    </div>
  )
}

function DocumentContent({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium truncate max-w-[200px]">{entry.fileName}</span>
      {entry.fileSize != null && (
        <span className="text-muted-foreground">({formatFileSize(entry.fileSize)})</span>
      )}
      {entry.fileCategory && (
        <span className="text-muted-foreground capitalize">&middot; {entry.fileCategory}</span>
      )}
    </div>
  )
}

function TrackingContent({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="text-xs">
      <span className="font-medium">{entry.eventType}</span>
      {entry.eventDescription && (
        <span className="text-muted-foreground"> &mdash; {entry.eventDescription}</span>
      )}
      {entry.locationName && (
        <span className="text-muted-foreground"> @ {entry.locationName}</span>
      )}
    </div>
  )
}

function FieldChangeContent({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="text-xs flex items-center gap-1.5 flex-wrap">
      <span className="font-medium">{entry.fieldName}</span>
      {entry.oldValue && (
        <span className="text-muted-foreground line-through">{entry.oldValue}</span>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span>{entry.newValue}</span>
    </div>
  )
}

function ProjectCreatedContent({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="text-xs">
      <span>Created project</span>
      {entry.projectReference && (
        <span className="font-medium"> {entry.projectReference}</span>
      )}
    </div>
  )
}

export function ActivityItem({ entry }: ActivityItemProps) {
  return (
    <div className="flex gap-2.5 py-2 px-3 group hover:bg-muted/30 transition-colors">
      <ActivityAvatar name={entry.actor.name} userId={entry.actor.userId} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <KindIcon kind={entry.kind} />
          <span className="text-xs font-medium truncate">{entry.actor.name}</span>
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
            {formatTime(entry.occurredAt)}
          </span>
        </div>
        {entry.kind === 'comment' && <CommentContent entry={entry} />}
        {entry.kind === 'document' && <DocumentContent entry={entry} />}
        {(entry.kind === 'tracking' || entry.kind === 'customs') && (
          <TrackingContent entry={entry} />
        )}
        {entry.kind === 'field_change' && <FieldChangeContent entry={entry} />}
        {entry.kind === 'project_created' && <ProjectCreatedContent entry={entry} />}
      </div>
    </div>
  )
}
