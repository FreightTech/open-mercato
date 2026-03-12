import { Migration } from '@mikro-orm/migrations'

export class Migration20260224100000_offer_valid_until_notes extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "frc_offers" add column "valid_until" date null;`)
    this.addSql(`alter table "frc_offers" add column "notes" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "frc_offers" drop column "valid_until";`)
    this.addSql(`alter table "frc_offers" drop column "notes";`)
  }
}
