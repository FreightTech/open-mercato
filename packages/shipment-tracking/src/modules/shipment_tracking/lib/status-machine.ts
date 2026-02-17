import type { ShipmentStatusEnum, TrackingEventClassifierCode } from '../data/entities'

export type ShipmentStatus = ShipmentStatusEnum

type EventInput = {
  eventCode: string
  eventClassifierCode?: TrackingEventClassifierCode | null
  locationUnlocode?: string | null
}

type ShipmentContext = {
  originUnlocode?: string | null
  destinationUnlocode?: string | null
}

const STATUS_ORDER: ShipmentStatus[] = [
  'PENDING',
  'BOOKED',
  'DEPARTED',
  'IN_TRANSIT',
  'ARRIVED',
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
  const classifierCode = event.eventClassifierCode

  // DEPA at origin = DEPARTED
  if (code === 'DEPA') {
    if (classifierCode === 'ACT') {
      return 'DEPARTED'
    }
    if (classifierCode === 'PLN' || classifierCode === 'EST') {
      return 'BOOKED'
    }
  }

  // ARRI at destination = ARRIVED (actual) or IN_TRANSIT (planned/estimated approaching)
  if (code === 'ARRI' && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classifierCode === 'ACT') {
      return 'ARRIVED'
    }
    return 'IN_TRANSIT'
  }

  // ARRI at non-destination with actual = IN_TRANSIT (transshipment)
  if (code === 'ARRI' && classifierCode === 'ACT') {
    return 'IN_TRANSIT'
  }

  // DISC (discharge) at destination = ARRIVED
  if (code === 'DISC' && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classifierCode === 'ACT') {
      return 'ARRIVED'
    }
  }

  // LOAD at origin = BOOKED (loaded onto vessel)
  if (code === 'LOAD' && isAtOrigin(event.locationUnlocode, context.originUnlocode)) {
    if (classifierCode === 'ACT') {
      return 'BOOKED'
    }
  }

  // Gate out at destination = DELIVERED (GTOT = Gate Out Terminal, PICK = Pick-up)
  if ((code === 'GTOT' || code === 'PICK') && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classifierCode === 'ACT') {
      return 'DELIVERED'
    }
  }

  // Gate in at destination = DELIVERED (empty return means cargo was delivered)
  if (code === 'GTIN' && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classifierCode === 'ACT') {
      return 'DELIVERED'
    }
  }

  // Available for pick-up at destination = ARRIVED
  if (code === 'AVPU' && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classifierCode === 'ACT') {
      return 'ARRIVED'
    }
  }

  // Customs released at destination = ARRIVED
  if (code === 'CUSR' && isAtDestination(event.locationUnlocode, context.destinationUnlocode)) {
    if (classifierCode === 'ACT') {
      return 'ARRIVED'
    }
  }

  // Delivery event = DELIVERED
  if (code === 'DLVR' && classifierCode === 'ACT') {
    return 'DELIVERED'
  }

  return null
}

/**
 * Derives the highest-priority shipment status from a set of tracking events.
 * Status only moves forward (never downgrades), based on DCSA event codes.
 */
export function deriveShipmentStatus(
  events: EventInput[],
  context: ShipmentContext,
  currentStatus: ShipmentStatus = 'PENDING',
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
