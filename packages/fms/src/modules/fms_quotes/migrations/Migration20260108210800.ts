import { Migration } from '@mikro-orm/migrations';

export class Migration20260108210800 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quotes" add column if not exists "client_name" text null, add column if not exists "container_count" int null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quotes" drop column if exists "client_name", drop column if exists "container_count";`);
  }

}
