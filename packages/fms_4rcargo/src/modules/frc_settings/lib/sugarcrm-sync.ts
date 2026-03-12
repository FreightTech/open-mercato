/**
 * SugarCRM Sync Service
 *
 * Orchestrates the synchronization of data from SugarCRM to 4RCargo.
 * Handles the sync order (Accounts → Contacts → Opportunities → custom modules)
 * and aggregates results.
 *
 * Note: Credentials are read from environment variables (SUGARCRM_INSTANCE_URL, etc.)
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { SugarCrmApiClient, type SugarCrmRecord } from './sugarcrm-client'
import { getSugarCrmConfig } from './sugarcrm-env'
import {
  AccountMapper,
  ContactMapper,
  OpportunityMapper,
  createCustomModuleMapper,
  TrucksMapper,
  ShipmentDetailsMapper,
  EvQuotesMapper,
  RoutingDetailsMapper,
  type ModuleMapper,
  type ModuleSyncStats,
  type SyncResult,
  type MapperContext,
} from './mappers'
import { FrcSugarCrmConfig } from '../data/entities'
import type { SugarCrmSyncModuleConfig } from '../data/validators'

/**
 * Sanitize error messages to avoid exposing internal architecture details.
 * Removes SQL queries, table names, UUIDs, and other sensitive information.
 */
function sanitizeErrorMessage(error: unknown, recordId?: string): string {
  const prefix = recordId ? `Record ${recordId.substring(0, 8)}...: ` : ''

  if (!(error instanceof Error)) {
    return `${prefix}Sync failed`
  }

  const message = error.message.toLowerCase()

  // Detect common database errors and return user-friendly messages
  if (message.includes('duplicate key') || message.includes('unique constraint')) {
    return `${prefix}Record already exists (duplicate)`
  }
  if (message.includes('foreign key') || message.includes('violates foreign key')) {
    return `${prefix}Related record not found`
  }
  if (message.includes('not null') || message.includes('null value')) {
    return `${prefix}Required field is missing`
  }
  if (message.includes('connection') || message.includes('timeout')) {
    return `${prefix}Connection error`
  }
  if (message.includes('authentication') || message.includes('unauthorized')) {
    return `${prefix}Authentication failed`
  }

  // For other errors, check if it looks like a SQL error (contains table/column names)
  if (message.includes('insert into') || message.includes('update ') || message.includes('delete from')) {
    return `${prefix}Database error`
  }

  // If it's a safe-looking message (no SQL), return a truncated version
  if (error.message.length > 100) {
    return `${prefix}${error.message.substring(0, 100)}...`
  }

  return `${prefix}${error.message}`
}

export interface SyncOptions {
  /** Only sync records modified since this date */
  since?: Date
  /** Maximum records to sync per module */
  maxRecordsPerModule?: number
  /** Specific modules to sync (if not provided, uses config) */
  modules?: string[]
}

/** Default module sync order - dependencies must come first */
const DEFAULT_SYNC_ORDER = [
  'Accounts',           // 1. Accounts → Contractor
  'Contacts',           // 2. Contacts → ContractorContact
  'Opportunities',      // 3. Opportunities → FrcRfq
  'ev_Trucks',          // 4. ev_Trucks → FrcTruck (no dependencies)
  'ev_ShipmentDetails', // 5. ev_ShipmentDetails → FrcAirCargo (needs Opportunities)
  'ev_Quotes',          // 6. ev_Quotes → FrcOffer + FrcProject (needs Opportunities, Accounts)
  'ev_RoutingDetails',  // 7. ev_RoutingDetails → FrcAirRouting (needs ev_Quotes)
]

/**
 * Main sync service for SugarCRM integration
 */
export class SugarCrmSyncService {
  private em: EntityManager
  private client: SugarCrmApiClient
  private organizationId: string
  private tenantId: string

  constructor(
    em: EntityManager,
    organizationId: string,
    tenantId: string,
    client: SugarCrmApiClient
  ) {
    this.em = em
    this.client = client
    this.organizationId = organizationId
    this.tenantId = tenantId
  }

  /**
   * Run a full sync operation
   */
  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const startedAt = new Date()
    const moduleStats: ModuleSyncStats[] = []

    let totalRecords = 0
    let totalCreated = 0
    let totalUpdated = 0
    let totalSkipped = 0
    let totalErrors = 0

