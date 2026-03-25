/**
 * FMS Files Module - Search Configuration
 * Enables Cmd+K global search for FMS files (teczki).
 *
 * Indexes FmsFile records with reference number, cargo type, shipment type,
 * contractor name (resolved via queryEngine), and free-text notes.
 */

import type { SearchModuleConfig, SearchBuildContext } from '@open-mercato/shared/modules/search'
import { E } from '#generated/entities.ids.generated'

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
      entityId: E.fms_files.fms_file,
      enabled: true,
      priority: 14, // Above fms_projects (12) — files are the primary operational entity

      buildSource: async (ctx: SearchBuildContext) => {
        const record = ctx.record
        const lines: string[] = []

        // Primary identifier
        if (record.reference_number) {
          lines.push(`File: ${record.reference_number}`)
        }

        // Cargo and shipment classification
        if (record.cargo_type) {
          lines.push(`Cargo: ${String(record.cargo_type).toUpperCase()}`)
        }
        if (record.shipment_type) {
          lines.push(`Type: ${record.shipment_type}`)
        }

        // Resolve contractor name via query engine
        let contractorName: string | null = null
        if (ctx.queryEngine && record.contractor_id) {
          const result = await (ctx.queryEngine as any).query(E.contractors.contractor, {
            tenantId: ctx.tenantId,
            filters: { id: record.contractor_id },
          })
          contractorName = pickString((result.items[0] as any)?.name)
          if (contractorName) lines.push(`Client: ${contractorName}`)
        }

        // Free-text notes
        if (record.notes) {
          lines.push(`Notes: ${record.notes}`)
        }

        if (!lines.length) return null

        return {
          text: lines,
          presenter: {
            title: pickString(record.reference_number) ?? 'FMS File',
            subtitle: [
              typeof record.cargo_type === 'string' ? record.cargo_type.toUpperCase() : null,
              typeof record.shipment_type === 'string' ? record.shipment_type : null,
              contractorName,
            ]
              .filter(Boolean)
              .join(' · '),
            icon: 'lucide:folder',
            badge: 'FMS File',
          },
          checksumSource: {
            record,
            customFields: ctx.customFields,
          },
        }
      },

      formatResult: async (ctx: SearchBuildContext) => {
        return {
          title: pickString(ctx.record.reference_number) ?? 'FMS File',
          subtitle: [
            typeof ctx.record.cargo_type === 'string' ? ctx.record.cargo_type.toUpperCase() : null,
            typeof ctx.record.shipment_type === 'string' ? ctx.record.shipment_type : null,
          ]
            .filter(Boolean)
            .join(' · '),
          icon: 'lucide:folder',
          badge: 'FMS File',
        }
      },

      resolveUrl: async (ctx: SearchBuildContext) => {
        return `/backend/fms-files/${ctx.record.id}`
      },

      fieldPolicy: {
        searchable: [
          'reference_number',
          'cargo_type',
          'shipment_type',
          'notes',
        ],
        hashOnly: [],
        excluded: [
          'organization_id',
          'tenant_id',
          'contractor_id',
          'assignee_id',
          'created_by',
          'updated_by',
        ],
      },
    },

    // ── FmsFileUnit — container / commodity search ────────────────────────────
    // Searching by container number returns a result that navigates to the
    // parent file. Useful for "which file has container MSCU1234567?".
    {
      entityId: E.fms_files.fms_file_unit,
      enabled: true,
      priority: 13, // Just below fms_file so files appear first in mixed results

      buildSource: async (ctx: SearchBuildContext) => {
        const record = ctx.record
        const lines: string[] = []

        if (record.container_number) {
          lines.push(`Container: ${record.container_number}`)
        }
        if (record.container_type) {
          lines.push(`Type: ${record.container_type}`)
        }
        if (record.commodity_description) {
          lines.push(`Commodity: ${record.commodity_description}`)
        }
        if (record.cargo_type) {
          lines.push(`Cargo: ${String(record.cargo_type).toUpperCase()}`)
        }

        // Resolve parent file reference number for context
        let fileRef: string | null = null
        if (ctx.queryEngine && record.file_id) {
          const result = await (ctx.queryEngine as any).query(E.fms_files.fms_file, {
            tenantId: ctx.tenantId,
            filters: { id: record.file_id },
          })
          fileRef = pickString((result.items[0] as any)?.reference_number)
          if (fileRef) lines.push(`File: ${fileRef}`)
        }

        if (!lines.length) return null

        const title = pickString(record.container_number, record.commodity_description) ?? 'Unit'

        return {
          text: lines,
          presenter: {
            title,
            subtitle: [
              record.container_type,
              fileRef,
            ].filter(Boolean).join(' · '),
            icon: 'lucide:container',
            badge: 'Container',
          },
          checksumSource: {
            record,
            customFields: ctx.customFields,
          },
        }
      },

      formatResult: async (ctx: SearchBuildContext) => {
        return {
          title: pickString(ctx.record.container_number, ctx.record.commodity_description) ?? 'Unit',
          subtitle: typeof ctx.record.container_type === 'string' ? ctx.record.container_type : undefined,
          icon: 'lucide:container',
          badge: 'Container',
        }
      },

      resolveUrl: async (ctx: SearchBuildContext) => {
        // Navigate to the parent file, not the unit itself
        return `/backend/fms-files/${ctx.record.file_id}`
      },

      fieldPolicy: {
        searchable: [
          'container_number',
          'container_type',
          'commodity_description',
          'cargo_type',
        ],
        hashOnly: [],
        excluded: [
          'organization_id',
          'tenant_id',
          'file_id',
          'origin_location_id',
          'destination_location_id',
          'created_by',
          'updated_by',
          'packages_detail',
        ],
      },
    },
  ],
}

export const config = searchConfig
export default searchConfig
