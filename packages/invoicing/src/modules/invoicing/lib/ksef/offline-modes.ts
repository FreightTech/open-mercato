import type { OfflineMode } from '../../data/types'

export function isOfflineMode(mode: OfflineMode): boolean {
  return mode !== 'online'
}

export function getOfflinePrefix(mode: OfflineMode): string | null {
  switch (mode) {
    case 'online':
      return null
    case 'offline24':
      return 'O24'
    case 'unavailability':
      return 'OND'
    case 'emergency':
      return 'OAW'
    default:
      return null
  }
}

export function formatOfflineInvoiceNumber(baseNumber: string, mode: OfflineMode, sequenceNumber: number): string {
  const prefix = getOfflinePrefix(mode)
  if (!prefix) {
    return baseNumber
  }

  return `${prefix}/${sequenceNumber}/${baseNumber}`
}

export function requiresOfflineAnnotation(mode: OfflineMode): boolean {
  return mode === 'offline24' || mode === 'unavailability' || mode === 'emergency'
}

export function getMaxOfflineDurationHours(mode: OfflineMode): number | null {
  switch (mode) {
    case 'offline24':
      return 24
    case 'unavailability':
      return null
    case 'emergency':
      return null
    default:
      return null
  }
}

export function isOfflinePeriodExpired(mode: OfflineMode, offlineStartedAt: Date): boolean {
  const maxHours = getMaxOfflineDurationHours(mode)
  if (maxHours === null) {
    return false
  }

  const now = new Date()
  const elapsedMs = now.getTime() - offlineStartedAt.getTime()
  const elapsedHours = elapsedMs / (1000 * 60 * 60)

  return elapsedHours > maxHours
}

export function getOfflineModeDescription(mode: OfflineMode): string {
  switch (mode) {
    case 'online':
      return 'Online - invoices submitted to KSeF in real-time'
    case 'offline24':
      return 'Offline 24h - invoices must be submitted within 24 hours'
    case 'unavailability':
      return 'KSeF unavailability - system-wide outage declared by Ministry of Finance'
    case 'emergency':
      return 'Emergency mode - extraordinary circumstances preventing KSeF access'
    default:
      return 'Unknown mode'
  }
}

export function canSwitchToOnline(mode: OfflineMode): boolean {
  return mode !== 'online'
}

export function getRequiredSubmissionDeadline(mode: OfflineMode, offlineStartedAt: Date): Date | null {
  if (mode === 'online') {
    return null
  }

  if (mode === 'offline24') {
    const deadline = new Date(offlineStartedAt)
    deadline.setHours(deadline.getHours() + 24)
    return deadline
  }

  return null
}
