import { Migration } from '@mikro-orm/migrations';

export class Migration20260119130000 extends Migration {

  override async up(): Promise<void> {
    // Add sent_to_email column to fms_offers to record the email address used when sending
    this.addSql(`alter table "fms_offers" add column if not exists "sent_to_email" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column if exists "sent_to_email";`);
  }

}
