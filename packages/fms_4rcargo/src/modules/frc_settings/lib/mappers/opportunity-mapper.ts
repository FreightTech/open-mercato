/**
 * Opportunity Mapper - SugarCRM Opportunities → FrcRfq
 *
 * Maps SugarCRM Opportunity records to FrcRfq (Request for Quote) entities.
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getNumber, getDecimal, getDate, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'
import { FrcRfq } from '../../../frc_rfqs/data/entities'
import type { FrcSalesStage } from '../../../../lib/types'

/** SugarCRM Opportunity fields we need */
const OPPORTUNITY_FIELDS = [
  'id',
  'name',
  'date_modified',
  'deleted',
  // Sales info
  'sales_stage',
  'probability',
  'amount',
  'currency_id',
  // Dates
  'date_closed',
  'date_entered',
  // Related
  'account_id',
  'account_name',
  // Other
  'description',
  'lead_source',
  'next_step',
  'opportunity_type',
  // Custom fields (may vary per SugarCRM instance)
  'origin_c',
  'destination_c',
  'commodity_c',
  'product_c',
  'weight_c',
  'volume_c',
]

/** Map SugarCRM sales stages to FrcRfq sales stages */
const SALES_STAGE_MAP: Record<string, FrcSalesStage> = {
  Prospecting: 'received',
  Qualification: 'received',
  'Needs Analysis': 'received',
  'Value Proposition': 'offer_sent',
  'Id. Decision Makers': 'offer_sent',
  'Perception Analysis': 'offer_sent',
  'Proposal/Price Quote': 'offer_sent',
  'Negotiation/Review': 'offer_sent',
  'Closed Won': 'offer_accepted',
  'Closed Lost': 'closed_lost',
  // Default fallback handled in code
}

export class OpportunityMapper implements ModuleMapper {
  sugarCrmModule = 'Opportunities'
  localEntityType = 'FrcRfq'
  defaultFields = OPPORTUNITY_FIELDS

  async mapRecord(record: SugarCrmRecord, ctx: MapperContext): Promise<MapperResult> {
    const { em, organizationId, tenantId } = ctx

    try {
      // Check if deleted in SugarCRM
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

      const name = getString(record, 'name')
      if (!name) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Opportunity has no name',
        }
      }

      // Check if we already have this record synced
      const existingMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
      })

      // Find linked Contractor if account_id is present
      let accountId: string | null = null
      const sugarAccountId = getString(record, 'account_id')
      if (sugarAccountId) {
        const accountMapping = await em.findOne(FrcSugarCrmMapping, {
          organizationId,
          tenantId,
          sugarCrmModule: 'Accounts',
          sugarCrmRecordId: sugarAccountId,
        })
        if (accountMapping) {
          accountId = accountMapping.localEntityId
        }
      }

      let rfq: FrcRfq | null = null
      let operation: 'create' | 'update' = 'create'

      // Prepare default values for creation
      const createDefaults = {
        organizationId,
        tenantId,
        name,
        accountId,
        salesStage: 'received' as FrcSalesStage,
        probability: 0,
        currencyCode: 'EUR',
        deliveryStatus: 'awaiting' as const,
        isDelayed: false,
        originType: 'airport' as const,
        totalPieces: 0,
        totalVolume: '0',
        totalActualWeight: '0',
        totalChargeableWeight: '0',
        totalLoadingMetres: '0',
        requestDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      if (existingMapping) {
        rfq = await em.findOne(FrcRfq, {
          id: existingMapping.localEntityId,
          organizationId,
          tenantId,
        })

        if (!rfq) {
          // Sync record exists but RFQ was deleted - recreate
          rfq = em.create(FrcRfq, createDefaults)
          em.persist(rfq)
        } else {
          operation = 'update'
        }
      } else {
        // Check if RFQ with same name exists (to avoid duplicates)
        rfq = await em.findOne(FrcRfq, {
          organizationId,
          tenantId,
          name,
        })

        if (rfq) {
          operation = 'update'
        } else {
          rfq = em.create(FrcRfq, createDefaults)
          em.persist(rfq)
        }
      }

      if (!rfq) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find RFQ',
        }
      }

      // Map SugarCRM fields to FrcRfq
      rfq.name = name
      rfq.accountId = accountId

      // Map sales stage
      const sugarStage = getString(record, 'sales_stage')
      if (sugarStage) {
        rfq.salesStage = SALES_STAGE_MAP[sugarStage] || 'received'
      }

      // Map probability
      const probability = getNumber(record, 'probability')
      if (probability !== null) {
        rfq.probability = probability
      }

      // Map amount
      const amount = getDecimal(record, 'amount')
      if (amount) {
        rfq.amount = amount
      }

      // Map date_closed to requiredAtDestinationDate
      const dateClosed = getDate(record, 'date_closed')
      if (dateClosed) {
        rfq.requiredAtDestinationDate = dateClosed
      }

      // Map description
      const description = getString(record, 'description')
      if (description) {
        rfq.description = description
      }

      // Map custom fields if present
      const commodity = getString(record, 'commodity_c')
      if (commodity) {
        rfq.commodity = commodity
      }

      const product = getString(record, 'product_c')
      if (product) {
        rfq.product = product
      }

      // Flush to get the RFQ ID
      await em.flush()

      // Create or update mapping record
      if (existingMapping) {
        existingMapping.lastSyncAt = new Date()
      } else {
        const mapping = em.create(FrcSugarCrmMapping, {
          organizationId,
          tenantId,
          sugarCrmModule: this.sugarCrmModule,
          sugarCrmRecordId: sugarCrmId,
          localEntityType: this.localEntityType,
          localEntityId: rfq.id,
          lastSyncAt: new Date(),
        })
        em.persist(mapping)
      }

      await em.flush()

      return {
        success: true,
        localEntityId: rfq.id,
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
