import { Migration } from '@mikro-orm/migrations';

export class Migration20260201193214 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column if not exists "invoicing_status" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_projects" drop column if exists "invoicing_status";`);
  }

}
