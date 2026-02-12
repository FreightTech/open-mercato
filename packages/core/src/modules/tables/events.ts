import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  { id: 'tables.definition.created', label: 'Table Definition Created', entity: 'table_definition', category: 'crud' },
  { id: 'tables.definition.updated', label: 'Table Definition Updated', entity: 'table_definition', category: 'crud' },
  { id: 'tables.definition.deleted', label: 'Table Definition Deleted', entity: 'table_definition', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'tables',
  events,
})

export const emitTablesEvent = eventsConfig.emit

export type TablesEventId = typeof events[number]['id']

export default eventsConfig
