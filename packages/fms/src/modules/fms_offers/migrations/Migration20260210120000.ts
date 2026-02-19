import { Migration } from '@mikro-orm/migrations';

export class Migration20260210120000 extends Migration {

  override async up(): Promise<void> {
    // Add contractor/contact FK columns to fms_rfqs
    this.addSql(`alter table "fms_rfqs" add column "contractor_id" uuid null;`);
    this.addSql(`alter table "fms_rfqs" add column "contact_person_id" uuid null;`);

    // Add contractor/contact/billing FK columns to fms_offers
    this.addSql(`alter table "fms_offers" add column "contractor_id" uuid null;`);
    this.addSql(`alter table "fms_offers" add column "contact_person_id" uuid null;`);
    this.addSql(`alter table "fms_offers" add column "billing_address_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_rfqs" drop column if exists "contractor_id";`);
    this.addSql(`alter table "fms_rfqs" drop column if exists "contact_person_id";`);

    this.addSql(`alter table "fms_offers" drop column if exists "contractor_id";`);
    this.addSql(`alter table "fms_offers" drop column if exists "contact_person_id";`);
    this.addSql(`alter table "fms_offers" drop column if exists "billing_address_id";`);
  }

}
