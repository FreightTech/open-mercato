import type { SearchModuleConfig } from '@open-mercato/shared/modules/search'

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'fms_invoicing:fms_invoicing_invoice',
      enabled: true,
      priority: 7,

      buildSource: async (ctx) => {
        const { record } = ctx
        const lines: string[] = []

        if (record.invoice_number) lines.push(`Invoice: ${record.invoice_number}`)
        if (record.seller_name) lines.push(`Seller: ${record.seller_name}`)
        if (record.seller_tax_id) lines.push(`Seller NIP: ${record.seller_tax_id}`)
        if (record.buyer_name) lines.push(`Buyer: ${record.buyer_name}`)
        if (record.buyer_tax_id) lines.push(`Buyer NIP: ${record.buyer_tax_id}`)
        if (record.notes) lines.push(record.notes as string)

        const title = (record.invoice_number as string) || 'Untitled Invoice'
        const subtitle = [record.seller_name, record.gross_amount, record.currency_code]
          .filter(Boolean)
          .join(' | ')

        return {
          text: lines,
          presenter: {
            title,
            subtitle: subtitle || undefined,
            icon: 'receipt',
            badge: record.status as string,
          },
          checksumSource: [
            record.invoice_number,
            record.seller_name,
            record.buyer_name,
            record.status,
          ]
            .filter(Boolean)
            .join('|'),
        }
      },

      formatResult: async (ctx) => {
        const { record } = ctx
        return {
          title: (record.invoice_number as string) || 'Untitled Invoice',
          subtitle: (record.seller_name as string) || undefined,
          icon: 'receipt',
          badge: record.status as string,
        }
      },

      resolveUrl: async (ctx) => {
        return `/backend/fms-invoicing?id=${ctx.record.id}`
      },

      fieldPolicy: {
        searchable: [
          'invoice_number',
          'seller_name',
          'seller_tax_id',
          'buyer_name',
          'buyer_tax_id',
          'notes',
          'source_import_reference',
        ],
        hashOnly: [],
        excluded: [
          'id',
          'organization_id',
          'tenant_id',
          'attachment_id',
          'metadata',
          'deleted_at',
        ],
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
