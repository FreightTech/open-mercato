import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  Unique,
  OptionalProps,
} from '@mikro-orm/core'

@Entity({ tableName: 'fms_teams' })
@Index({ name: 'fms_teams_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'fms_teams_name_unique', properties: ['organizationId', 'tenantId', 'name'] })
export class FmsTeam {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'fms_user_teams' })
@Index({ name: 'fms_user_teams_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_user_teams_user_idx', properties: ['userId'] })
@Index({ name: 'fms_user_teams_team_idx', properties: ['teamId'] })
@Unique({ name: 'fms_user_teams_user_org_unique', properties: ['organizationId', 'userId'] })
export class FmsUserTeam {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'team_id', type: 'uuid', nullable: true })
  teamId?: string | null

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'fms_user_contractor_assignments' })
@Index({ name: 'fms_user_contractor_asgn_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_user_contractor_asgn_user_idx', properties: ['userId'] })
@Index({ name: 'fms_user_contractor_asgn_contractor_idx', properties: ['contractorId'] })
@Unique({ name: 'fms_user_contractor_asgn_unique', properties: ['organizationId', 'userId', 'contractorId'] })
export class FmsUserContractorAssignment {
  [OptionalProps]?: 'createdAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Property({ name: 'contractor_id', type: 'uuid' })
  contractorId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'fms_team_contractor_assignments' })
@Index({ name: 'fms_team_contractor_asgn_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_team_contractor_asgn_team_idx', properties: ['teamId'] })
@Index({ name: 'fms_team_contractor_asgn_contractor_idx', properties: ['contractorId'] })
@Unique({ name: 'fms_team_contractor_asgn_unique', properties: ['organizationId', 'teamId', 'contractorId'] })
export class FmsTeamContractorAssignment {
  [OptionalProps]?: 'createdAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'team_id', type: 'uuid' })
  teamId!: string

  @Property({ name: 'contractor_id', type: 'uuid' })
  contractorId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
