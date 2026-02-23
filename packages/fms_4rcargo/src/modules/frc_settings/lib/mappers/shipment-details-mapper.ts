/**
 * Shipment Details Mapper - SugarCRM ev_ShipmentDetails → FrcAirCargo
 *
 * Maps SugarCRM custom Shipment Details module records to FrcAirCargo entities.
 * These are cargo line items linked to an Opportunity (which maps to FrcRfq).
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getNumber, getDecimal, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'
import { FrcAirCargo, FrcRfq } from '../../../frc_rfqs/data/entities'
import type { FrcStackableType } from '../../../../lib/types'

/** SugarCRM ev_ShipmentDetails fields we need */
const SHIPMENT_DETAILS_FIELDS = [
  'id',
  'name',
  'date_modified',
  'deleted',
  // Relations
  'opportunity_id',
  'account_id',
  // Cargo details
  'number_of_pieces',
  'stackable',
  'length_cm',
  'width_cm',
  'height_cm',
  'volume_cm', // SugarCRM field name (value is in m³ despite the name)
  'actual_weight_per_piece_kg', // SugarCRM field name
  'chargable_weight_kg', // SugarCRM field name (note: typo in SugarCRM - "chargable" not "chargeable")
  'total_loading_meters', // SugarCRM field name
]

/** Map SugarCRM stackable values to FrcStackableType */
function mapStackableType(value: string | null): FrcStackableType {
  if (!value) return 'fully_stackable'
  const normalized = value.toLowerCase().trim()
  if (normalized === 'no' || normalized === 'false' || normalized === '0' || normalized === 'non_stackable') {
    return 'non_stackable'
  }
  return 'fully_stackable'
}

export class ShipmentDetailsMapper implements ModuleMapper {
  sugarCrmModule = 'ev_ShipmentDetails'
  localEntityType = 'FrcAirCargo'
  defaultFields = SHIPMENT_DETAILS_FIELDS

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

      // Shipment details must be linked to an opportunity (which maps to RFQ)
      const opportunityId = getString(record, 'opportunity_id')
      if (!opportunityId) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: 'Shipment detail has no linked opportunity',
        }
      }

      // Find linked RFQ via mapping
      const rfqMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: 'Opportunities',
        sugarCrmRecordId: opportunityId,
      })

      if (!rfqMapping) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: `Parent opportunity ${opportunityId} not yet synced`,
        }
      }

      // Get the RFQ entity for the relation
      const rfq = await em.findOne(FrcRfq, {
        id: rfqMapping.localEntityId,
        organizationId,
        tenantId,
      })

      if (!rfq) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: `RFQ ${rfqMapping.localEntityId} not found`,
        }
      }

      // Check if we already have this record synced
      const existingMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
      })

      const name = getString(record, 'name') || `Cargo-${sugarCrmId.substring(0, 8)}`

      let airCargo: FrcAirCargo | null = null
      let operation: 'create' | 'update' = 'create'

      // Default values for creation
      const createDefaults = {
        organizationId,
        tenantId,
        rfq,
        name,
        numberOfPieces: 1,
        stackableType: 'fully_stackable' as FrcStackableType,
        volumeM3: '0',
        actualWeightKg: '0',
        chargeableWeightKg: '0',
        loadingMetres: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      if (existingMapping) {
        airCargo = await em.findOne(FrcAirCargo, {
          id: existingMapping.localEntityId,
          organizationId,
          tenantId,
        })

        if (!airCargo) {
          // Mapping exists but air cargo was deleted - recreate
          airCargo = em.create(FrcAirCargo, createDefaults)
          em.persist(airCargo)
        } else {
          operation = 'update'
        }
      } else {
        airCargo = em.create(FrcAirCargo, createDefaults)
        em.persist(airCargo)
      }

      if (!airCargo) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find air cargo',
        }
      }

      // Map fields from SugarCRM
      airCargo.name = name
      airCargo.rfq = rfq

      // Number of pieces
      const numberOfPieces = getNumber(record, 'number_of_pieces')
      if (numberOfPieces !== null && numberOfPieces > 0) {
        airCargo.numberOfPieces = numberOfPieces
      }

      // Stackable type
      const stackable = getString(record, 'stackable')
      airCargo.stackableType = mapStackableType(stackable)

      // Dimensions
      const lengthCm = getDecimal(record, 'length_cm')
      if (lengthCm) airCargo.lengthCm = lengthCm

      const widthCm = getDecimal(record, 'width_cm')
      if (widthCm) airCargo.widthCm = widthCm

      const heightCm = getDecimal(record, 'height_cm')
      if (heightCm) airCargo.heightCm = heightCm

      // Volume - SugarCRM field is "volume_cm" but value is in m³
      const volumeM3 = getDecimal(record, 'volume_cm')
      if (volumeM3) airCargo.volumeM3 = volumeM3

      // Weights - note SugarCRM field name differences
      const actualWeightKg = getDecimal(record, 'actual_weight_per_piece_kg')
      if (actualWeightKg) airCargo.actualWeightKg = actualWeightKg

      // SugarCRM has a typo: "chargable" instead of "chargeable"
      const chargeableWeightKg = getDecimal(record, 'chargable_weight_kg')
      if (chargeableWeightKg) airCargo.chargeableWeightKg = chargeableWeightKg

      // Loading metres - SugarCRM field is "total_loading_meters"
      const loadingMetres = getDecimal(record, 'total_loading_meters')
      if (loadingMetres) airCargo.loadingMetres = loadingMetres

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
          localEntityId: airCargo.id,
          lastSyncAt: new Date(),
        })
        em.persist(mapping)
      }

      await em.flush()

      return {
        success: true,
        localEntityId: airCargo.id,
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
