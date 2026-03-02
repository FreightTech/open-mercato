import { Migration } from '@mikro-orm/migrations'

export class Migration20260227100000_offer_rfq_id_nullable extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "frc_offers" alter column "rfq_id" drop not null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "frc_offers" alter column "rfq_id" set not null;`)
  }
}
