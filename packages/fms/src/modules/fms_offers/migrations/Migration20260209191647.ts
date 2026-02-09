import { Migration } from '@mikro-orm/migrations';

export class Migration20260209191647 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offer_lines" add column "container_type" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offer_lines" drop column "container_type";`);
  }

}
