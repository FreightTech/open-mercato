import { Migration } from '@mikro-orm/migrations';

export class Migration20260116095426 extends Migration {

  override async up(): Promise<void> {
    // Rename all 4 shipments tables with fms_ prefix
    this.addSql('ALTER TABLE "shipments" RENAME TO "fms_shipments";');
    this.addSql('ALTER TABLE "shipment_containers" RENAME TO "fms_shipment_containers";');
    this.addSql('ALTER TABLE "shipment_documents" RENAME TO "fms_shipment_documents";');
    this.addSql('ALTER TABLE "shipment_tasks" RENAME TO "fms_shipment_tasks";');

    // PostgreSQL automatically updates FK references on table rename
    // No additional FK constraint updates needed

    console.log('✓ Successfully renamed shipments tables to fms_ prefix');
  }

  override async down(): Promise<void> {
    // Rollback: rename back to original names
    this.addSql('ALTER TABLE "fms_shipments" RENAME TO "shipments";');
    this.addSql('ALTER TABLE "fms_shipment_containers" RENAME TO "shipment_containers";');
    this.addSql('ALTER TABLE "fms_shipment_documents" RENAME TO "shipment_documents";');
    this.addSql('ALTER TABLE "fms_shipment_tasks" RENAME TO "shipment_tasks";');

    console.log('✓ Rolled back table names to original');
  }
}
