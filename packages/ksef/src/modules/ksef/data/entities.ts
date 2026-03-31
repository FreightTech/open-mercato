import {
  Entity,
  Index,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'
import type {
  KsefSubmissionStatus,
  KsefSessionType,
  KsefSessionStatus,
  OfflineMode,
} from './types'

// ========================================
// KsefSubmission
// ========================================

@Entity({ tableName: 'ksef_submissions' })
@Index({ name: 'ksef_submissions_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'ksef_submissions_invoice_idx', properties: ['invoiceId'] })
@Index({ name: 'ksef_submissions_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
export class KsefSubmission {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'status'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // Link to invoice (by ID — no ORM relationship, cross-module)
  @Property({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string

  // -- KSeF state --

  @Property({ type: 'text', default: 'none' })
  status: KsefSubmissionStatus = 'none'

  @Property({ name: 'ksef_number', type: 'text', nullable: true })
  @Index({ name: 'ksef_submissions_ksef_number_idx' })
  @Unique({ name: 'ksef_submissions_ksef_number_uniq' })
  ksefNumber?: string | null

  @Property({ name: 'ksef_reference_number', type: 'text', nullable: true })
  ksefReferenceNumber?: string | null

  @Property({ name: 'ksef_session_id', type: 'uuid', nullable: true })
  ksefSessionId?: string | null

  @Property({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date | null

  @Property({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date | null

  // -- XML storage --

  @Property({ name: 'fa_xml', type: 'text', nullable: true })
  faXml?: string | null

  @Property({ name: 'upo_xml', type: 'text', nullable: true })
  upoXml?: string | null

  // -- Error state --

  @Property({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null

  @Property({ name: 'error_code', type: 'text', nullable: true })
  errorCode?: string | null

  // -- Offline mode --

  @Property({ name: 'offline_mode', type: 'text', nullable: true })
  offlineMode?: OfflineMode | null

  @Property({ name: 'offline_qr_data', type: 'text', nullable: true })
  offlineQrData?: string | null

  // -- Audit --

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// KsefSession
// ========================================

@Entity({ tableName: 'ksef_sessions' })
@Index({ name: 'ksef_sessions_scope_idx', properties: ['organizationId', 'tenantId'] })
export class KsefSession {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'sessionStatus'
    | 'invoiceCount'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'session_type', type: 'text' })
  sessionType!: KsefSessionType

  @Property({ name: 'session_status', type: 'text', default: 'initializing' })
  sessionStatus: KsefSessionStatus = 'initializing'

  @Property({ name: 'ksef_reference_number', type: 'text', nullable: true })
  ksefReferenceNumber?: string | null

  @Property({ name: 'session_token', type: 'text', nullable: true })
  sessionToken?: string | null

  @Property({ name: 'encryption_key', type: 'text', nullable: true })
  encryptionKey?: string | null

  @Property({ name: 'encryption_iv', type: 'text', nullable: true })
  encryptionIv?: string | null

  @Property({ type: 'text' })
  nip!: string

  @Property({ name: 'invoice_count', type: 'int', default: 0 })
  invoiceCount: number = 0

  @Property({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null

  @Property({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt?: Date | null

  @Property({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null

  @Property({ name: 'upo_xml', type: 'text', nullable: true })
  upoXml?: string | null

  @Property({ name: 'upo_downloaded_at', type: 'timestamptz', nullable: true })
  upoDownloadedAt?: Date | null

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
