import { Migration } from '@mikro-orm/migrations';

/**
 * Add iso_equipment_code column to shipment_tracking_shipments table.
 * Stores the ISO 6346 equipment type code (e.g., 22G1, 45R1) for the container.
 */
export class Migration20260225110000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "shipment_tracking_shipments" ADD COLUMN "iso_equipment_code" text NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "shipment_tracking_shipments" DROP COLUMN "iso_equipment_code";`);
  }
}
