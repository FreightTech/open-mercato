import { Migration } from '@mikro-orm/migrations';

/**
 * Add seals column to shipment_tracking_shipments table.
 * Stores aggregated seal information (all unique seals seen across all cargo events).
 * Each seal entry has: number, source (CAR/SHI/TER/CUS), type.
 */
export class Migration20260227100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "shipment_tracking_shipments" ADD COLUMN "seals" jsonb NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "shipment_tracking_shipments" DROP COLUMN "seals";`);
  }
}
