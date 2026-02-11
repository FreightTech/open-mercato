import { Migration } from '@mikro-orm/migrations';

export class Migration20260211123046 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "frc_projects" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_number" text not null, "rfq_id" uuid null, "quote_id" uuid null, "account_id" uuid null, "status" text not null default 'active', "total_value" numeric(18,4) null, "currency_code" text not null default 'EUR', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_projects_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_projects_account_idx" on "frc_projects" ("organization_id", "tenant_id", "account_id");`);
    this.addSql(`create index "frc_projects_status_idx" on "frc_projects" ("organization_id", "tenant_id", "status");`);
    this.addSql(`create index "frc_projects_org_tenant_idx" on "frc_projects" ("organization_id", "tenant_id");`);
  }

}
