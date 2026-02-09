import { Migration } from '@mikro-orm/migrations';

export class Migration20260207185538 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_rfqs" add column "status" text not null default 'incoming', add column "assigned_to_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_rfqs" drop column "status", drop column "assigned_to_id";`);
  }

}
