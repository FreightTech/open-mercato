import { Entity, PrimaryKey, Property, Index, Unique, OptionalProps } from '@mikro-orm/core'

// ============================================================================
// Type Definitions
// ============================================================================

export type AutomationRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type NodeExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'

export type NodeErrorStrategy = 'stop' | 'continue' | 'output'

// ============================================================================
// Definition JSONB Interfaces
// ============================================================================

export interface AutomationNode {
  id: string
  type: string
  name: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  disabled?: boolean
  onError?: NodeErrorStrategy
  retryPolicy?: {
    maxAttempts: number
    intervalMs: number
    backoffMultiplier: number
  }
  notes?: string
}

export interface AutomationConnection {
  id: string
  sourceNodeId: string
  sourceOutput: string
  targetNodeId: string
  targetInput: string
}

export interface AutomationDefinitionData {
  nodes: AutomationNode[]
  connections: AutomationConnection[]
}

export interface AutomationMetadata {
  tags?: string[]
  category?: string
  icon?: string
}

// ============================================================================
// Filter / Trigger Types (owned by this module)
// ============================================================================

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notIn'
  | 'exists'
  | 'notExists'
  | 'regex'

export interface FilterCondition {
  field: string
  operator: FilterOperator
  value: unknown
}

export interface ContextMapping {
  targetKey: string
  sourceExpression: string
  defaultValue?: unknown
}

// ============================================================================
// Entity: AutomationDefinition
// ============================================================================

@Entity({ tableName: 'automation_definitions' })
@Unique({ properties: ['automationId', 'tenantId'] })
@Index({ name: 'automation_definitions_enabled_idx', properties: ['enabled'] })
@Index({ name: 'automation_definitions_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class AutomationDefinition {
  [OptionalProps]?: 'enabled' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'automation_id', type: 'varchar', length: 100 })
  automationId!: string

  @Property({ name: 'name', type: 'varchar', length: 255 })
  name!: string

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'definition', type: 'jsonb' })
  definition!: AutomationDefinitionData

  @Property({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean = true

  @Property({ name: 'version', type: 'integer', default: 1 })
  version: number = 1

  @Property({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: AutomationMetadata | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_by', type: 'varchar', length: 255, nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_by', type: 'varchar', length: 255, nullable: true })
  updatedBy?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ============================================================================
// Entity: AutomationRun
// ============================================================================

@Entity({ tableName: 'automation_runs' })
@Index({ name: 'automation_runs_definition_status_idx', properties: ['definitionId', 'status'] })
@Index({ name: 'automation_runs_status_tenant_idx', properties: ['status', 'tenantId'] })
@Index({ name: 'automation_runs_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class AutomationRun {
  [OptionalProps]?: 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'definition_id', type: 'uuid' })
  definitionId!: string

  @Property({ name: 'automation_id', type: 'varchar', length: 100 })
  automationId!: string

  @Property({ name: 'status', type: 'varchar', length: 20 })
  status!: AutomationRunStatus

  @Property({ name: 'trigger_data', type: 'jsonb', nullable: true })
  triggerData?: Record<string, unknown> | null

  @Property({ name: 'context', type: 'jsonb', nullable: true })
  context?: Record<string, unknown> | null

  @Property({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null

  @Property({ name: 'error_node_id', type: 'varchar', length: 100, nullable: true })
  errorNodeId?: string | null

  @Property({ name: 'execution_time_ms', type: 'integer', nullable: true })
  executionTimeMs?: number | null

  @Property({ name: 'started_at', type: Date, nullable: true })
  startedAt?: Date | null

  @Property({ name: 'completed_at', type: Date, nullable: true })
  completedAt?: Date | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

// ============================================================================
// Entity: NodeExecution
// ============================================================================

@Entity({ tableName: 'automation_node_executions' })
@Index({ name: 'automation_node_exec_run_idx', properties: ['runId'] })
@Index({ name: 'automation_node_exec_run_node_idx', properties: ['runId', 'nodeId'] })
@Index({ name: 'automation_node_exec_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class NodeExecution {
  [OptionalProps]?: 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'run_id', type: 'uuid' })
  runId!: string

  @Property({ name: 'node_id', type: 'varchar', length: 100 })
  nodeId!: string

  @Property({ name: 'node_type', type: 'varchar', length: 50 })
  nodeType!: string

  @Property({ name: 'status', type: 'varchar', length: 20 })
  status!: NodeExecutionStatus

  @Property({ name: 'input_data', type: 'jsonb', nullable: true })
  inputData?: Record<string, unknown> | null

  @Property({ name: 'output_data', type: 'jsonb', nullable: true })
  outputData?: Record<string, unknown> | null

  @Property({ name: 'error_data', type: 'jsonb', nullable: true })
  errorData?: Record<string, unknown> | null

  @Property({ name: 'execution_time_ms', type: 'integer', nullable: true })
  executionTimeMs?: number | null

  @Property({ name: 'started_at', type: Date, nullable: true })
  startedAt?: Date | null

  @Property({ name: 'completed_at', type: Date, nullable: true })
  completedAt?: Date | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
