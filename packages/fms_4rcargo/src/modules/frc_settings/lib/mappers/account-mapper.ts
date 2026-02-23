/**
 * Account Mapper - SugarCRM Accounts → Contractor
 *
 * Maps SugarCRM Account records to the Contractor entity in the FMS contractors module.
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'

// Import Contractor entities from FMS module
// Note: We use dynamic imports to avoid circular dependencies
// These entities are from packages/fms/src/modules/contractors/data/entities.ts

/** SugarCRM Account fields we need */
const ACCOUNT_FIELDS = [
  'id',
  'name',
  'date_modified',
  'deleted',
  // Company info
  'description',
  'website',
  'industry',
  'account_type',
  'annual_revenue',
  'employees',
  // Tax/Registration
  'sic_code',
  // Phone/Fax
  'phone_office',
  'phone_fax',
  'phone_alternate',
  // Billing address
  'billing_address_street',
  'billing_address_city',
  'billing_address_state',
  'billing_address_postalcode',
  'billing_address_country',
  // Shipping address
  'shipping_address_street',
  'shipping_address_city',
  'shipping_address_state',
  'shipping_address_postalcode',
  'shipping_address_country',
  // Parent account
  'parent_id',
]

export class AccountMapper implements ModuleMapper {
  sugarCrmModule = 'Accounts'
  localEntityType = 'Contractor'
  defaultFields = ACCOUNT_FIELDS

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
          error: 'Account has no name',
        }
      }

      // Check if we already have this record synced
      const existingMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
      })

      // Dynamically import Contractor to avoid circular deps
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Contractor, ContractorAddress, ContractorContact } = await import(
        '@open-mercato/fms/modules/contractors/data/entities'
      )

      let contractor: InstanceType<typeof Contractor> | null = null
      let operation: 'create' | 'update' = 'create'

      if (existingMapping) {
        // Update existing contractor
        contractor = await em.findOne(Contractor, {
          id: existingMapping.localEntityId,
          organizationId,
          tenantId,
        })

        if (!contractor) {
          // Sync record exists but contractor was deleted - recreate
          contractor = em.create(Contractor, {
            organizationId,
            tenantId,
            name,
          })
          em.persist(contractor)
        } else {
          operation = 'update'
        }
      } else {
        // Check if contractor with same name exists (to avoid duplicates)
        contractor = await em.findOne(Contractor, {
          organizationId,
          tenantId,
          name,
        })

        if (contractor) {
          operation = 'update'
        } else {
          contractor = em.create(Contractor, {
            organizationId,
            tenantId,
            name,
          })
          em.persist(contractor)
        }
      }

      // Safety check - contractor should always be set at this point
      if (!contractor) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find contractor',
        }
      }

      // Map SugarCRM fields to Contractor
      contractor.name = name
      contractor.shortName = getString(record, 'name')?.substring(0, 50) ?? null
      contractor.taxId = getString(record, 'sic_code')
      // Industry could be mapped to roleTypeIds or a custom field

      // Handle billing address
      const billingStreet = getString(record, 'billing_address_street')
      if (billingStreet) {
        let billingAddress = await em.findOne(ContractorAddress, {
          contractor,
          purpose: 'billing',
        })

        if (!billingAddress) {
          billingAddress = em.create(ContractorAddress, {
            organizationId,
            tenantId,
            contractor,
            purpose: 'billing',
            addressLine: billingStreet,
            city: getString(record, 'billing_address_city'),
            state: getString(record, 'billing_address_state'),
            postalCode: getString(record, 'billing_address_postalcode'),
            country: getString(record, 'billing_address_country'),
            isPrimary: true,
          })
          em.persist(billingAddress)
        } else {
          billingAddress.addressLine = billingStreet
          billingAddress.city = getString(record, 'billing_address_city')
          billingAddress.state = getString(record, 'billing_address_state')
          billingAddress.postalCode = getString(record, 'billing_address_postalcode')
          billingAddress.country = getString(record, 'billing_address_country')
        }
      }

      // Handle shipping address
      const shippingStreet = getString(record, 'shipping_address_street')
      if (shippingStreet) {
        let shippingAddress = await em.findOne(ContractorAddress, {
          contractor,
          purpose: 'shipping',
        })

        if (!shippingAddress) {
          shippingAddress = em.create(ContractorAddress, {
            organizationId,
            tenantId,
            contractor,
            purpose: 'shipping',
            addressLine: shippingStreet,
            city: getString(record, 'shipping_address_city'),
            state: getString(record, 'shipping_address_state'),
            postalCode: getString(record, 'shipping_address_postalcode'),
            country: getString(record, 'shipping_address_country'),
            isPrimary: false,
          })
          em.persist(shippingAddress)
        } else {
          shippingAddress.addressLine = shippingStreet
          shippingAddress.city = getString(record, 'shipping_address_city')
          shippingAddress.state = getString(record, 'shipping_address_state')
          shippingAddress.postalCode = getString(record, 'shipping_address_postalcode')
          shippingAddress.country = getString(record, 'shipping_address_country')
        }
      }

      // Handle main phone as a contact entry
      const phoneOffice = getString(record, 'phone_office')
      if (phoneOffice) {
        let mainContact = await em.findOne(ContractorContact, {
          contractor,
          isPrimary: true,
        })

        if (!mainContact) {
          mainContact = em.create(ContractorContact, {
            organizationId,
            tenantId,
            contractor,
            firstName: 'Main',
            lastName: 'Office',
            phone: phoneOffice,
            isPrimary: true,
          })
          em.persist(mainContact)
        } else {
          mainContact.phone = phoneOffice
        }
      }

      // Flush to get the contractor ID
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
          localEntityId: contractor.id,
          lastSyncAt: new Date(),
        })
        em.persist(mapping)
      }

      await em.flush()

      return {
        success: true,
        localEntityId: contractor.id,
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
