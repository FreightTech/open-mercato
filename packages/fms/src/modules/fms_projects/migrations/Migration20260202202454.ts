import { Migration } from '@mikro-orm/migrations';

export class Migration20260202202454 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column "operational_guardian_id" uuid null, add column "business_guardian_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column "operational_guardian_id", drop column "business_guardian_id";`);
  }

}
