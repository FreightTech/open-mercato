import { Migration } from '@mikro-orm/migrations';

export class Migration20260209155944 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_carriers" drop constraint if exists "fms_carriers_code_unique";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_carriers" add constraint "fms_carriers_code_unique" unique ("organization_id", "tenant_id", "code");`);
  }

}
