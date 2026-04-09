import type { Knex } from 'knex'

export class Migration20260409000002 {
  async up(knex: Knex): Promise<void> {
    await knex.schema.createTable('documents', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))

      table.uuid('organization_id').notNullable()
      table.uuid('tenant_id').notNullable()

      table.text('name').notNullable()
      table.text('category').notNullable().defaultTo('other')
      table.text('description')

      table.uuid('attachment_id').notNullable()

      table.uuid('related_entity_id')
      table.text('related_entity_type')

      table.jsonb('extracted_data')

      table.timestamp('processed_at', { useTz: true })
      table.text('processing_status').notNullable().defaultTo('pending')
      table.integer('retry_count').notNullable().defaultTo(0)
      table.text('last_error')
      table.jsonb('processing_result')

      table.decimal('consensus_confidence', 3, 2)
      table.text('consensus_recommendation')

      table.text('document_type')
      table.integer('document_type_confidence')

      // Identifiers
      table.text('document_number')
      table.date('document_date')
      table.text('bl_number')
      table.text('mbl_number')
      table.text('booking_number')
      table.jsonb('container_numbers')
      table.text('vessel_name')
      table.text('voyage_number')
      table.text('port_of_loading')
      table.text('port_of_discharge')
      table.text('currency')
      table.text('seller_name')
      table.text('buyer_name')
      table.decimal('total_gross_amount', 18, 2)

      // Data fields
      table.text('raw_text')
      table.jsonb('document_data')

      // Edit tracking
      table.uuid('edited_by')
      table.timestamp('edited_at', { useTz: true })

      // Bundle support
      table.uuid('parent_document_id').references('id').inTable('documents').onDelete('SET NULL')

      // Timestamps
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.uuid('created_by')
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.uuid('updated_by')
      table.timestamp('deleted_at', { useTz: true })

      // Indexes
      table.index(['organization_id', 'tenant_id'], 'documents_scope_idx')
      table.index(['category'], 'documents_category_idx')
      table.index(['attachment_id'], 'documents_attachment_idx')
      table.index(['related_entity_id', 'related_entity_type'], 'documents_related_entity_idx')
      table.index(['bl_number'], 'documents_bl_number_idx')
      table.index(['mbl_number'], 'documents_mbl_number_idx')
      table.index(['booking_number'], 'documents_booking_number_idx')
      table.index(['parent_document_id'], 'documents_parent_idx')
    })

    await knex.schema.createTable('document_pages', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))

      table.uuid('organization_id').notNullable()
      table.uuid('tenant_id').notNullable()

      table.uuid('document_id').notNullable().references('id').inTable('documents').onDelete('CASCADE')

      table.integer('page_number').notNullable()
      table.text('storage_path').notNullable()
      table.text('storage_driver').notNullable().defaultTo('local')

      table.integer('width')
      table.integer('height')
      table.integer('file_size')

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(['organization_id', 'tenant_id'], 'document_pages_scope_idx')
      table.index(['document_id'], 'document_pages_document_idx')
    })
  }

  async down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('document_pages')
    await knex.schema.dropTableIfExists('documents')
  }
}

export default Migration20260409000002
