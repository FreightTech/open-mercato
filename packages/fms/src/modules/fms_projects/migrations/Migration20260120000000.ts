import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Create fms_project_lines table
 *
 * Financial tracking for project-level product lines
 * Supports both offer-sourced lines and manually added lines
 */
export class Migration20260120000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fms_project_lines" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "project_id" uuid not null,
        "line_number" integer not null default 0,
        "source_offer_line_id" uuid null,
        "source_type" text not null default 'manual',
        "product_name" text not null,
        "charge_code" text null,
        "container_size" text null,
        "quantity" numeric(18, 4) not null default '1',
        "currency_code" text not null default 'USD',
        "sold_unit_price" numeric(18, 4) not null default '0',
        "sold_amount" numeric(18, 4) not null default '0',
        "actual_unit_cost" numeric(18, 4) null,
        "actual_cost" numeric(18, 4) null,
        "notes" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "fms_project_lines_pkey" primary key ("id"),
        constraint "fms_project_lines_project_fkey" foreign key ("project_id") references "fms_projects" ("id") on delete cascade
      );
    `)

    // Create indexes
    this.addSql(`
      create index if not exists "fms_project_lines_org_tenant_idx"
      on "fms_project_lines" ("organization_id", "tenant_id");
    `)

    this.addSql(`
      create index if not exists "fms_project_lines_project_idx"
      on "fms_project_lines" ("project_id");
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fms_project_lines" cascade;`)
  }
}
