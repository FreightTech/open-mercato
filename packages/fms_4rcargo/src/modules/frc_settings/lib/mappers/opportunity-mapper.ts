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
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import type { FrcSalesStage, FrcDeliveryStatus, FrcLooseOrUnitised } from '../../../../lib/types'

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
  'shipment_ready_date',
  'required_at_destination_date',
  // Related
  'account_id',
  'account_name',
  'main_contact_id',
  'main_contact_name',
  // Airports
  'origin_airport_id',
  'origin_airport_name',
  'destination_airport_id',
  'destination_airport_name',
  // Other
  'description',
  'origin_type',
  'is_delayed',
  'delivery_status',
  'loose_or_unitised',
  'product',
  'commodity',
  // Totals
  'total_number_of_pieces',
  'total_volume',
  'total_actual_weight',
  'total_chargeable_weight',
  'total_loading_metres',
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

/** Map SugarCRM delivery status to FrcDeliveryStatus */
const DELIVERY_STATUS_MAP: Record<string, FrcDeliveryStatus> = {
  awaiting: 'awaiting',
  'in transit': 'in_transit',
  in_transit: 'in_transit',
  in_transit_delayed: 'in_transit_delayed',
  delivered: 'delivered',
  paid: 'paid',
}

/** Map SugarCRM loose_or_unitised to FrcLooseOrUnitised */
const LOOSE_OR_UNITISED_MAP: Record<string, FrcLooseOrUnitised> = {
  loose: 'loose',
  unitised: 'unitised',
  uld: 'unitised',
}

/**
 * Lookup airport by code in FmsLocation table.
 * SugarCRM stores airport name/code like "TLL", "SFO", etc.
 */
async function lookupAirportByCode(
  code: string | null,
  em: MapperContext['em'],
  organizationId: string,
  tenantId: string
): Promise<string | null> {
  if (!code) return null

  // Normalize code: uppercase, trim
  const normalizedCode = code.trim().toUpperCase()
  if (!normalizedCode) return null

  const airport = await em.findOne(FmsLocation, {
    organizationId,
    tenantId,
    type: 'airport',
    code: normalizedCode,
  })

  return airport?.id ?? null
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

      // Map dates
      const shipmentReadyDate = getDate(record, 'shipment_ready_date')
      if (shipmentReadyDate) {
        rfq.shipmentReadyDate = shipmentReadyDate
      }

      const requiredAtDestinationDate = getDate(record, 'required_at_destination_date')
      if (requiredAtDestinationDate) {
        rfq.requiredAtDestinationDate = requiredAtDestinationDate
      } else {
        // Fallback to date_closed if required_at_destination_date not set
        const dateClosed = getDate(record, 'date_closed')
        if (dateClosed) {
          rfq.requiredAtDestinationDate = dateClosed
        }
      }

      // Map description
      const description = getString(record, 'description')
      if (description) {
        rfq.description = description
      }

      // Map product and commodity (correct field names, not _c suffix)
      const commodity = getString(record, 'commodity')
      if (commodity) {
        rfq.commodity = commodity
      }

      const product = getString(record, 'product')
      if (product) {
        rfq.product = product
      }

      // Map airports by looking up code in FmsLocation
      // SugarCRM stores airport name/code in origin_airport_name/destination_airport_name
      const originAirportCode = getString(record, 'origin_airport_name')
      const originAirportId = await lookupAirportByCode(originAirportCode, em, organizationId, tenantId)
      if (originAirportId) {
        rfq.originAirportId = originAirportId
      }

      const destinationAirportCode = getString(record, 'destination_airport_name')
      const destinationAirportId = await lookupAirportByCode(destinationAirportCode, em, organizationId, tenantId)
      if (destinationAirportId) {
        rfq.destinationAirportId = destinationAirportId
      }

      // Map delivery status
      const deliveryStatus = getString(record, 'delivery_status')
      if (deliveryStatus) {
        const normalizedStatus = deliveryStatus.toLowerCase().trim()
        rfq.deliveryStatus = DELIVERY_STATUS_MAP[normalizedStatus] || 'awaiting'
      }

      // Map is_delayed
      const isDelayed = getBoolean(record, 'is_delayed')
      if (isDelayed !== null) {
        rfq.isDelayed = isDelayed
      }

      // Map loose_or_unitised
      const looseOrUnitised = getString(record, 'loose_or_unitised')
      if (looseOrUnitised) {
        const normalizedValue = looseOrUnitised.toLowerCase().trim()
        rfq.looseOrUnitised = LOOSE_OR_UNITISED_MAP[normalizedValue] || null
      }

      // Map totals
      const totalPieces = getNumber(record, 'total_number_of_pieces')
      if (totalPieces !== null) {
        rfq.totalPieces = totalPieces
      }

      const totalVolume = getDecimal(record, 'total_volume')
      if (totalVolume) {
        rfq.totalVolume = totalVolume
      }

      const totalActualWeight = getDecimal(record, 'total_actual_weight')
      if (totalActualWeight) {
        rfq.totalActualWeight = totalActualWeight
      }

      const totalChargeableWeight = getDecimal(record, 'total_chargeable_weight')
      if (totalChargeableWeight) {
        rfq.totalChargeableWeight = totalChargeableWeight
      }

      const totalLoadingMetres = getDecimal(record, 'total_loading_metres')
      if (totalLoadingMetres) {
        rfq.totalLoadingMetres = totalLoadingMetres
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
