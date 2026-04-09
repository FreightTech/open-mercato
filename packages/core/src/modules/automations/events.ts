import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  // Definitions
  { id: 'automations.definition.created', label: 'Automation Created', entity: 'definition', category: 'crud' },
  { id: 'automations.definition.updated', label: 'Automation Updated', entity: 'definition', category: 'crud' },
  { id: 'automations.definition.deleted', label: 'Automation Deleted', entity: 'definition', category: 'crud' },

  // Run lifecycle
  { id: 'automations.run.started', label: 'Automation Run Started', category: 'lifecycle' },
  { id: 'automations.run.completed', label: 'Automation Run Completed', category: 'lifecycle' },
  { id: 'automations.run.failed', label: 'Automation Run Failed', category: 'lifecycle' },
  { id: 'automations.run.cancelled', label: 'Automation Run Cancelled', category: 'lifecycle' },

  // Node execution
  { id: 'automations.node.started', label: 'Node Execution Started', category: 'lifecycle', excludeFromTriggers: true },
  { id: 'automations.node.completed', label: 'Node Execution Completed', category: 'lifecycle', excludeFromTriggers: true },
  { id: 'automations.node.failed', label: 'Node Execution Failed', category: 'lifecycle', excludeFromTriggers: true },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'automations',
  events,
})

export const emitAutomationsEvent = eventsConfig.emit

export type AutomationsEventId = typeof events[number]['id']

export default eventsConfig
