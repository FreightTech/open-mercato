import { Migration } from '@mikro-orm/migrations'

/**
 * Makes rfq_id nullable in frc_air_cargo table.
 * This allows creating standalone air cargo records without linking to an RFQ.
 */
export class Migration20260218150000_air_cargo_rfq_nullable extends Migration {
  override async up(): Promise<void> {
    // Drop the existing foreign key constraint
    this.addSql(`alter table "frc_air_cargo" drop constraint if exists "frc_air_cargo_rfq_id_foreign";`)

    // Make rfq_id nullable
    this.addSql(`alter table "frc_air_cargo" alter column "rfq_id" drop not null;`)

    // Re-add foreign key constraint with ON DELETE SET NULL
    this.addSql(
      `alter table "frc_air_cargo" add constraint "frc_air_cargo_rfq_id_foreign" foreign key ("rfq_id") references "frc_rfqs" ("id") on update cascade on delete set null;`
    )
  }

  override async down(): Promise<void> {
    // Note: This will fail if there are any NULL rfq_id values
    // Drop the foreign key constraint
    this.addSql(`alter table "frc_air_cargo" drop constraint if exists "frc_air_cargo_rfq_id_foreign";`)

    // Make rfq_id required again (will fail if NULLs exist)
    this.addSql(`alter table "frc_air_cargo" alter column "rfq_id" set not null;`)

    // Re-add foreign key constraint without ON DELETE SET NULL
    this.addSql(
      `alter table "frc_air_cargo" add constraint "frc_air_cargo_rfq_id_foreign" foreign key ("rfq_id") references "frc_rfqs" ("id") on update cascade;`
    )
  }
}
