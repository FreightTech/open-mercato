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

  /** Reference to FrcOffer (cross-module, no ORM relation) */
  @Property({ name: 'offer_id', type: 'uuid', nullable: true })
  offerId?: string | null

  /** Contractor ID (customer/account) - references contractors module */
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

@Entity({ tableName: 'frc_project_air_cargo' })
@Index({ name: 'frc_project_air_cargo_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_project_air_cargo_project_idx', properties: ['projectId'] })
@Index({ name: 'frc_project_air_cargo_cargo_idx', properties: ['airCargoId'] })
export class FrcProjectAirCargo {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Reference to FrcProject */
  @Property({ name: 'project_id', type: 'uuid' })
  projectId!: string

  /** Reference to FrcAirCargo */
  @Property({ name: 'air_cargo_id', type: 'uuid' })
  airCargoId!: string

  /** Quantity assigned to this project (can be partial) */
  @Property({ type: 'integer', default: 1 })
  quantity: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
