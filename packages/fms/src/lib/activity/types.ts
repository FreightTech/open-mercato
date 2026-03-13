export type ActivityEntryKind = 'comment' | 'document' | 'tracking' | 'customs' | 'field_change' | 'project_created' | 'annotation'

export type ActivityFilter = 'all' | 'comments' | 'documents' | 'changes'

export const FILTER_TO_KINDS: Record<ActivityFilter, ActivityEntryKind[] | null> = {
  all: null, // null means no filter
  comments: ['comment', 'annotation'],
  documents: ['document'],
  changes: ['field_change', 'tracking', 'customs', 'project_created'],
}

export interface ActivityActor {
  userId?: string | null
  name: string
}

export interface ActivityAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
  url: string
}

export interface ActivityEntry {
  id: string
  kind: ActivityEntryKind
  occurredAt: string // ISO date
  title: string
  body?: string | null
  actor: ActivityActor
  attachment?: ActivityAttachment | null
  metadata?: Record<string, unknown> | null
}
