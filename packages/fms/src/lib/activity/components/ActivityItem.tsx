'use client'

import { FileText } from 'lucide-react'
import type { ActivityEntry, ActivityEntryKind } from '../types'
import { formatFileSize, camelToLabel, formatValue, shouldHideChange } from '../utils'
import { ActivityAvatar } from './ActivityAvatar'

const MENTION_PATTERN = /@\[([^\]]+)\]\(([^)]+)\)/g

function renderMentionText(content: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = new RegExp(MENTION_PATTERN.source, 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={match.index} className="font-medium text-primary">@{match[1]}</span>
    )
    lastIndex = regex.lastIndex
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}

type ActivityItemProps = {
  entry: ActivityEntry
  onDocumentClick?: (documentId: string) => void
}

const KIND_LABELS: Record<ActivityEntryKind, string> = {
  comment: 'Comment',
  document: 'Document Received',
  tracking: 'Tracking Sync',
  customs: 'Customs',
  field_change: 'Field Change',
  project_created: 'Project Created',
  annotation: 'Annotation',
}

function formatSmartTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

  if (isToday) return `Today, ${time}`
  if (isYesterday) return 'Yesterday'

  return date.toLocaleDateString([], { month: 'short', day: '2-digit' })
}

function CommentBody({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="space-y-2 mt-1">
      {entry.body && (
        <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap">{entry.body}</p>
      )}
      {entry.attachment && (
        <a
          href={entry.attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 p-2.5 bg-muted/50 rounded-lg text-sm hover:bg-muted/70 transition-colors"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded bg-muted shrink-0">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground truncate">{entry.attachment.filename}</div>
            <div className="text-xs text-muted-foreground">{formatFileSize(entry.attachment.size)}</div>
          </div>
        </a>
      )}
    </div>
  )
}

function DocumentBody({ entry, onDocumentClick }: { entry: ActivityEntry; onDocumentClick?: (documentId: string) => void }) {
  const fileName = entry.metadata?.fileName as string | undefined
  const fileSize = entry.metadata?.fileSize as number | undefined
  const category = entry.metadata?.documentCategory as string | undefined
  const documentId = entry.id.startsWith('document:') ? entry.id.slice('document:'.length) : null

  return (
    <div className="mt-1 space-y-2">
      {entry.body && <p className="text-[13px] text-foreground/90 leading-relaxed">{entry.body}</p>}
      {category && !entry.body && (
        <p className="text-[13px] text-foreground/90">{category} uploaded</p>
      )}
      {fileName && (
        <button
          type="button"
          onClick={documentId && onDocumentClick ? () => onDocumentClick(documentId) : undefined}
          className={`flex items-center gap-2.5 p-2.5 bg-muted/50 rounded-lg w-full text-left ${
            documentId && onDocumentClick ? 'cursor-pointer hover:bg-muted/70 transition-colors' : ''
          }`}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded bg-muted shrink-0">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground truncate">{fileName}</div>
            {fileSize != null && (
              <div className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</div>
            )}
          </div>
        </button>
      )}
    </div>
  )
}

function TrackingBody({ entry }: { entry: ActivityEntry }) {
  const containerNumber = entry.metadata?.containerNumber as string | undefined
  const locationName = entry.metadata?.locationName as string | undefined

  return (
    <div className="mt-1 space-y-0.5">
      {entry.body && <p className="text-[13px] text-foreground/90 leading-relaxed">{entry.body}</p>}
      {!entry.body && entry.title && <p className="text-[13px] text-foreground/90">{entry.title}</p>}
      {(containerNumber || locationName) && (
        <p className="text-xs text-muted-foreground">
          {containerNumber && <span>{containerNumber}</span>}
          {containerNumber && locationName && <span> — </span>}
          {locationName && <span>{locationName}</span>}
        </p>
      )}
    </div>
  )
}

function FieldChangeBody({ entry }: { entry: ActivityEntry }) {
  const rawChanges = entry.metadata?.changes as Array<{ field: string; from: unknown; to: unknown }> | undefined
  const changes = rawChanges?.filter((c) => !shouldHideChange(c.field, c.from, c.to))

  if (!changes || changes.length === 0) {
    return <p className="text-[13px] text-foreground/90 mt-1">{entry.title}</p>
  }

  return (
    <div className="mt-1 space-y-0.5">
      {changes.map((change, i) => (
        <div key={i} className="text-[13px]">
          <span className="text-muted-foreground">{camelToLabel(change.field)}: </span>
          {change.from != null && (
            <span className="line-through text-muted-foreground">{formatValue(change.from)}</span>
          )}
          {change.from != null && change.to != null && (
            <span className="text-muted-foreground mx-1">&rarr;</span>
          )}
          {change.to != null && <span className="text-foreground">{formatValue(change.to)}</span>}
        </div>
      ))}
    </div>
  )
}

const ANNOTATION_COLOR_MAP: Record<string, string> = {
  gray: '#e5e7eb',
  pink: '#fce7f3',
  orange: '#ffedd5',
  yellow: '#fef9c3',
  green: '#dcfce7',
  blue: '#dbeafe',
  purple: '#f3e8ff',
}

const TABLE_ID_LABELS: Record<string, string> = {
  project_highlights: 'Highlights',
  fms_projects: 'Project',
  project_parties: 'Parties',
  project_cutoffs: 'Cutoffs',
  project_sea_containers: 'Sea Containers',
  project_road_units: 'Road Units',
  project_cargo: 'Cargo',
  project_documents: 'Documents',
  transports: 'Transports',
}

function AnnotationBody({ entry }: { entry: ActivityEntry }) {
  const columnKey = entry.metadata?.columnKey as string | undefined
  const color = entry.metadata?.color as string | undefined
  const tableId = entry.metadata?.tableId as string | undefined

  return (
    <div className="mt-1 space-y-1">
      {entry.body && (
        <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {renderMentionText(entry.body)}
        </p>
      )}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {color && ANNOTATION_COLOR_MAP[color] && (
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
            style={{ backgroundColor: ANNOTATION_COLOR_MAP[color] }}
          />
        )}
        {columnKey && (
          <span>
            on <span className="font-medium">{camelToLabel(columnKey)}</span>
          </span>
        )}
        {tableId && TABLE_ID_LABELS[tableId] && (
          <span className="text-muted-foreground/70">
            in {TABLE_ID_LABELS[tableId]}
          </span>
        )}
      </div>
    </div>
  )
}

function ProjectCreatedBody({ entry }: { entry: ActivityEntry }) {
  const projectNumber = entry.metadata?.projectNumber as string | undefined
  const route = entry.metadata?.route as string | undefined

  return (
    <div className="text-[13px] mt-1">
      <span className="text-foreground font-medium">
        {projectNumber || 'Project'} created
      </span>
      {route && <span className="text-muted-foreground ml-1">({route})</span>}
    </div>
  )
}

function EntryBody({ entry, onDocumentClick }: { entry: ActivityEntry; onDocumentClick?: (documentId: string) => void }) {
  switch (entry.kind) {
    case 'comment':
      return <CommentBody entry={entry} />
    case 'document':
      return <DocumentBody entry={entry} onDocumentClick={onDocumentClick} />
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
      return entry.body ? <p className="text-[13px] text-muted-foreground mt-1">{entry.body}</p> : null
  }
}

const RESOURCE_KIND_LABELS: Record<string, string> = {
  'fms_projects.project': 'Project',
  'fms_projects.sea_container': 'Container',
  'fms_projects.road_unit': 'Road Unit',
  'fms_projects.air_unit': 'Air Unit',
  'fms_projects.project_leg': 'Leg',
  'fms_projects.project_cargo': 'Cargo',
  'fms_projects.project_invoice': 'Invoice',
}

function getFieldChangeHeader(entry: ActivityEntry): { actor: string; action: string } {
  const actorName = entry.actor.name || 'System'
  const resourceKind = entry.metadata?.resourceKind as string | undefined
  const entityLabel = resourceKind ? RESOURCE_KIND_LABELS[resourceKind] || '' : ''
  const action = entityLabel ? `updated ${entityLabel}` : 'updated'
  return { actor: actorName, action }
}

export function ActivityItem({ entry, onDocumentClick }: ActivityItemProps) {
  const isFieldChange = entry.kind === 'field_change'

  if (isFieldChange) {
    const { actor, action } = getFieldChangeHeader(entry)
    return (
      <div className="flex gap-3 py-3.5">
        <ActivityAvatar actor={entry.actor} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-foreground">{actor}</span>
            <span className="text-[13px] text-muted-foreground">{action}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatSmartTime(entry.occurredAt)}
            </span>
          </div>
          <EntryBody entry={entry} onDocumentClick={onDocumentClick} />
        </div>
      </div>
    )
  }

  const kindLabel = KIND_LABELS[entry.kind] || entry.kind
  const actorName = entry.actor.name && entry.actor.name !== 'System' && entry.actor.name !== 'Unknown'
    ? entry.actor.name
    : null

  return (
    <div className="flex gap-3 py-3.5">
      <ActivityAvatar actor={entry.actor} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {actorName ? (
            <>
              <span className="text-[13px] font-semibold text-foreground">{actorName}</span>
              <span className="text-[13px] text-muted-foreground">{kindLabel}</span>
            </>
          ) : (
            <span className="text-[13px] font-semibold text-foreground">{kindLabel}</span>
          )}
          <span className="text-xs text-muted-foreground shrink-0">
            {formatSmartTime(entry.occurredAt)}
          </span>
        </div>
        <EntryBody entry={entry} onDocumentClick={onDocumentClick} />
      </div>
    </div>
  )
}
