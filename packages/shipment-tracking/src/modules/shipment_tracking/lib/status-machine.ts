import type { ShipmentStatusEnum, CargoEventClassification } from '../data/entities'

export type ShipmentStatus = ShipmentStatusEnum

type EventInput = {
  eventCode: string
  eventClassification?: CargoEventClassification | null
  locationUnlocode?: string | null
}

type ShipmentContext = {
  originUnlocode?: string | null
  destinationUnlocode?: string | null
}

const STATUS_ORDER: ShipmentStatus[] = [
  'ORDERED',
  'BOOKED',
  'DEPARTED',
  'PRE_ARRIVAL',
  'IN_PORT',
  'DELIVERED',
]

function statusRank(status: ShipmentStatus): number {
  return STATUS_ORDER.indexOf(status)
}

function isAtDestination(eventLocation: string | null | undefined, destination: string | null | undefined): boolean {
  if (!eventLocation || !destination) return false
  return eventLocation.toUpperCase() === destination.toUpperCase()
}

function isAtOrigin(eventLocation: string | null | undefined, origin: string | null | undefined): boolean {
  if (!eventLocation || !origin) return false
  return eventLocation.toUpperCase() === origin.toUpperCase()
}

function deriveStatusFromEvent(event: EventInput, context: ShipmentContext): ShipmentStatus | null {
  const code = event.eventCode.toUpperCase()
  const classification = event.eventClassification

  // DEPA at origin = DEPARTED
  if (code === 'DEPA') {
    if (classification === 'ACT') {
      return 'DEPARTED'
    }
    if (classification === 'PLN' || classification === 'EST') {
      return 'BOOKED'
    }
  }

  // ARRI at destination = IN_PORT (actual) or PRE_ARRIVAL (planned/estimated)
  if (code === 'ARRI' && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classification === 'ACT') {
      return 'IN_PORT'
    }
    return 'PRE_ARRIVAL'
  }

  // ARRI at non-destination with actual = still DEPARTED (transshipment)
  if (code === 'ARRI' && classification === 'ACT') {
    return 'DEPARTED'
  }

  // DISC (discharge) at destination = IN_PORT
  if (code === 'DISC' && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classification === 'ACT') {
      return 'IN_PORT'
    }
  }

  // LOAD at origin = BOOKED (loaded onto vessel)
  if (code === 'LOAD' && isAtOrigin(event.locationUnlocode, context.originUnlocode)) {
    if (classification === 'ACT') {
      return 'BOOKED'
    }
  }

  // Gate out at destination = DELIVERED
  if (code === 'GOUT' && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classification === 'ACT') {
      return 'DELIVERED'
    }
  }

  // Delivery event = DELIVERED
  if (code === 'DLVR' && classification === 'ACT') {
    return 'DELIVERED'
  }

  return null
}

/**
 * Derives the highest-priority shipment status from a set of cargo events.
 * Status only moves forward (never downgrades), based on DCSA event codes.
 */
export function deriveShipmentStatus(
  events: EventInput[],
  context: ShipmentContext,
  currentStatus: ShipmentStatus = 'ORDERED',
): ShipmentStatus {
  let best = currentStatus

  for (const event of events) {
    const derived = deriveStatusFromEvent(event, context)
    if (derived && statusRank(derived) > statusRank(best)) {
      best = derived
    }
  }

  return best
}