    try {
      // Get the list of modules to sync
      const modulesToSync = this.getModulesToSync(options.modules)

      // Create mapper context
      const ctx: MapperContext = {
        em: this.em,
        organizationId: this.organizationId,
        tenantId: this.tenantId,
      }

      // Sync each module in order
      for (const moduleConfig of modulesToSync) {
        const mapper = this.getMapperForModule(moduleConfig)
        if (!mapper) {
          console.warn(`No mapper found for module: ${moduleConfig.moduleName}`)
          continue
        }

        const stats = await this.syncModule(mapper, moduleConfig, ctx, options)
        moduleStats.push(stats)

        totalRecords += stats.totalRecords
        totalCreated += stats.created
        totalUpdated += stats.updated
        totalSkipped += stats.skipped
        totalErrors += stats.errors
      }

      const completedAt = new Date()

      return {
        success: totalErrors === 0,
        message: totalErrors > 0 
          ? `Sync completed with ${totalErrors} errors`
          : `Sync completed successfully`,
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        modules: moduleStats,
        totalRecords,
        totalCreated,
        totalUpdated,
        totalSkipped,
        totalErrors,
      }
    } catch (error) {
      const completedAt = new Date()

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Sync failed with unknown error',
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        modules: moduleStats,
        totalRecords,
        totalCreated,
        totalUpdated,
        totalSkipped,
        totalErrors: totalErrors + 1,
      }
    }
  }

  /**
   * Get the ordered list of modules to sync
   */
  private getModulesToSync(requestedModules?: string[]): SugarCrmSyncModuleConfig[] {
    // Default built-in modules (hardcoded - no DB config for this temporary integration)
    const builtInModules: SugarCrmSyncModuleConfig[] = DEFAULT_SYNC_ORDER.map((moduleName) => ({
      moduleName,
      enabled: true,
      targetEntity: this.getDefaultTargetEntity(moduleName),
    }))

    // Filter to only enabled modules
    let modules = builtInModules.filter((m) => m.enabled)

    // Filter by requested modules if specified
    if (requestedModules && requestedModules.length > 0) {
      modules = modules.filter((m) => requestedModules.includes(m.moduleName))
    }

    // Sort by dependency order
    modules.sort((a, b) => {
      const orderA = DEFAULT_SYNC_ORDER.indexOf(a.moduleName)
      const orderB = DEFAULT_SYNC_ORDER.indexOf(b.moduleName)
      // Built-in modules first, then custom modules
      if (orderA === -1 && orderB === -1) return 0
      if (orderA === -1) return 1
      if (orderB === -1) return -1
      return orderA - orderB
    })

    return modules
  }

  /**
   * Get the default target entity for a built-in module
   */
  private getDefaultTargetEntity(moduleName: string): string {
    const map: Record<string, string> = {
      Accounts: 'Contractor',
      Contacts: 'ContractorContact',
      Opportunities: 'FrcRfq',
      ev_Trucks: 'FrcTruck',
      ev_ShipmentDetails: 'FrcAirCargo',
      ev_Quotes: 'FrcOffer',
      ev_RoutingDetails: 'FrcAirRouting',
    }
    return map[moduleName] || 'Unknown'
  }

  /**
   * Get the appropriate mapper for a module
   */
  private getMapperForModule(config: SugarCrmSyncModuleConfig): ModuleMapper | null {
    switch (config.moduleName) {
      // Built-in SugarCRM modules
      case 'Accounts':
        return new AccountMapper()
      case 'Contacts':
        return new ContactMapper()
      case 'Opportunities':
        return new OpportunityMapper()

      // Custom SugarCRM modules (ev_*)
      case 'ev_Trucks':
        return new TrucksMapper()
      case 'ev_ShipmentDetails':
        return new ShipmentDetailsMapper()
      case 'ev_Quotes':
        return new EvQuotesMapper()
      case 'ev_RoutingDetails':
        return new RoutingDetailsMapper()

      default:
        // Generic custom module - use configurable mapper
        if (config.targetEntity === 'FrcProject' || config.targetEntity === 'FrcOffer') {
          return createCustomModuleMapper(config)
        }
        return null
    }
  }

  /**
   * Sync a single module
   */
  private async syncModule(
    mapper: ModuleMapper,
    config: SugarCrmSyncModuleConfig,
    ctx: MapperContext,
    options: SyncOptions
  ): Promise<ModuleSyncStats> {
    const stats: ModuleSyncStats = {
      moduleName: config.moduleName,
      targetEntity: config.targetEntity,
      totalRecords: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorMessages: [],
    }

    try {
      // Fetch records from SugarCRM
      let records: SugarCrmRecord[]

      if (options.since) {
        records = await this.client.getModifiedRecords(config.moduleName, options.since, {
          fields: mapper.defaultFields,
          maxNum: options.maxRecordsPerModule,
        })
      } else {
        records = await this.client.getAllRecords(config.moduleName, {
          fields: mapper.defaultFields,
          maxRecords: options.maxRecordsPerModule || 10000,
        })
      }

      stats.totalRecords = records.length

      // Process each record
      for (const record of records) {
        // Add custom field mappings to context
        const recordCtx: MapperContext = {
          ...ctx,
          fieldMappings: config.fieldMappings,
        }

        const result = await mapper.mapRecord(record, recordCtx)

        if (result.success) {
          switch (result.operation) {
            case 'create':
              stats.created++
              break
            case 'update':
              stats.updated++
              break
            case 'skip':
              stats.skipped++
              break
          }
        } else {
          stats.errors++
          if (result.error) {
            // Sanitize error messages to avoid exposing internal details
            stats.errorMessages.push(sanitizeErrorMessage(new Error(result.error), record.id))
          }
        }
      }
    } catch (error) {
      stats.errors++
      stats.errorMessages.push(sanitizeErrorMessage(error))
    }

    return stats
  }
}

