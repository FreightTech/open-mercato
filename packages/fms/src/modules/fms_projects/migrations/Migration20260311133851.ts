import { Migration } from '@mikro-orm/migrations';

export class Migration20260311133851 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_project_notes" add column "attachment_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_project_notes" drop column "attachment_id";`);
  }

}
