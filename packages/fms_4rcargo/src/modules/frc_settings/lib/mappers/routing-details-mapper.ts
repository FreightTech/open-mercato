/**
 * Routing Details Mapper - SugarCRM ev_RoutingDetails → FrcAirRouting
 *
 * Maps SugarCRM custom Routing Details module records to FrcAirRouting entities.
 * These are flight legs linked to an ev_Quote (which maps to FrcOffer).
 *
 * Note: Airport IDs are skipped because SugarCRM stores UUIDs that can't be
 * resolved to FmsLocation records. Users can manually set airports in 4RCargo.
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getDecimal, getDate, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'
import { FrcAirRouting, FrcOffer } from '../../../frc_offers/data/entities'
import type { FrcRoutingType } from '../../../../lib/types'

/** SugarCRM ev_RoutingDetails fields we need */
const ROUTING_DETAILS_FIELDS = [
  'id',
  'name',
  'date_modified',
  'deleted',
  // Relations
  'ev_quotes_id',
  'carrier_id',
  // Routing info
  'carrier_type',
  'flight_number',
  'type',
  // Airport references (skipped - SugarCRM UUIDs can't be resolved)
  'origin_airport_id',
  'destination_airport_id',
  // Schedule
  'departure_date',
  'departure_time',
  'arrival_date',
  'arrival_time',
  // Rates
  'connection_rate_total',
]

/** Map SugarCRM routing type to FrcRoutingType */
function mapRoutingType(value: string | null): FrcRoutingType {
  if (!value) return 'direct_flight'

  const normalized = value.toLowerCase().trim()

  if (normalized.includes('pickup') || normalized.includes('truck') || normalized.includes('management')) {
    return 'direct_pickup_truck_management'
  }
  if (normalized.includes('connecting')) {
    return 'connecting_flight'
  }
  if (normalized.includes('direct')) {
    return 'direct_flight'
  }

  return 'direct_flight' // Default
}

/**
 * Format time string to HH:MM format
 */
function formatTime(value: string | null): string | null {
  if (!value) return null

  // Try to extract HH:MM from various formats
  const timeMatch = value.match(/(\d{1,2}):(\d{2})/)
  if (timeMatch) {
    const hours = timeMatch[1].padStart(2, '0')
    const minutes = timeMatch[2]
    return `${hours}:${minutes}`
  }

  return null
}

export class RoutingDetailsMapper implements ModuleMapper {
  sugarCrmModule = 'ev_RoutingDetails'
  localEntityType = 'FrcAirRouting'
  defaultFields = ROUTING_DETAILS_FIELDS

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

      // Routing detail must be linked to an ev_Quote (which maps to FrcOffer)
      const evQuoteId = getString(record, 'ev_quotes_id')
      if (!evQuoteId) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: 'Routing detail has no linked quote',
        }
      }

      // Find linked Offer via mapping (ev_Quotes -> FrcOffer)
      const offerMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: 'ev_Quotes',
        sugarCrmRecordId: evQuoteId,
        localEntityType: 'FrcOffer',
      })

      if (!offerMapping) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: `Parent quote ${evQuoteId} not yet synced`,
        }
      }

      // Get the Offer entity for the relation
      const offer = await em.findOne(FrcOffer, {
        id: offerMapping.localEntityId,
        organizationId,
        tenantId,
      })

      if (!offer) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: `Offer ${offerMapping.localEntityId} not found`,
        }
      }

      // Find linked carrier via Accounts mapping
      let carrierId: string | null = null
      const sugarCarrierId = getString(record, 'carrier_id')
      if (sugarCarrierId) {
        const carrierMapping = await em.findOne(FrcSugarCrmMapping, {
          organizationId,
          tenantId,
          sugarCrmModule: 'Accounts',
          sugarCrmRecordId: sugarCarrierId,
        })
        if (carrierMapping) {
          carrierId = carrierMapping.localEntityId
        }
      }

      // Check if we already have this record synced
      const existingMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
      })

      const name = getString(record, 'name') || `Routing-${sugarCrmId.substring(0, 8)}`

      let routing: FrcAirRouting | null = null
      let operation: 'create' | 'update' = 'create'

      // Default values for creation
      const createDefaults = {
        organizationId,
        tenantId,
        offer,
        name,
        carrierId,
        type: 'direct_flight' as FrcRoutingType,
        currencyCode: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      if (existingMapping) {
        routing = await em.findOne(FrcAirRouting, {
          id: existingMapping.localEntityId,
          organizationId,
          tenantId,
        })

        if (!routing) {
          // Mapping exists but routing was deleted - recreate
          routing = em.create(FrcAirRouting, createDefaults)
          em.persist(routing)
        } else {
          operation = 'update'
        }
      } else {
        routing = em.create(FrcAirRouting, createDefaults)
        em.persist(routing)
      }

      if (!routing) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find routing',
        }
      }

      // Map fields from SugarCRM
      routing.name = name
      routing.offer = offer
      routing.carrierId = carrierId

      // Map carrier type
      const carrierType = getString(record, 'carrier_type')
      if (carrierType) routing.carrierType = carrierType

      // Map flight number
      const flightNumber = getString(record, 'flight_number')
      if (flightNumber) routing.flightNumber = flightNumber

      // Map routing type
      const type = getString(record, 'type')
      routing.type = mapRoutingType(type)

      // Note: Airport IDs are skipped (Option A)
      // SugarCRM stores UUIDs that can't be resolved to FmsLocation records
      // routing.originAirportId = null
      // routing.destinationAirportId = null

      // Map departure schedule
      const departureDate = getDate(record, 'departure_date')
      if (departureDate) routing.departureDate = departureDate

      const departureTime = formatTime(getString(record, 'departure_time'))
      if (departureTime) routing.departureTime = departureTime

      // Map arrival schedule
      const arrivalDate = getDate(record, 'arrival_date')
      if (arrivalDate) routing.arrivalDate = arrivalDate

      const arrivalTime = formatTime(getString(record, 'arrival_time'))
      if (arrivalTime) routing.arrivalTime = arrivalTime

      // Map connection rate
      const connectionRateTotal = getDecimal(record, 'connection_rate_total')
      if (connectionRateTotal) routing.connectionRateTotal = connectionRateTotal

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
          localEntityId: routing.id,
          lastSyncAt: new Date(),
        })
        em.persist(mapping)
      }

      await em.flush()

      return {
        success: true,
        localEntityId: routing.id,
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