/**
 * Helper to update sync status using nativeUpdate
 * This bypasses MikroORM's identity map to avoid INSERT vs UPDATE confusion
 */
async function updateSyncStatus(
  em: EntityManager,
  organizationId: string,
  tenantId: string,
  status: {
    lastSyncAt: Date
    lastSyncStatus: 'success' | 'error'
    lastSyncMessage: string
  }
): Promise<void> {
  // Use nativeUpdate to bypass identity map issues
  // This directly executes an UPDATE query without loading the entity
  await em.nativeUpdate(
    FrcSugarCrmConfig,
    { organizationId, tenantId },
    {
      lastSyncAt: status.lastSyncAt,
      lastSyncStatus: status.lastSyncStatus,
      lastSyncMessage: status.lastSyncMessage,
    }
  )
}

/**
 * Create and run a sync operation
 */
export async function runSugarCrmSync(
  em: EntityManager,
  organizationId: string,
  tenantId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  // Get credentials from environment variables
  const envConfig = getSugarCrmConfig()

  if (!envConfig) {
    throw new Error('SugarCRM credentials are not configured. Please set SUGARCRM_INSTANCE_URL, SUGARCRM_USERNAME, and SUGARCRM_PASSWORD environment variables.')
  }

  // Load per-tenant config (for isEnabled check)
  // Use a forked EM to avoid polluting the main EM's identity map
  const checkEm = em.fork({ clear: true })
  let config = await checkEm.findOne(FrcSugarCrmConfig, {
    organizationId,
    tenantId,
  })

  if (!config) {
    // Create config if it doesn't exist
    config = checkEm.create(FrcSugarCrmConfig, {
      organizationId,
      tenantId,
      isEnabled: true,
    })
    checkEm.persist(config)
    await checkEm.flush()
  }

  if (!config.isEnabled) {
    throw new Error('SugarCRM integration is not enabled for this tenant')
  }

  // Create API client using env credentials
  const client = new SugarCrmApiClient({
    instanceUrl: envConfig.instanceUrl,
    username: envConfig.username,
    password: envConfig.password,
    platform: envConfig.platform,
  })

  // Create a fresh forked EM for sync operations to keep them isolated
  const syncEm = em.fork({ clear: true })
  const syncService = new SugarCrmSyncService(syncEm, organizationId, tenantId, client)

  try {
    const result = await syncService.sync(options)

    // Update config with sync status using separate EM
    await updateSyncStatus(em, organizationId, tenantId, {
      lastSyncAt: result.completedAt,
      lastSyncStatus: result.success ? 'success' : 'error',
      lastSyncMessage: result.message,
    })

    // Logout from SugarCRM
    await client.logout()

    return result
  } catch (error) {
    // Update config with error using separate EM
    await updateSyncStatus(em, organizationId, tenantId, {
      lastSyncAt: new Date(),
      lastSyncStatus: 'error',
      lastSyncMessage: error instanceof Error ? error.message : 'Unknown error',
    })

    await client.logout().catch(() => {})

    throw error
  }
}
