/**
 * ev_Quotes Mapper - SugarCRM ev_Quotes → FrcOffer + FrcProject (if Booked)
 *
 * Maps SugarCRM custom Quotes module records to FrcOffer entities.
 * When status is "Booked", also creates an FrcProject linked to the offer.
 *
 * This is separate from the generic QuoteToOfferMapper in custom-module-mapper.ts
 * to handle the specific ev_Quotes fields discovered from the SugarCRM instance.
 */

import type { SugarCrmRecord } from '../sugarcrm-client'
import type { MapperContext, MapperResult, ModuleMapper } from './types'
import { getString, getDecimal, getDate, getBoolean } from './types'
import { FrcSugarCrmMapping } from '../../data/entities'
import { FrcOffer, FrcOfferLine } from '../../../frc_offers/data/entities'
import { FrcProject, FrcProjectAirCargo } from '../../../frc_projects/data/entities'
import { FrcRfq, FrcAirCargo } from '../../../frc_rfqs/data/entities'
import type { FrcOfferStatus, FrcConnectionMethod, FrcProjectStatus } from '../../../../lib/types'

/** SugarCRM ev_Quotes fields we need */
const EV_QUOTES_FIELDS = [
  'id',
  'name',
  'date_modified',
  'deleted',
  // Relations
  'opportunity_id',
  'carrier_id',
  // Status & identifiers
  'status',
  'awb',
  'connection_method',
  'departure_date',
  // Rates
  'connection_rate_per_kg',
  'connection_rate_total',
  'airfreight_rate_per_kg',
  'airfreight_rate_total',
  'total_rate_per_kg',
  'total_rate',
]

/**
 * Map SugarCRM quote status to FrcOfferStatus
 * Returns tuple: [offerStatus, shouldCreateProject]
 */
function mapQuoteStatus(value: string | null): [FrcOfferStatus, boolean] {
  if (!value) return ['draft', false]

  const normalized = value.toLowerCase().trim()

  switch (normalized) {
    case 'draft':
      return ['draft', false]
    case 'sent':
      return ['sent', false]
    case 'followed up':
    case 'followedup':
    case 'followed_up':
      return ['sent', false]
    case 'booked':
    case 'accepted':
      return ['booked', true] // Creates project
    case 'declined':
    case 'rejected':
    case 'lost':
      return ['rejected', false]
    case 'expired':
      return ['expired', false]
    default:
      return ['draft', false]
  }
}

/** Map SugarCRM connection method to FrcConnectionMethod */
function mapConnectionMethod(value: string | null): FrcConnectionMethod | null {
  if (!value) return null

  const normalized = value.toLowerCase().trim()

  if (normalized.includes('4r') || normalized.includes('consol') || normalized.includes('truck')) {
    return '4r_consol_truck'
  }
  if (normalized.includes('direct')) {
    return 'direct'
  }
  if (normalized.includes('connecting') || normalized.includes('flight')) {
    return 'connecting_flight'
  }

  return 'direct' // Default
}

/**
 * Generate project number in format PRJ-YYYYMMDD-XXXX
 */
async function generateProjectNumber(
  em: MapperContext['em'],
  tenantId: string,
  organizationId: string
): Promise<string> {
  const now = new Date()
  const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '')

  // Count existing projects for this org today to generate sequence
  const count = await em.count(FrcProject, {
    tenantId,
    organizationId,
    createdAt: { $gte: new Date(now.toISOString().slice(0, 10)) },
  })

  const sequence = String(count + 1).padStart(4, '0')
  return `PRJ-${datePrefix}-${sequence}`
}

export class EvQuotesMapper implements ModuleMapper {
  sugarCrmModule = 'ev_Quotes'
  localEntityType = 'FrcOffer'
  defaultFields = EV_QUOTES_FIELDS

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

