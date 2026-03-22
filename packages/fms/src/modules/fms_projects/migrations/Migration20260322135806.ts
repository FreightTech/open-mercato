import { Migration } from '@mikro-orm/migrations';

export class Migration20260322135806 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_project_lines" add column "invoiced_cost" numeric(18,4) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_project_lines" drop column "invoiced_cost";`);
  }

}
