export type ActivityEntryKind =
  | 'comment'
  | 'document'
  | 'tracking'
  | 'customs'
  | 'field_change'
  | 'project_created'

export type ActivityFilter = 'all' | 'comments' | 'documents' | 'changes'

export const FILTER_TO_KINDS: Record<ActivityFilter, ActivityEntryKind[] | null> = {
  all: null,
  comments: ['comment'],
  documents: ['document'],
  changes: ['tracking', 'customs', 'field_change', 'project_created'],
}

export interface ActivityActor {
  userId?: string | null
  name: string
}

export interface ActivityAttachment {
  id: string
  fileName: string
  fileSize?: number | null
  mimeType?: string | null
  url?: string | null
}

export interface ActivityEntry {
  id: string
  kind: ActivityEntryKind
  occurredAt: string
  actor: ActivityActor

  body?: string | null
  attachment?: ActivityAttachment | null

  fileName?: string | null
  fileSize?: number | null
  fileCategory?: string | null

  eventType?: string | null
  eventDescription?: string | null
  locationName?: string | null

  fieldName?: string | null
  oldValue?: string | null
  newValue?: string | null

  projectReference?: string | null
  projectId?: string | null
}
