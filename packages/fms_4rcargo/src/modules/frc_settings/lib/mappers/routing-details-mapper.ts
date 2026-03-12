/**
 * Routing Details Mapper - SugarCRM ev_RoutingDetails → FrcAirRouting
 *
 * Maps SugarCRM custom Routing Details module records to FrcAirRouting entities.
 * These are flight legs linked to an ev_Quote (which maps to FrcOffer).
 *
 * Airports are looked up by code in FmsLocation table (type='airport').
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getDecimal, getDate, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'
import { FrcAirRouting, FrcOffer } from '../../../frc_offers/data/entities'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import type { FrcRoutingType } from '../../../../lib/types'

/** SugarCRM ev_RoutingDetails fields we need */
const ROUTING_DETAILS_FIELDS = [
  'id',
  'name',
  'date_modified',
  'deleted',
  // Relations
  'quote_id', // Links to ev_Quotes
  'carrier_id',
  // Routing info
  'carrier_type',
  'flight_number',
  'routing_details_type', // Type of routing (direct_flight, consol_truck_management, etc.)
  // Airport references - we use _name fields which contain airport codes
  'origin_airport_id',
  'origin_airport_name',
  'destination_airport_id',
  'destination_airport_name',
  // Schedule
  'date_of_departure',
  'stated_time_of_departure_hour',
  'stated_time_of_departure_minutes',
  'date_of_arrival',
  'stated_time_of_arrival_hour',
  'stated_time_of_arrival_minutes',
  // Rates
  'connection_rate_total',
]

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

/** Map SugarCRM routing type to FrcRoutingType */
function mapRoutingType(value: string | null): FrcRoutingType {
  if (!value) return 'direct_flight'

  const normalized = value.toLowerCase().trim().replace(/_/g, ' ')

  // SugarCRM values: consol_truck_management, direct_flight, connecting_flight, etc.
  if (normalized.includes('consol') || normalized.includes('truck') || normalized.includes('management')) {
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
 * Format time from hour and minutes components to HH:MM format
 */
function formatTimeFromComponents(hour: string | null, minutes: string | null): string | null {
  if (!hour && !minutes) return null

  const h = hour ? hour.padStart(2, '0') : '00'
  const m = minutes ? minutes.padStart(2, '0') : '00'

  return `${h}:${m}`
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
      const quoteId = getString(record, 'quote_id')
      if (!quoteId) {
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
        sugarCrmRecordId: quoteId,
        localEntityType: 'FrcOffer',
      })

      if (!offerMapping) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: `Parent quote ${quoteId} not yet synced`,
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
      const routingType = getString(record, 'routing_details_type')
      routing.type = mapRoutingType(routingType)

      // Map airports by looking up code in FmsLocation
      // SugarCRM stores airport name/code in origin_airport_name/destination_airport_name
      const originAirportCode = getString(record, 'origin_airport_name')
      const originAirportId = await lookupAirportByCode(originAirportCode, em, organizationId, tenantId)
      if (originAirportId) {
        routing.originAirportId = originAirportId
      }

      const destinationAirportCode = getString(record, 'destination_airport_name')
      const destinationAirportId = await lookupAirportByCode(destinationAirportCode, em, organizationId, tenantId)
      if (destinationAirportId) {
        routing.destinationAirportId = destinationAirportId
      }

      // Map departure schedule
      const departureDate = getDate(record, 'date_of_departure')
      if (departureDate) routing.departureDate = departureDate

      const departureTime = formatTimeFromComponents(
        getString(record, 'stated_time_of_departure_hour'),
        getString(record, 'stated_time_of_departure_minutes')
      )
      if (departureTime) routing.departureTime = departureTime

      // Map arrival schedule
      const arrivalDate = getDate(record, 'date_of_arrival')
      if (arrivalDate) routing.arrivalDate = arrivalDate

      const arrivalTime = formatTimeFromComponents(
        getString(record, 'stated_time_of_arrival_hour'),
        getString(record, 'stated_time_of_arrival_minutes')
      )
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