      // Quote must be linked to an opportunity (which maps to RFQ)
      const opportunityId = getString(record, 'opportunity_id')
      if (!opportunityId) {
        return {
          success: true,
          localEntityType: this.localEntityType,
          operation: 'skip',
          error: 'Quote has no linked opportunity',
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

      // Get the RFQ to access accountId for the project
      const rfq = await em.findOne(FrcRfq, {
        id: rfqMapping.localEntityId,
        organizationId,
        tenantId,
      })

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

      // Check if we already have this record synced (for offer)
      const existingOfferMapping = await em.findOne(FrcSugarCrmMapping, {
        organizationId,
        tenantId,
        sugarCrmModule: this.sugarCrmModule,
        sugarCrmRecordId: sugarCrmId,
        localEntityType: 'FrcOffer',
      })

      const name = getString(record, 'name') || `Quote-${sugarCrmId.substring(0, 8)}`

      let offer: FrcOffer | null = null
      let operation: 'create' | 'update' = 'create'

      // Default values for offer creation
      const offerDefaults = {
        organizationId,
        tenantId,
        rfqId: rfqMapping.localEntityId,
        name,
        carrierId,
        status: 'draft' as FrcOfferStatus,
        currencyCode: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      if (existingOfferMapping) {
        offer = await em.findOne(FrcOffer, {
          id: existingOfferMapping.localEntityId,
          organizationId,
          tenantId,
        })

        if (!offer) {
          // Mapping exists but offer was deleted - recreate
          offer = em.create(FrcOffer, offerDefaults)
          em.persist(offer)
        } else {
          operation = 'update'
        }
      } else {
        offer = em.create(FrcOffer, offerDefaults)
        em.persist(offer)
      }

      if (!offer) {
        return {
          success: false,
          localEntityType: this.localEntityType,
          error: 'Failed to create or find offer',
        }
      }

      // Map fields from SugarCRM
      offer.name = name
      offer.rfqId = rfqMapping.localEntityId
      offer.carrierId = carrierId

      // Map status and determine if we need to create a project
      const statusValue = getString(record, 'status')
      const [offerStatus, shouldCreateProject] = mapQuoteStatus(statusValue)
      offer.status = offerStatus

      // Map AWB number
      const awb = getString(record, 'awb')
      if (awb) offer.awbNumber = awb

      // Map connection method
      const connectionMethod = getString(record, 'connection_method')
      if (connectionMethod) {
        offer.connectionMethod = mapConnectionMethod(connectionMethod)
      }

      // Map departure date
      const departureDate = getDate(record, 'departure_date')
      if (departureDate) offer.departureDate = departureDate

      // Map rates
      const connectionRatePerKg = getDecimal(record, 'connection_rate_per_kg')
      if (connectionRatePerKg) offer.connectionRatePerKg = connectionRatePerKg

      const connectionRateTotal = getDecimal(record, 'connection_rate_total')
      if (connectionRateTotal) offer.connectionRateTotal = connectionRateTotal

      const airfreightRatePerKg = getDecimal(record, 'airfreight_rate_per_kg')
      if (airfreightRatePerKg) offer.airfreightRatePerKg = airfreightRatePerKg

      const airfreightRateTotal = getDecimal(record, 'airfreight_rate_total')
      if (airfreightRateTotal) offer.airfreightRateTotal = airfreightRateTotal

      const totalRatePerKg = getDecimal(record, 'total_rate_per_kg')
      if (totalRatePerKg) offer.totalRatePerKg = totalRatePerKg

      const totalRate = getDecimal(record, 'total_rate')
      if (totalRate) offer.totalRate = totalRate

      await em.flush()

      // Ensure offer lines exist for all cargo in the linked RFQ
      await this.ensureOfferLinesExist(em, {
        organizationId,
        tenantId,
        offer,
        rfq,
      })

      // Create or update offer mapping record
      if (existingOfferMapping) {
        existingOfferMapping.lastSyncAt = new Date()
      } else {
        const offerMapping = em.create(FrcSugarCrmMapping, {
          organizationId,
          tenantId,
          sugarCrmModule: this.sugarCrmModule,
          sugarCrmRecordId: sugarCrmId,
          localEntityType: 'FrcOffer',
          localEntityId: offer.id,
          lastSyncAt: new Date(),
        })
        em.persist(offerMapping)
      }

      // Handle project creation if status is "Booked"
      if (shouldCreateProject) {
        await this.ensureProjectExists(em, {
          organizationId,
          tenantId,
          sugarCrmId,
          offer,
          rfq,
          totalRate,
          awb,
        })
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

  /**
   * Ensure a project exists for a booked quote
   */
  private async ensureProjectExists(
    em: MapperContext['em'],
    params: {
      organizationId: string
      tenantId: string
      sugarCrmId: string
      offer: FrcOffer
      rfq: FrcRfq | null
      totalRate: string | null
      awb: string | null
    }
  ): Promise<void> {
    const { organizationId, tenantId, sugarCrmId, offer, rfq, totalRate, awb } = params

    // Check if project mapping already exists for this quote
    const existingProjectMapping = await em.findOne(FrcSugarCrmMapping, {
      organizationId,
      tenantId,
      sugarCrmModule: this.sugarCrmModule,
      sugarCrmRecordId: sugarCrmId,
      localEntityType: 'FrcProject',
    })

    if (existingProjectMapping) {
      // Mapping exists - try to find and update the project
      const project = await em.findOne(FrcProject, {
        id: existingProjectMapping.localEntityId,
        organizationId,
        tenantId,
      })

      if (project) {
        // Update existing project
        project.offerId = offer.id
        if (totalRate) project.totalValue = totalRate
        if (awb) project.awbNumbers = [awb]
        existingProjectMapping.lastSyncAt = new Date()

        // Ensure project cargo assignments exist
        await this.ensureProjectCargoExists(em, {
          organizationId,
          tenantId,
          projectId: project.id,
          rfq,
        })
        return
      }

      // Project was deleted but mapping exists - create new project and update mapping
      const projectNumber = await generateProjectNumber(em, tenantId, organizationId)
      const newProject = em.create(FrcProject, {
        organizationId,
        tenantId,
        projectNumber,
        rfqId: rfq?.id ?? null,
        offerId: offer.id,
        accountId: rfq?.accountId ?? null,
        status: 'active' as FrcProjectStatus,
        totalValue: totalRate,
        currencyCode: 'EUR',
        originAirportId: rfq?.originAirportId ?? null,
        destinationAirportId: rfq?.destinationAirportId ?? null,
        shipmentReadyDate: rfq?.shipmentReadyDate ?? null,
        requiredDeliveryDate: rfq?.requiredAtDestinationDate ?? null,
        awbNumbers: awb ? [awb] : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      em.persist(newProject)
      await em.flush()

      // Ensure project cargo assignments exist
      await this.ensureProjectCargoExists(em, {
        organizationId,
        tenantId,
        projectId: newProject.id,
        rfq,
      })

      // Update existing mapping to point to new project
      existingProjectMapping.localEntityId = newProject.id
      existingProjectMapping.lastSyncAt = new Date()
      return
    }

    // No mapping exists - create new project and mapping
    const projectNumber = await generateProjectNumber(em, tenantId, organizationId)

    const project = em.create(FrcProject, {
      organizationId,
      tenantId,
      projectNumber,
      rfqId: rfq?.id ?? null,
      offerId: offer.id,
      accountId: rfq?.accountId ?? null,
      status: 'active' as FrcProjectStatus,
      totalValue: totalRate,
      currencyCode: 'EUR',
      originAirportId: rfq?.originAirportId ?? null,
      destinationAirportId: rfq?.destinationAirportId ?? null,
      shipmentReadyDate: rfq?.shipmentReadyDate ?? null,
      requiredDeliveryDate: rfq?.requiredAtDestinationDate ?? null,
      awbNumbers: awb ? [awb] : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(project)

    await em.flush()

    // Ensure project cargo assignments exist
    await this.ensureProjectCargoExists(em, {
      organizationId,
      tenantId,
      projectId: project.id,
      rfq,
    })

    // Create project mapping
    const projectMapping = em.create(FrcSugarCrmMapping, {
      organizationId,
      tenantId,
      sugarCrmModule: this.sugarCrmModule,
      sugarCrmRecordId: sugarCrmId,
      localEntityType: 'FrcProject',
      localEntityId: project.id,
      lastSyncAt: new Date(),
    })
    em.persist(projectMapping)
  }

  /**
   * Ensure offer lines exist for all cargo in the linked RFQ
   * Skips creating lines if they already exist (based on sourceAirCargoId)
   */
  private async ensureOfferLinesExist(
    em: MapperContext['em'],
    params: {
      organizationId: string
      tenantId: string
      offer: FrcOffer
      rfq: FrcRfq | null
    }
  ): Promise<void> {
    const { organizationId, tenantId, offer, rfq } = params

    if (!rfq) return

    // Fetch all air cargo from the RFQ
    const airCargoItems = await em.find(FrcAirCargo, {
      rfq: { id: rfq.id },
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (airCargoItems.length === 0) return

    // Fetch existing offer lines for this offer
    const existingOfferLines = await em.find(FrcOfferLine, {
      offer: { id: offer.id },
      organizationId,
      tenantId,
      deletedAt: null,
    })

    // Build set of existing sourceAirCargoIds
    const existingCargoIds = new Set(
      existingOfferLines
        .filter((line) => line.sourceAirCargoId)
        .map((line) => line.sourceAirCargoId)
    )

    // Create offer lines for cargo not yet linked
    for (const cargo of airCargoItems) {
      if (existingCargoIds.has(cargo.id)) continue

      const offerLine = em.create(FrcOfferLine, {
        organizationId,
        tenantId,
        offer,
        sourceAirCargoId: cargo.id,
        name: cargo.name,
        numberOfPieces: cargo.numberOfPieces,
        stackableType: cargo.stackableType,
        lengthCm: cargo.lengthCm ?? null,
        widthCm: cargo.widthCm ?? null,
        heightCm: cargo.heightCm ?? null,
        volumeM3: cargo.volumeM3,
        actualWeightKg: cargo.actualWeightKg,
        chargeableWeightKg: cargo.chargeableWeightKg,
        loadingMetres: cargo.loadingMetres,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      em.persist(offerLine)
    }
  }

  /**
   * Ensure project cargo assignments exist for all cargo in the linked RFQ
   * Skips creating assignments if they already exist (based on airCargoId)
   */
  private async ensureProjectCargoExists(
    em: MapperContext['em'],
    params: {
      organizationId: string
      tenantId: string
      projectId: string
      rfq: FrcRfq | null
    }
  ): Promise<void> {
    const { organizationId, tenantId, projectId, rfq } = params

    if (!rfq) return

    // Fetch all air cargo from the RFQ
    const airCargoItems = await em.find(FrcAirCargo, {
      rfq: { id: rfq.id },
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (airCargoItems.length === 0) return

    // Fetch existing cargo assignments for this project
    const existingAssignments = await em.find(FrcProjectAirCargo, {
      projectId,
      organizationId,
      tenantId,
    })

    // Build set of existing airCargoIds
    const existingCargoIds = new Set(existingAssignments.map((a) => a.airCargoId))

    // Create assignments for cargo not yet linked
    for (const cargo of airCargoItems) {
      if (existingCargoIds.has(cargo.id)) continue

      const assignment = em.create(FrcProjectAirCargo, {
        organizationId,
        tenantId,
        projectId,
        airCargoId: cargo.id,
        quantity: cargo.numberOfPieces, // Full quantity as per requirement
        createdAt: new Date(),
      })
      em.persist(assignment)
    }
  }

  async findBySugarCrmId(
    sugarCrmId: string,
    ctx: MapperContext
  ): Promise<{ id: string; dateModified?: Date } | null> {
    const { em, organizationId, tenantId } = ctx

    // Return the offer mapping (primary entity)
    const mapping = await em.findOne(FrcSugarCrmMapping, {
      organizationId,
      tenantId,
      sugarCrmModule: this.sugarCrmModule,
      sugarCrmRecordId: sugarCrmId,
      localEntityType: 'FrcOffer',
    })

    if (!mapping) return null

    return {
      id: mapping.localEntityId,
      dateModified: mapping.lastSyncAt ?? undefined,
    }
  }
}
