/**
 * Trucks Mapper - SugarCRM ev_Trucks → FrcTruck
 *
 * Maps SugarCRM custom Trucks module records to FrcTruck entities.
 * This is a simple mapper - trucks only have a name field.
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'
import { FrcTruck } from '../../../frc_trucks/data/entities'

/** SugarCRM ev_Trucks fields we need */
const TRUCK_FIELDS = ['id', 'name', 'date_modified', 'deleted']

export class TrucksMapper implements ModuleMapper {
  sugarCrmModule = 'ev_Trucks'
  localEntityType = 'FrcTruck'
  defaultFields = TRUCK_FIELDS

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
          error: 'Truck has no name',
        }
      }

      // Check if we already have this record synced
      const existingMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
      })

      let truck: FrcTruck | null = null
      let operation: 'create' | 'update' = 'create'

      // Default values for creation
      const createDefaults = {
        organizationId,
        tenantId,
        name,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      if (existingMapping) {
        truck = await em.findOne(FrcTruck, {
          id: existingMapping.localEntityId,
          organizationId,
          tenantId,
        })

        if (!truck) {
          // Mapping exists but truck was deleted - recreate
          truck = em.create(FrcTruck, createDefaults)
          em.persist(truck)
        } else {
          operation = 'update'
        }
      } else {
        // Check if truck with same name exists (to avoid duplicates)
        truck = await em.findOne(FrcTruck, {
          organizationId,
          tenantId,
          name,
          deletedAt: null,
        })

        if (truck) {
          operation = 'update'
        } else {
          truck = em.create(FrcTruck, createDefaults)
          em.persist(truck)
        }
      }

      if (!truck) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find truck',
        }
      }

      // Update truck fields
      truck.name = name

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
          localEntityId: truck.id,
          lastSyncAt: new Date(),
        })
        em.persist(mapping)
      }

      await em.flush()

      return {
        success: true,
        localEntityId: truck.id,
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
