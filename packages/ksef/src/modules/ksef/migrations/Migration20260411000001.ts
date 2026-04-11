import { Migration } from '@mikro-orm/migrations'

/**
 * Dedicated `ksef_company_profiles` table.
 *
 * Earlier versions stored the White List company profile inside the
 * integrations credentials blob. That caused validation failures on
 * the credentials round-trip and mixed public metadata with secrets.
 * Moving the profile to its own tenant-scoped table decouples the
 * concerns; legacy data is migrated forward lazily on first read.
 */
export class Migration20260411000001 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ksef_company_profiles" (
      "id" uuid not null default gen_random_uuid(),
      "tenant_id" uuid not null,
      "organization_id" uuid null,
      "nip" text not null,
      "profile_data" jsonb not null,
      "fetched_at" timestamptz not null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "ksef_company_profiles_pkey" primary key ("id")
    );`)
    this.addSql(`create index if not exists "ksef_company_profiles_tenant_idx" on "ksef_company_profiles" ("tenant_id");`)
    this.addSql(`alter table "ksef_company_profiles" add constraint "ksef_company_profiles_tenant_uniq" unique ("tenant_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ksef_company_profiles" cascade;`)
  }
}
