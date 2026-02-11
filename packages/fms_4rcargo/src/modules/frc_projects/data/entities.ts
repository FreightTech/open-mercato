import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core'
import type { FrcProjectStatus } from '../../../lib/types'

@Entity({ tableName: 'frc_projects' })
@Index({ name: 'frc_projects_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_projects_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'frc_projects_account_idx', properties: ['organizationId', 'tenantId', 'accountId'] })
export class FrcProject {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Auto-generated unique project number */
  @Property({ name: 'project_number', type: 'text', length: 50 })
  projectNumber!: string

  /** Reference to FrcRfq (cross-module, no ORM relation) */
  @Property({ name: 'rfq_id', type: 'uuid', nullable: true })
  rfqId?: string | null

  /** Reference to FrcQuote (cross-module, no ORM relation) */
  @Property({ name: 'quote_id', type: 'uuid', nullable: true })
  quoteId?: string | null

  /** Contractor ID (customer/account) */
  @Property({ name: 'account_id', type: 'uuid', nullable: true })
  accountId?: string | null

  @Property({ type: 'text', default: 'active' })
  status: FrcProjectStatus = 'active'

  @Property({ name: 'total_value', type: 'numeric', precision: 18, scale: 4, nullable: true })
  totalValue?: string | null

  @Property({ name: 'currency_code', type: 'text', length: 3, default: 'EUR' })
  currencyCode: string = 'EUR'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
