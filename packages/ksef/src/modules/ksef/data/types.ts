export type KsefSubmissionStatus =
  | 'none'
  | 'queued'
  | 'submitted'
  | 'processing'
  | 'accepted'
  | 'upo_downloaded'
  | 'rejected'
  | 'error'
  | 'cancelled'

export type KsefSessionType = 'interactive' | 'batch'

export type KsefSessionStatus =
  | 'initializing'
  | 'active'
  | 'closing'
  | 'closed'
  | 'error'

export type KsefAuthType = 'token' | 'certificate'

export type KsefEnvironment = 'test' | 'demo' | 'production'

export type KsefSessionMode = 'interactive' | 'batch'

export type OfflineMode = 'online' | 'offline24' | 'unavailability' | 'emergency'
