import { Migration } from '@mikro-orm/migrations';

export class Migration20260119120000 extends Migration {

  override async up(): Promise<void> {
    // Add sent_at column to fms_offers to record exact send timestamp
    this.addSql(`alter table "fms_offers" add column if not exists "sent_at" timestamptz null;`);

    // Index for pending offers query (status = 'sent', ordered by sent_at)
    this.addSql(`create index if not exists "fms_offers_pending_idx" on "fms_offers" ("organization_id", "tenant_id", "status", "sent_at") where "status" = 'sent' and "deleted_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fms_offers_pending_idx";`);
    this.addSql(`alter table "fms_offers" drop column if exists "sent_at";`);
  }

}
