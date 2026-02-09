import { Migration } from '@mikro-orm/migrations'

export class Migration20260121100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" add column if not exists "provider_id" uuid null;`)
    this.addSql(`create index if not exists "fms_quote_lines_provider_idx" on "fms_quote_lines" ("provider_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fms_quote_lines_provider_idx";`)
    this.addSql(`alter table "fms_quote_lines" drop column if exists "provider_id";`)
  }
}
