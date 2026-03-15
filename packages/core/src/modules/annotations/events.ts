import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  { id: 'annotations.comment.created', label: 'Annotation Comment Created', entity: 'cell_annotation', category: 'custom' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'annotations',
  events,
})

export const emitAnnotationsEvent = eventsConfig.emit

export type AnnotationsEventId = typeof events[number]['id']

export default eventsConfig
