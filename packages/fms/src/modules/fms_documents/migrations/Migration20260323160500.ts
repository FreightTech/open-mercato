import { Migration } from '@mikro-orm/migrations';

export class Migration20260323160500 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_documents" add column "retry_count" int not null default 0, add column "last_error" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_documents" drop column "retry_count", drop column "last_error";`);
  }

}
