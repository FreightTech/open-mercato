/**
 * FMS Projects Module - Search Configuration
 * CRITICAL: Enables Cmd+K global search for projects
 */

import type { SearchModuleConfig, SearchBuildContext } from '@open-mercato/shared/modules/search'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'

function pickString(...candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: E.fms_projects.fms_project,
      enabled: true,
      priority: 12, // Higher than quotes (10) for better visibility

      buildSource: async (ctx: SearchBuildContext) => {
        const record = ctx.record
        const lines: string[] = []

        // Primary identifier
        if (record.project_number) {
          lines.push(`Project: ${record.project_number}`)
        }

        // Client information
        if (record.client_name) {
          lines.push(`Client: ${record.client_name}`)
        }

        // Shipment details
        if (record.shipment_type) {
          lines.push(`Type: ${record.shipment_type}`)
        }

        if (record.cargo_type && typeof record.cargo_type === 'string') {
          lines.push(`Cargo: ${record.cargo_type.toUpperCase()}`)
        }

        // Locations
        if (record.origin_address) {
          lines.push(`From: ${record.origin_address}`)
        }

        if (record.destination_address) {
          lines.push(`To: ${record.destination_address}`)
        }

        // Commodity
        if (record.commodity_description) {
          lines.push(`Commodity: ${record.commodity_description}`)
        }

        // References
        if (record.client_reference) {
          lines.push(`Client Ref: ${record.client_reference}`)
        }

        if (record.internal_reference) {
          lines.push(`Internal Ref: ${record.internal_reference}`)
        }

        return {
          text: lines,
          presenter: {
            title: pickString(record.project_number) ?? 'Project',
            subtitle: [
              typeof record.cargo_type === 'string' ? record.cargo_type.toUpperCase() : record.cargo_type,
              record.current_step,
              record.client_name,
            ]
              .filter(Boolean)
              .join(' · '),
            icon: 'package',
            badge: 'Project',
          },
        }
      },

      formatResult: async (ctx: SearchBuildContext) => {
        const statusMap: Record<string, string> = {
          draft: 'Draft',
          plan_route: 'Planning',
          add_cargo: 'Adding Cargo',
          validated: 'Validated',
          confirmed: 'Confirmed',
          in_transit: 'In Transit',
          delivered: 'Delivered',
          completed: 'Completed',
          cancelled: 'Cancelled',
        }

        const currentStep = typeof ctx.record.current_step === 'string' ? ctx.record.current_step : ''
        const status = statusMap[currentStep] || currentStep

        return {
          title: pickString(ctx.record.project_number) ?? 'Project',
          subtitle: [
            typeof ctx.record.cargo_type === 'string' ? ctx.record.cargo_type.toUpperCase() : ctx.record.cargo_type,
            status,
            ctx.record.client_name,
          ]
            .filter(Boolean)
            .join(' · '),
          icon: 'package',
          badge: 'Project',
        }
      },

      resolveUrl: async (ctx: SearchBuildContext) => {
        return `/backend/fms-projects/${ctx.record.id}`
      },

      fieldPolicy: {
        searchable: [
          'project_number',
          'client_name',
          'commodity_description',
          'internal_reference',
          'client_reference',
          'origin_address',
          'destination_address',
          'hs_code',
          'shipment_type',
          'cargo_type',
        ],
        hashOnly: [],
        excluded: [
          'workflow_context',
          'workflow_instance_id',
          'internal_notes',
          'special_instructions',
          'hazmat_details',
        ],
      },
    },
  ],
}

export const config = searchConfig
export default searchConfig
