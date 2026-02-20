/**
 * Contact Mapper - SugarCRM Contacts → ContractorContact
 *
 * Maps SugarCRM Contact records to the ContractorContact entity.
 * Contacts must be linked to an Account which maps to a Contractor.
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'

/** SugarCRM Contact fields we need */
const CONTACT_FIELDS = [
  'id',
  'date_modified',
  'deleted',
  // Name
  'first_name',
  'last_name',
  'full_name',
  'salutation',
  'title',
  // Contact info
  'email1',
  'email2',
  'phone_work',
  'phone_mobile',
  'phone_home',
  'phone_fax',
  // Related Account
  'account_id',
  'account_name',
  // Other
  'department',
  'description',
  'primary_address_street',
  'primary_address_city',
  'primary_address_state',
  'primary_address_postalcode',
  'primary_address_country',
]

export class ContactMapper implements ModuleMapper {
  sugarCrmModule = 'Contacts'
  localEntityType = 'ContractorContact'
  defaultFields = CONTACT_FIELDS

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

      // Contact must be linked to an account
      const accountId = getString(record, 'account_id')
      if (!accountId) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: 'Contact has no linked account',
        }
      }

      // Find the Contractor linked to this SugarCRM Account
      const accountMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: 'Accounts',
        sugarCrmRecordId: accountId,
      })

      if (!accountMapping) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: `Parent account ${accountId} not yet synced`,
        }
      }

      // Check if we already have this contact synced
      const existingMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
      })

      // Dynamically import entities
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Contractor, ContractorContact } = await import(
        '@open-mercato/fms/modules/contractors/data/entities'
      )

      // Get the contractor
      const contractor = await em.findOne(Contractor, {
        id: accountMapping.localEntityId,
        organizationId,
        tenantId,
      })

      if (!contractor) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: `Contractor ${accountMapping.localEntityId} not found`,
        }
      }

      let contact: InstanceType<typeof ContractorContact> | null = null
      let operation: 'create' | 'update' = 'create'

      if (existingMapping) {
        contact = await em.findOne(ContractorContact, {
          id: existingMapping.localEntityId,
          organizationId,
          tenantId,
        })

        if (!contact) {
          // Sync record exists but contact was deleted - recreate
          contact = em.create(ContractorContact, {
            organizationId,
            tenantId,
            contractor,
            firstName: getString(record, 'first_name'),
            lastName: getString(record, 'last_name'),
          })
          em.persist(contact)
        } else {
          operation = 'update'
        }
      } else {
        // Check if contact with same name exists for this contractor
        const firstName = getString(record, 'first_name')
        const lastName = getString(record, 'last_name')
        const email = getString(record, 'email1')

        // Try to find by email first (more unique)
        if (email) {
          contact = await em.findOne(ContractorContact, {
            organizationId,
            tenantId,
            contractor,
            email,
          })
        }

        // Then try by name
        if (!contact && firstName && lastName) {
          contact = await em.findOne(ContractorContact, {
            organizationId,
            tenantId,
            contractor,
            firstName,
            lastName,
          })
        }

        if (contact) {
          operation = 'update'
        } else {
          contact = em.create(ContractorContact, {
            organizationId,
            tenantId,
            contractor,
            firstName,
            lastName,
          })
          em.persist(contact)
        }
      }

      if (!contact) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find contact',
        }
      }

      // Map SugarCRM fields to ContractorContact
      contact.firstName = getString(record, 'first_name')
      contact.lastName = getString(record, 'last_name')
      contact.email = getString(record, 'email1')

      // Prefer mobile, fall back to work phone
      const mobile = getString(record, 'phone_mobile')
      const work = getString(record, 'phone_work')
      contact.phone = mobile || work

      // Flush to get the contact ID
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
          localEntityId: contact.id,
          lastSyncAt: new Date(),
        })
        em.persist(mapping)
      }

      await em.flush()

      return {
        success: true,
        localEntityId: contact.id,
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
