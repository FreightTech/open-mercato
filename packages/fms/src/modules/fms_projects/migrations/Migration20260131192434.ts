import { Migration } from '@mikro-orm/migrations';

export class Migration20260131192434 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "contractors" add column "krs" text null, add column "registration_date" text null, add column "pkd_main_code" text null, add column "pkd_main_description" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "contractors" drop column "krs", drop column "registration_date", drop column "pkd_main_code", drop column "pkd_main_description";`);
  }

}
