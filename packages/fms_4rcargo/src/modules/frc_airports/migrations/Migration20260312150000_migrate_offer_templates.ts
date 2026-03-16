import { Migration } from '@mikro-orm/migrations'

/**
 * Migration to migrate default 4R Cargo offer templates to FMS email_templates system.
 * 
 * This migration:
 * 1. Finds all default, active offer templates in frc_offer_templates
 * 2. Creates corresponding entries in fms_email_templates with templateType='offer'
 * 3. Only migrates if no 'offer' template already exists for that org/tenant
 * 
 * Note: The frc_offer_templates table is NOT dropped - it's soft-deprecated.
 * This allows for safe rollback if needed.
 */
export class Migration20260312150000_migrate_offer_templates extends Migration {
  override async up(): Promise<void> {
    // Get all default, active offer templates
    const defaultTemplates = await this.execute(`
      SELECT organization_id, tenant_id, subject_template, content_template
      FROM frc_offer_templates
      WHERE is_default = true AND is_active = true
    `) as Array<{
      organization_id: string
      tenant_id: string
      subject_template: string
      content_template: string
    }>

    if (defaultTemplates.length === 0) {
      console.log('[Migration] No default offer templates found to migrate')
      return
    }

    console.log(`[Migration] Found ${defaultTemplates.length} default offer templates to migrate`)

    for (const template of defaultTemplates) {
      // Check if an 'offer' template already exists for this org/tenant
      const existing = await this.execute(`
        SELECT id FROM fms_email_templates
        WHERE organization_id = ? AND tenant_id = ? AND template_type = 'offer'
      `, [template.organization_id, template.tenant_id]) as Array<{ id: string }>

      if (existing.length > 0) {
        console.log(`[Migration] Offer template already exists for org ${template.organization_id}, skipping`)
        continue
      }

      // Insert into fms_email_templates
      await this.execute(`
        INSERT INTO fms_email_templates 
        (id, organization_id, tenant_id, template_type, subject_template, html_template, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), ?, ?, 'offer', ?, ?, true, NOW(), NOW())
      `, [
        template.organization_id,
        template.tenant_id,
        template.subject_template,
        template.content_template,
      ])

      console.log(`[Migration] Migrated offer template for org ${template.organization_id}`)
    }

    console.log('[Migration] Template migration complete')
  }

  override async down(): Promise<void> {
    // Note: We don't delete the migrated templates on down()
    // because we can't reliably identify which ones were migrated vs. created directly
    // The original frc_offer_templates data is preserved for manual rollback if needed
    console.log('[Migration] Down migration is a no-op - frc_offer_templates data is preserved')
  }
}
