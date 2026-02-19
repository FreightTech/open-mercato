import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * FRC Trucks Module Events
 *
 * Declares all events that can be emitted by the frc_trucks module.
 */
const events = [
  // Trucks
  { id: 'frc_trucks.truck.created', label: 'Truck Created', entity: 'truck', category: 'crud' },
  { id: 'frc_trucks.truck.updated', label: 'Truck Updated', entity: 'truck', category: 'crud' },
  { id: 'frc_trucks.truck.deleted', label: 'Truck Deleted', entity: 'truck', category: 'crud' },

  // Truck Presets
  { id: 'frc_trucks.preset.created', label: 'Truck Preset Created', entity: 'preset', category: 'crud' },
  { id: 'frc_trucks.preset.updated', label: 'Truck Preset Updated', entity: 'preset', category: 'crud' },
  { id: 'frc_trucks.preset.deleted', label: 'Truck Preset Deleted', entity: 'preset', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'frc_trucks',
  events,
})

/** Type-safe event emitter for frc_trucks module */
export const emitFrcTrucksEvent = eventsConfig.emit

/** Event IDs that can be emitted by the frc_trucks module */
export type FrcTrucksEventId = typeof events[number]['id']

export default eventsConfig
