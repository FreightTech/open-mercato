import type { Knex } from 'knex'

export class Migration20260409000001 {
  async up(knex: Knex): Promise<void> {
    await knex.schema.createTable('document_templates', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.uuid('organization_id').notNullable()
      table.uuid('tenant_id').notNullable()
      table.text('template_type').notNullable()
      table.text('name').notNullable()
      table.text('description').nullable()
      table.jsonb('template_json').notNullable()
      table.text('preview_image_url').nullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('deleted_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      table.index(['organization_id', 'tenant_id'], 'document_templates_scope_idx')
      table.unique(['organization_id', 'tenant_id', 'template_type'], {
        indexName: 'document_templates_scope_type_unique',
      })
    })
  }

  async down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('document_templates')
  }
}
