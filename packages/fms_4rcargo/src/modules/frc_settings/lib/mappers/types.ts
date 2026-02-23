import type { EntityManager } from '@mikro-orm/postgresql'
import type { SugarCrmRecord } from '../sugarcrm-client'

/**
 * Context passed to all mappers during sync operations
 */
export interface MapperContext {
  em: EntityManager
  organizationId: string
  tenantId: string
  /** Custom field mappings from config (SugarCRM field -> local field) */
  fieldMappings?: Record<string, string>
}

/**
 * Result of mapping a single record
 */
export interface MapperResult {
  /** Whether the mapping was successful */
  success: boolean
  /** The local entity ID (if created or updated) */
  localEntityId?: string
  /** The local entity type */
  localEntityType: string
  /** Error message if failed */
  error?: string
  /** Whether this was a create or update operation */
  operation?: 'create' | 'update' | 'skip'
}

/**
 * Base interface for all module mappers
 */
export interface ModuleMapper {
  /** SugarCRM module name this mapper handles */
  sugarCrmModule: string
  /** Local entity type this mapper creates/updates */
  localEntityType: string
  /** Default fields to request from SugarCRM */
  defaultFields: string[]

  /**
   * Map a SugarCRM record to a local entity
   */
  mapRecord(record: SugarCrmRecord, ctx: MapperContext): Promise<MapperResult>

  /**
   * Find existing local entity by SugarCRM ID
   */
  findBySugarCrmId(
    sugarCrmId: string,
    ctx: MapperContext
  ): Promise<{ id: string; dateModified?: Date } | null>
}

/**
 * Sync statistics for a module
 */
export interface ModuleSyncStats {
  moduleName: string
  targetEntity: string
  totalRecords: number
  created: number
  updated: number
  skipped: number
  errors: number
  errorMessages: string[]
}

/**
 * Overall sync result
 */
export interface SyncResult {
  success: boolean
  message: string
  startedAt: Date
  completedAt: Date
  durationMs: number
  modules: ModuleSyncStats[]
  totalRecords: number
  totalCreated: number
  totalUpdated: number
  totalSkipped: number
  totalErrors: number
}

/**
 * Helper to safely extract string value from SugarCRM record
 */
export function getString(record: SugarCrmRecord, field: string): string | null {
  const value = record[field]
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

/**
 * Helper to safely extract number value from SugarCRM record
 */
export function getNumber(record: SugarCrmRecord, field: string): number | null {
  const value = record[field]
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  return isNaN(num) ? null : num
}

/**
 * Helper to safely extract decimal/numeric value as string
 */
export function getDecimal(record: SugarCrmRecord, field: string): string | null {
  const value = record[field]
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

/**
 * Helper to safely extract date value from SugarCRM record
 */
export function getDate(record: SugarCrmRecord, field: string): Date | null {
  const value = record[field]
  if (value === undefined || value === null || value === '') return null
  const date = new Date(String(value))
  return isNaN(date.getTime()) ? null : date
}

/**
 * Helper to safely extract boolean value from SugarCRM record
 */
export function getBoolean(record: SugarCrmRecord, field: string, defaultValue = false): boolean {
  const value = record[field]
  if (value === undefined || value === null) return defaultValue
  if (typeof value === 'boolean') return value
  if (value === '1' || value === 'true' || value === 1) return true
  if (value === '0' || value === 'false' || value === 0) return false
  return defaultValue
}

/**
 * Apply custom field mappings to extract a value
 */
export function getMappedField(
  record: SugarCrmRecord,
  localField: string,
  defaultSugarField: string,
  fieldMappings?: Record<string, string>
): unknown {
  // Check if there's a custom mapping for this local field
  const sugarField = fieldMappings?.[localField] || defaultSugarField
  return record[sugarField]
}
