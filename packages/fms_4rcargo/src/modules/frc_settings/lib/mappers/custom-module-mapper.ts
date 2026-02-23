/**
 * Custom Module Mapper - Generic mapper for custom SugarCRM modules
 *
 * This mapper handles custom SugarCRM modules (Shipments, Quotes, etc.)
 * by using configurable field mappings.
 *
 * Since custom module names and field names vary per SugarCRM instance,
 * this mapper relies on configuration to determine the mapping.
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getDecimal, getDate, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'
import type { SugarCrmSyncModuleConfig } from '../../data/validators'
import { FrcProject } from '../../../frc_projects/data/entities'
import { FrcOffer } from '../../../frc_offers/data/entities'
import type { FrcProjectStatus, FrcOfferStatus } from '../../../../lib/types'

/**
 * Creates a mapper for a custom SugarCRM module based on configuration
 */
export function createCustomModuleMapper(config: SugarCrmSyncModuleConfig): ModuleMapper {
  switch (config.targetEntity) {
    case 'FrcProject':
      return new ShipmentToProjectMapper(config)
    case 'FrcOffer':
      return new QuoteToOfferMapper(config)
    default:
      throw new Error(`Unknown target entity: ${config.targetEntity}`)
  }
}

/**
 * Shipment Mapper - Custom Shipments module → FrcProject
 */
export class ShipmentToProjectMapper implements ModuleMapper {
  sugarCrmModule: string
  localEntityType = 'FrcProject'
  defaultFields: string[]
  private config: SugarCrmSyncModuleConfig

  constructor(config: SugarCrmSyncModuleConfig) {
    this.config = config
    this.sugarCrmModule = config.moduleName

    // Default fields, can be overridden by config
    this.defaultFields = [
      'id',
      'name',
      'date_modified',
      'deleted',
      'status',
      'account_id',
      'awb_number',
      'ship_date',
      'delivery_date',
      'total_value',
      'currency_id',
      'origin',
      'destination',
      'description',
    ]
  }

  async mapRecord(record: SugarCrmRecord, ctx: MapperContext): Promise<MapperResult> {
    const { em, organizationId, tenantId } = ctx
    const fieldMappings = this.config.fieldMappings || {}

    try {
      if (getBoolean(record, 'deleted')) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
        }
      }

