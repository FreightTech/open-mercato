type KsefResolvedStatus = 'pending' | 'accepted' | 'rejected' | 'error' | 'session_active' | 'session_closed' | 'unknown'

interface KsefProcessingCodeEntry {
  status: KsefResolvedStatus
  description: string
}

export const KSEF_PROCESSING_CODES: Record<number, KsefProcessingCodeEntry> = {
  100: { status: 'pending', description: 'Processing started' },
  101: { status: 'pending', description: 'Waiting for processing' },
  102: { status: 'pending', description: 'Processing in progress' },
  200: { status: 'accepted', description: 'Invoice accepted' },
  300: { status: 'rejected', description: 'Invoice rejected' },
  301: { status: 'rejected', description: 'Schema validation failed' },
  302: { status: 'rejected', description: 'Business validation failed' },
  303: { status: 'rejected', description: 'Duplicate invoice detected' },
  310: { status: 'session_active', description: 'Session is active' },
  315: { status: 'session_closed', description: 'Session closed, UPO available' },
  400: { status: 'error', description: 'Processing error' },
  401: { status: 'error', description: 'Authentication error' },
  402: { status: 'error', description: 'Authorization error' },
  403: { status: 'error', description: 'Session expired' },
  404: { status: 'error', description: 'Resource not found' },
  500: { status: 'error', description: 'Internal server error' },
} as const

export function resolveKsefStatus(processingCode: number): KsefResolvedStatus {
  const entry = KSEF_PROCESSING_CODES[processingCode]
  if (entry) {
    return entry.status
  }

  if (processingCode >= 100 && processingCode < 200) {
    return 'pending'
  }
  if (processingCode >= 200 && processingCode < 300) {
    return 'accepted'
  }
  if (processingCode >= 300 && processingCode < 400) {
    return 'rejected'
  }
  if (processingCode >= 400) {
    return 'error'
  }

  return 'unknown'
}

export function isTerminalStatus(processingCode: number): boolean {
  return processingCode >= 200 && processingCode < 400
}

export function isSuccessStatus(processingCode: number): boolean {
  return processingCode >= 200 && processingCode < 300
}

export function isErrorStatus(processingCode: number): boolean {
  return processingCode >= 400
}

export function getProcessingDescription(processingCode: number): string {
  const entry = KSEF_PROCESSING_CODES[processingCode]
  return entry?.description ?? `Unknown processing code: ${processingCode}`
}
