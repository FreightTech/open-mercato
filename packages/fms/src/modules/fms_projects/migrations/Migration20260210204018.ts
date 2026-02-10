import { Migration } from '@mikro-orm/migrations';

export class Migration20260210204018 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_rfqs" add column if not exists "contractor_id" uuid null, add column if not exists "contact_person_id" uuid null;`);

    this.addSql(`alter table "fms_offers" add column if not exists "contractor_id" uuid null, add column if not exists "contact_person_id" uuid null, add column if not exists "billing_address_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_rfqs" drop column "contractor_id", drop column "contact_person_id";`);

    this.addSql(`alter table "fms_offers" drop column "contractor_id", drop column "contact_person_id", drop column "billing_address_id";`);
  }

}