      const sugarCrmId = getString(record, 'id')
      if (!sugarCrmId) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Record has no ID',
        }
      }

      const name = getString(record, fieldMappings['name'] || 'name')
      if (!name) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Shipment has no name',
        }
      }

      // Check existing sync
      const existingSync = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
      })

      // Find linked Contractor
      let accountId: string | null = null
      const sugarAccountId = getString(record, fieldMappings['accountId'] || 'account_id')
      if (sugarAccountId) {
        const accountSync = await em.findOne(FrcSugarCrmMapping, {
          organizationId,
          tenantId,
          sugarCrmModule: 'Accounts',
          sugarCrmRecordId: sugarAccountId,
        })
        if (accountSync) {
          accountId = accountSync.localEntityId
        }
      }

      // Generate project number
      const projectNumber = `SUGAR-${sugarCrmId.substring(0, 8).toUpperCase()}`

      // Default values for creation
      const createDefaults = {
        organizationId,
        tenantId,
        projectNumber,
        accountId,
        status: 'active' as FrcProjectStatus,
        currencyCode: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      let project: FrcProject | null = null
      let operation: 'create' | 'update' = 'create'

      if (existingSync) {
        project = await em.findOne(FrcProject, {
          id: existingSync.localEntityId,
          organizationId,
          tenantId,
        })

        if (!project) {
          project = em.create(FrcProject, createDefaults)
          em.persist(project)
        } else {
          operation = 'update'
        }
      } else {
        // Check by project number
        project = await em.findOne(FrcProject, {
          organizationId,
          tenantId,
          projectNumber,
        })

        if (project) {
          operation = 'update'
        } else {
          project = em.create(FrcProject, createDefaults)
          em.persist(project)
        }
      }

      if (!project) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find project',
        }
      }

      // Map fields
      project.accountId = accountId

      // Map status
      const status = getString(record, fieldMappings['status'] || 'status')
      if (status) {
        // Map common status values
        const statusMap: Record<string, FrcProjectStatus> = {
          active: 'active',
          completed: 'completed',
          cancelled: 'cancelled',
          in_progress: 'active',
          done: 'completed',
          closed: 'completed',
        }
        project.status = statusMap[status.toLowerCase()] || 'active'
      }

      // Map AWB
      const awb = getString(record, fieldMappings['awbNumbers'] || 'awb_number')
      if (awb) {
        project.awbNumbers = [awb]
      }

      // Map dates
      const shipDate = getDate(record, fieldMappings['shipmentReadyDate'] || 'ship_date')
      if (shipDate) {
        project.shipmentReadyDate = shipDate
      }

      const deliveryDate = getDate(record, fieldMappings['requiredDeliveryDate'] || 'delivery_date')
      if (deliveryDate) {
        project.requiredDeliveryDate = deliveryDate
      }

      // Map value
      const totalValue = getDecimal(record, fieldMappings['totalValue'] || 'total_value')
      if (totalValue) {
        project.totalValue = totalValue
      }

      // Map notes
      const notes = getString(record, fieldMappings['notes'] || 'description')
      if (notes) {
        project.notes = notes
      }

      await em.flush()

      // Create or update mapping record
      if (existingSync) {
        existingSync.lastSyncAt = new Date()
      } else {
        const mapping = em.create(FrcSugarCrmMapping, {
          organizationId,
          tenantId,
          sugarCrmModule: this.sugarCrmModule,
          sugarCrmRecordId: sugarCrmId,
          localEntityType: this.localEntityType,
          localEntityId: project.id,
          lastSyncAt: new Date(),
        })
        em.persist(mapping)
      }

      await em.flush()

      return {
        success: true,
        localEntityId: project.id,
        localEntityType: this.localEntityType,
        operation,
      }
    } catch (error) {
      return {
        success: false,
        localEntityType: this.localEntityType,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async findBySugarCrmId(
    sugarCrmId: string,
    ctx: MapperContext
  ): Promise<{ id: string; dateModified?: Date } | null> {
    const { em, organizationId, tenantId } = ctx

    const mapping = await em.findOne(FrcSugarCrmMapping, {
      organizationId,
      tenantId,
      sugarCrmModule: this.sugarCrmModule,
      sugarCrmRecordId: sugarCrmId,
    })

    if (!mapping) return null

    return {
      id: mapping.localEntityId,
      dateModified: mapping.lastSyncAt ?? undefined,
    }
  }
}

/**
 * Quote Mapper - Custom Quotes module → FrcOffer
 */
export class QuoteToOfferMapper implements ModuleMapper {
  sugarCrmModule: string
  localEntityType = 'FrcOffer'
  defaultFields: string[]
  private config: SugarCrmSyncModuleConfig

  constructor(config: SugarCrmSyncModuleConfig) {
    this.config = config
    this.sugarCrmModule = config.moduleName

    this.defaultFields = [
      'id',
      'name',
      'date_modified',
      'deleted',
      'status',
      'opportunity_id',
      'total',
      'currency_id',
      'valid_until',
      'description',
    ]
  }

  async mapRecord(record: SugarCrmRecord, ctx: MapperContext): Promise<MapperResult> {
    const { em, organizationId, tenantId } = ctx
    const fieldMappings = this.config.fieldMappings || {}

    try {
      if (getBoolean(record, 'deleted')) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
        }
      }

      const sugarCrmId = getString(record, 'id')
      if (!sugarCrmId) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Record has no ID',
        }
      }

      // Quote must be linked to an opportunity (which maps to RFQ)
      const opportunityId = getString(record, fieldMappings['rfqId'] || 'opportunity_id')
      if (!opportunityId) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: 'Quote has no linked opportunity',
        }
      }

      // Find linked RFQ
      const rfqSync = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: 'Opportunities',
        sugarCrmRecordId: opportunityId,
      })

      if (!rfqSync) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: `Parent opportunity ${opportunityId} not yet synced`,
        }
      }

      const existingSync = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
      })

      const name = getString(record, fieldMappings['name'] || 'name') || `Quote-${sugarCrmId.substring(0, 8)}`

      // Default values for creation
      const createDefaults = {
        organizationId,
        tenantId,
        rfqId: rfqSync.localEntityId,
        name,
        status: 'draft' as FrcOfferStatus,
        currencyCode: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      let offer: FrcOffer | null = null
      let operation: 'create' | 'update' = 'create'

      if (existingSync) {
        offer = await em.findOne(FrcOffer, {
          id: existingSync.localEntityId,
          organizationId,
          tenantId,
        })

        if (!offer) {
          offer = em.create(FrcOffer, createDefaults)
          em.persist(offer)
        } else {
          operation = 'update'
        }
      } else {
        offer = em.create(FrcOffer, createDefaults)
        em.persist(offer)
      }

      if (!offer) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find offer',
        }
      }

      // Map fields
      offer.name = name
      offer.rfqId = rfqSync.localEntityId

      // Map status
      const status = getString(record, fieldMappings['status'] || 'status')
      if (status) {
        const statusMap: Record<string, FrcOfferStatus> = {
          draft: 'draft',
          sent: 'sent',
          accepted: 'booked',
          rejected: 'rejected',
          expired: 'expired',
          pending: 'sent',
          approved: 'booked',
        }
        offer.status = statusMap[status.toLowerCase()] || 'draft'
      }

      // Map total
      const total = getDecimal(record, fieldMappings['totalRate'] || 'total')
      if (total) {
        offer.totalRate = total
      }

      await em.flush()

      // Create or update mapping record
      if (existingSync) {
        existingSync.lastSyncAt = new Date()
      } else {
        const mapping = em.create(FrcSugarCrmMapping, {
          organizationId,
          tenantId,
          sugarCrmModule: this.sugarCrmModule,
          sugarCrmRecordId: sugarCrmId,
          localEntityType: this.localEntityType,
          localEntityId: offer.id,
          lastSyncAt: new Date(),
        })
        em.persist(mapping)
      }

      await em.flush()

      return {
        success: true,
        localEntityId: offer.id,
        localEntityType: this.localEntityType,
        operation,
      }
    } catch (error) {
      return {
        success: false,
        localEntityType: this.localEntityType,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async findBySugarCrmId(
    sugarCrmId: string,
    ctx: MapperContext
  ): Promise<{ id: string; dateModified?: Date } | null> {
    const { em, organizationId, tenantId } = ctx

    const mapping = await em.findOne(FrcSugarCrmMapping, {
      organizationId,
      tenantId,
      sugarCrmModule: this.sugarCrmModule,
      sugarCrmRecordId: sugarCrmId,
    })

    if (!mapping) return null

    return {
      id: mapping.localEntityId,
      dateModified: mapping.lastSyncAt ?? undefined,
    }
  }
}
